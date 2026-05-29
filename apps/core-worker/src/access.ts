import type { CoreEnv } from "./env";

type PlatformAdminEnv = Pick<CoreEnv, "PLATFORM_ADMIN_EMAILS" | "RECOVERY_ADMIN_EMAILS" | "RECOVERY_ADMIN_ENABLED">;

export type CoreSessionUser = {
  id: string;
  email: string;
  name?: string;
  impersonatedBy?: string | null;
};

type SessionEntry = { user: CoreSessionUser | null; expiresAt: number };
const sessionAssertionCache = new Map<string, SessionEntry>();
const SESSION_ASSERTION_TTL_MS = 30_000;

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

function platformAdminEmails(env: PlatformAdminEnv): string[] {
  return csv(env.PLATFORM_ADMIN_EMAILS).map((email) => email.toLowerCase());
}

function recoveryAdminEmails(env: PlatformAdminEnv): string[] {
  return env.RECOVERY_ADMIN_ENABLED === "true"
    ? csv(env.RECOVERY_ADMIN_EMAILS).map((email) => email.toLowerCase())
    : [];
}

export async function readSession(env: CoreEnv, headers: Headers): Promise<CoreSessionUser | null> {
  const key = credentialKey(headers);
  const now = Date.now();
  if (key) {
    const cached = sessionAssertionCache.get(key);
    if (cached && cached.expiresAt > now) return cached.user;
    if (cached) sessionAssertionCache.delete(key);
  }
  try {
    const sessionHeaders = new Headers();
    const cookie = headers.get("cookie");
    const authorization = headers.get("authorization");
    if (cookie) sessionHeaders.set("cookie", cookie);
    if (authorization) sessionHeaders.set("authorization", authorization);
    const response = await env.AUTH.fetch("https://auth.internal/api/auth/get-session", { headers: sessionHeaders });
    if (!response.ok) return null;
    const result = await response.json() as { session?: { impersonatedBy?: string | null } | null; user?: CoreSessionUser | null } | null;
    const user = result?.user?.id && result.user.email
      ? { ...result.user, impersonatedBy: result.session?.impersonatedBy ?? null }
      : null;
    if (key) {
      if (sessionAssertionCache.size > 256) sessionAssertionCache.clear();
      sessionAssertionCache.set(key, { user, expiresAt: now + SESSION_ASSERTION_TTL_MS });
    }
    return user;
  } catch {
    return null;
  }
}

export function isRecoveryAdmin(env: PlatformAdminEnv, user: CoreSessionUser | null): boolean {
  if (!user) return false;
  return [...recoveryAdminEmails(env), ...platformAdminEmails(env)].includes(user.email.toLowerCase());
}

export function isPlatformAdmin(env: PlatformAdminEnv, user: CoreSessionUser | null): boolean {
  if (!user) return false;
  return [...platformAdminEmails(env), ...recoveryAdminEmails(env)].includes(user.email.toLowerCase());
}
