import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/d1";

export interface AuthEnv { AUTH_DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL: string; GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string; }
export function createAuth(env: AuthEnv) {
  const github = env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } } : undefined;
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(drizzle(env.AUTH_DB), { provider: "sqlite" }),
    emailAndPassword: { enabled: true }, socialProviders: github,
  });
}
