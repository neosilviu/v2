import type { Fetcher } from "@cloudflare/workers-types";
export type ProviderAccessEnv = { AUTH?: Fetcher; APP_ORIGIN?: string; TRUSTED_ORIGINS?: string };
export type ProviderSessionUser = { id: string; email: string; name?: string };
const csv = (value?: string) => (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
export const allowedOrigins = (env: ProviderAccessEnv) => [...new Set([...csv(env.APP_ORIGIN), ...csv(env.TRUSTED_ORIGINS)])];
export const isInternalRequest = (request: Request) => new URL(request.url).hostname === "providers.internal" && !request.headers.has("origin");
export async function readSession(env: ProviderAccessEnv, headers: Headers): Promise<ProviderSessionUser | null> {
  if (!env.AUTH) return null;
  try { const response = await env.AUTH.fetch("https://auth.internal/api/auth/get-session", { headers }); if (!response.ok) return null; const data = await response.json() as { user?: ProviderSessionUser | null } | null; return data?.user?.id && data.user.email ? data.user : null; } catch { return null; }
}
