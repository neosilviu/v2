import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/d1";
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
  PLATFORM_ADMIN_EMAILS?: string;
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
};

export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; message: string };

function parseUrl(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name} is required`);
  try { return new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
}
function isLocalOrigin(url: URL) { return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".local"); }
function parseOrigins(value?: string) { return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean); }
function rpIdFor(url: URL) { return url.hostname === "127.0.0.1" ? "localhost" : url.hostname; }

export function parseAuthConfig(env: AuthEnv): AuthConfigResult {
  try {
    if (!env.AUTH_DB) throw new Error("AUTH_DB binding is required");
    const base = parseUrl(env.BETTER_AUTH_URL, "BETTER_AUTH_URL");
    const trustedOrigins = [...new Set([base.origin, ...parseOrigins(env.APP_ORIGIN), ...parseOrigins(env.TRUSTED_ORIGINS)])];
    for (const origin of trustedOrigins) parseUrl(origin, "trusted origin");
    const production = env.DEPLOYMENT_ENV === "production";
    if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error("Authentication signing value must be configured server-side with at least 32 characters");
    if (production && (base.protocol !== "https:" || isLocalOrigin(base))) throw new Error("Production authentication URL must be HTTPS and non-local");
    if (production && trustedOrigins.some((origin) => { const url = new URL(origin); return url.protocol !== "https:" || isLocalOrigin(url); })) throw new Error("Production trusted origins must be HTTPS and non-local");
    const github = env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } : undefined;
    return { ok: true, config: { db: env.AUTH_DB, secret: env.BETTER_AUTH_SECRET, baseURL: base.origin, trustedOrigins, production, ...(github ? { github } : {}), passkey: { rpID: rpIdFor(base), rpName: "v2", origin: base.origin }, adminEmails: parseOrigins(env.PLATFORM_ADMIN_EMAILS).map((email) => email.toLowerCase()) } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid authentication configuration" };
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
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    plugins: [passkey({ rpID: config.passkey.rpID, rpName: config.passkey.rpName, origin: config.passkey.origin, registration: { requireSession: true } })],
    ...(config.github ? { socialProviders: { github: config.github } } : {}),
    advanced: { cookiePrefix: "v2-auth", useSecureCookies: config.production },
  });
}
