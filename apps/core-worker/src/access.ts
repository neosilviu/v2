import type { CoreEnv } from "./env";

export type CoreSessionUser = {
  id: string;
  email: string;
  name?: string;
};

type SessionEntry = { user: CoreSessionUser | null; expiresAt: number };
const localSessionCache = new Map<string, SessionEntry>();
const LOCAL_SESSION_TTL_MS = 1000;

function csv(input?: string): string[] {
  return (input ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function allowedOrigins(env: CoreEnv): string[] {
  return [...new Set([...csv(env.APP_ORIGIN), ...csv(env.TRUSTED_ORIGINS)])];
}

export function isInternalRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.hostname === "core.internal" && !request.headers.has("origin");
}

function credentialKey(headers: Headers) {
  return headers.get("authorization") ?? headers.get("cookie") ?? "";
}

export async function readSession(env: CoreEnv, headers: Headers): Promise<CoreSessionUser | null> {
  const production = env.ENVIRONMENT === "production";
  const key = production ? "" : credentialKey(headers);
  const now = Date.now();
  if (key) {
    const cached = localSessionCache.get(key);
    if (cached && cached.expiresAt > now) return cached.user;
    if (cached) localSessionCache.delete(key);
  }
  try {
    const sessionHeaders = new Headers();
    const cookie = headers.get("cookie");
    const authorization = headers.get("authorization");
    if (cookie) sessionHeaders.set("cookie", cookie);
    if (authorization) sessionHeaders.set("authorization", authorization);
    const response = await env.AUTH.fetch("https://auth.internal/api/auth/get-session", { headers: sessionHeaders });
    if (!response.ok) return null;
    const result = await response.json() as { user?: CoreSessionUser | null } | null;
    const user = result?.user?.id && result.user.email ? result.user : null;
    if (key) {
      if (localSessionCache.size > 256) localSessionCache.clear();
      localSessionCache.set(key, { user, expiresAt: now + LOCAL_SESSION_TTL_MS });
    }
    return user;
  } catch {
    return null;
  }
}

export function isRecoveryAdmin(env: CoreEnv, user: CoreSessionUser | null): boolean {
  if (!user) return false;
  if (env.RECOVERY_ADMIN_ENABLED !== "true") return false;
  const admins = csv(env.RECOVERY_ADMIN_EMAILS || env.PLATFORM_ADMIN_EMAILS).map((email) => email.toLowerCase());
  return admins.includes(user.email.toLowerCase());
}

export const isPlatformAdmin = isRecoveryAdmin;
