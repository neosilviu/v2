import type { AgentAiEnv } from "./env";

export type AgentSessionUser = { id: string; email: string; name?: string };

function csv(input?: string): string[] {
  return (input ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

export function allowedOrigins(env: AgentAiEnv): string[] {
  return [...new Set([...csv(env.APP_ORIGIN), ...csv(env.TRUSTED_ORIGINS)])];
}

export function isInternalRequest(request: Request): boolean {
  return new URL(request.url).hostname === "agent.internal" && !request.headers.has("origin");
}

export async function readSession(env: AgentAiEnv, headers: Headers): Promise<AgentSessionUser | null> {
  try {
    const response = await env.AUTH.fetch("https://auth.internal/api/auth/get-session", { headers });
    if (!response.ok) return null;
    const payload = await response.json() as { user?: AgentSessionUser | null } | null;
    return payload?.user?.id && payload.user.email ? payload.user : null;
  } catch {
    return null;
  }
}
