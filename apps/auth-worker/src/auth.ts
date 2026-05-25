import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";

export interface AuthEnv {
  AUTH_DB?: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  APP_ORIGIN?: string;
  TRUSTED_ORIGINS?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

export type AuthConfig = {
  db: D1Database;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  production: boolean;
  github?: { clientId: string; clientSecret: string };
};

export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; message: string };

function parseUrl(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name} is required`);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function isLocalOrigin(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".local");
}

function parseOrigins(value: string | undefined): string[] {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function parseAuthConfig(env: AuthEnv): AuthConfigResult {
  try {
    if (!env.AUTH_DB) throw new Error("AUTH_DB binding is required");
    const base = parseUrl(env.BETTER_AUTH_URL, "BETTER_AUTH_URL");
    const appOrigins = parseOrigins(env.APP_ORIGIN);
    const trustedOrigins = unique([base.origin, ...appOrigins, ...parseOrigins(env.TRUSTED_ORIGINS)]);
    for (const origin of trustedOrigins) parseUrl(origin, "trusted origin");
    const production = base.protocol === "https:" && !isLocalOrigin(base);
    if (!env.BETTER_AUTH_SECRET || (production && env.BETTER_AUTH_SECRET.length < 32)) {
      throw new Error("BETTER_AUTH_SECRET must be set server-side and at least 32 characters in production");
    }
    if (production && trustedOrigins.some((origin) => new URL(origin).protocol !== "https:")) {
      throw new Error("Production trusted origins must use HTTPS");
    }
    const hasGithubId = Boolean(env.GITHUB_CLIENT_ID);
    const hasGithubSecret = Boolean(env.GITHUB_CLIENT_SECRET);
    const github = hasGithubId && hasGithubSecret ? { clientId: env.GITHUB_CLIENT_ID as string, clientSecret: env.GITHUB_CLIENT_SECRET as string } : undefined;
    return { ok: true, config: { db: env.AUTH_DB, secret: env.BETTER_AUTH_SECRET, baseURL: base.origin, trustedOrigins, production, ...(github ? { github } : {}) } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid auth configuration" };
  }
}

export function createAuth(config: AuthConfig) {
  const db = drizzle(config.db, { schema });
  const github = config.github ? { github: config.github } : undefined;
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    socialProviders: github,
    advanced: {
      cookiePrefix: "v2-auth",
      useSecureCookies: config.production,
    },
  });
}
