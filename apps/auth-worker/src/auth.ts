import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/d1";
import type { Fetcher } from "@cloudflare/workers-types";
import * as schema from "./db/schema";

export interface AuthEnv {
  AUTH_DB?: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  APP_ORIGIN?: string;
  TRUSTED_ORIGINS?: string;
  DEPLOYMENT_ENV?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  RECOVERY_ADMIN_EMAILS?: string;
  RECOVERY_ADMIN_ENABLED?: string;
  PLATFORM_ADMIN_EMAILS?: string;
  CORE?: Fetcher;
  AUTH_WORKSPACE_ID?: string;
}

export type AuthConfig = {
  db: D1Database;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  production: boolean;
  github?: { clientId: string; clientSecret: string };
  passkey: { rpID: string; rpName: string; origin: string };
  adminEmails: string[];
  recoveryAdminEnabled: boolean;
  core?: Fetcher;
  workspaceId: string;
};

export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; message: string };
type CoreTrustConfig = { baseURL: string | null; trustedOrigins: string[]; passkey: { rpID: string; origin: string } | null };

function parseUrl(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name} is required`);
  try { return new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
}
function isLocalOrigin(url: URL) { return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".local"); }
function parseOrigins(value?: string) { return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean); }
function uniqueLowerEmails(...groups: Array<string[] | undefined>) {
  return [...new Set(groups.flatMap((group) => (group ?? []).map((email) => email.toLowerCase())))];
}
function rpIdFor(url: URL) { return url.hostname === "127.0.0.1" ? "localhost" : url.hostname; }
const developmentSecret = "v2-development-only-auth-secret-change-me";

export function parseAuthConfig(env: AuthEnv): AuthConfigResult {
  try {
    if (!env.AUTH_DB) throw new Error("AUTH_DB binding is required");
    const base = parseUrl(env.BETTER_AUTH_URL, "BETTER_AUTH_URL");
    const trustedOrigins = [...new Set([base.origin, ...parseOrigins(env.APP_ORIGIN), ...parseOrigins(env.TRUSTED_ORIGINS)])];
    for (const origin of trustedOrigins) parseUrl(origin, "trusted origin");
    const production = env.DEPLOYMENT_ENV === "production";
    const secret = env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length >= 32 ? env.BETTER_AUTH_SECRET : production ? "" : developmentSecret;
    if (!secret || secret.length < 32) throw new Error("Authentication signing value must be configured server-side with at least 32 characters");
    if (production && (base.protocol !== "https:" || isLocalOrigin(base))) throw new Error("Production authentication URL must be HTTPS and non-local");
    if (production && trustedOrigins.some((origin) => { const url = new URL(origin); return url.protocol !== "https:" || isLocalOrigin(url); })) throw new Error("Production trusted origins must be HTTPS and non-local");
    const github = env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } : undefined;
    const recoveryAdminEnabled = env.RECOVERY_ADMIN_ENABLED === "true";
    const adminEmails = uniqueLowerEmails(parseOrigins(env.PLATFORM_ADMIN_EMAILS), recoveryAdminEnabled ? parseOrigins(env.RECOVERY_ADMIN_EMAILS) : []);
    return { ok: true, config: { db: env.AUTH_DB, secret, baseURL: base.origin, trustedOrigins, production, ...(github ? { github } : {}), passkey: { rpID: rpIdFor(base), rpName: "v2", origin: base.origin }, adminEmails, recoveryAdminEnabled, ...(env.CORE ? { core: env.CORE } : {}), workspaceId: env.AUTH_WORKSPACE_ID || "default" } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid authentication configuration" };
  }
}

export async function resolveAuthConfig(env: AuthEnv, workspaceId = env.AUTH_WORKSPACE_ID || "default"): Promise<AuthConfigResult> {
  const parsed = parseAuthConfig(env);
  if (!parsed.ok || !env.CORE || !parsed.config.production) return parsed;
  try {
    const response = await env.CORE.fetch(`https://core.internal/internal/workspaces/${encodeURIComponent(workspaceId)}/auth/trust-config`);
    if (!response.ok) return { ok: false, message: "Production authentication trust is not available from Core domains." };
    const trust = await response.json() as CoreTrustConfig;
    if (!trust.baseURL || !trust.passkey) return { ok: false, message: "Production authentication requires an active verified auth domain." };
    const base = parseUrl(trust.baseURL, "Core auth domain");
    const trustedOrigins = [...new Set([base.origin, ...trust.trustedOrigins])];
    for (const origin of trustedOrigins) parseUrl(origin, "Core trusted origin");
    return { ok: true, config: { ...parsed.config, baseURL: base.origin, trustedOrigins, passkey: { ...parsed.config.passkey, rpID: trust.passkey.rpID, origin: trust.passkey.origin }, workspaceId } };
  } catch {
    return { ok: false, message: "Production authentication trust could not be resolved from Core domains." };
  }
}

export async function readAuthUser(config: AuthConfig, headers: Headers) {
  const session = await createAuth(config).api.getSession({ headers });
  return session?.user?.id && session.user.email ? session.user : null;
}

export async function isAuthAdmin(config: AuthConfig, headers: Headers) {
  const user = await readAuthUser(config, headers);
  return Boolean(user && config.adminEmails.includes(user.email.toLowerCase()));
}

export function createAuth(config: AuthConfig) {
  const db = drizzle(config.db, { schema });
  async function sendCoreMail(input: { purpose: "verify_email" | "reset_password"; templateKey: "verify_email" | "reset_password"; to: string; url: string }) {
    if (!config.core) throw new Error("Core Mail Runtime binding is not configured.");
    const response = await config.core.fetch(`https://core.internal/internal/workspaces/${encodeURIComponent(config.workspaceId)}/mail/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose: input.purpose, templateKey: input.templateKey, to: input.to, variables: input.purpose === "verify_email" ? { verificationUrl: input.url } : { resetUrl: input.url } }),
    });
    if (!response.ok) throw new Error("Core Mail Runtime request failed.");
    const result = await response.json() as { ok?: unknown; status?: unknown; errorSafe?: unknown };
    if (result.ok !== true || result.status !== "sent") throw new Error(typeof result.errorSafe === "string" ? result.errorSafe : "Core Mail Runtime did not confirm delivery.");
  }
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    session: { additionalFields: { impersonatedBy: { type: "string", required: false } } },
    emailAndPassword: { enabled: true, sendResetPassword: async ({ user, url }) => { await sendCoreMail({ purpose: "reset_password", templateKey: "reset_password", to: user.email, url }); } },
    emailVerification: { sendVerificationEmail: async ({ user, url }) => { await sendCoreMail({ purpose: "verify_email", templateKey: "verify_email", to: user.email, url }); } },
    plugins: [passkey({ rpID: config.passkey.rpID, rpName: config.passkey.rpName, origin: config.passkey.origin, registration: { requireSession: true } })],
    ...(config.github ? { socialProviders: { github: config.github } } : {}),
    advanced: { cookiePrefix: "v2-auth", useSecureCookies: config.production },
  });
}
