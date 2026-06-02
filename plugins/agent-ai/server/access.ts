import { allowedOrigins as sharedAllowedOrigins, isInternalRequest as sharedIsInternalRequest, readSession as sharedReadSession } from "@v2/feedback-runtime";
import type { AgentAiEnv } from "./env";

export type AgentSessionUser = { id: string; email: string; name?: string };

export function allowedOrigins(env: AgentAiEnv): string[] {
  return sharedAllowedOrigins(env.APP_ORIGIN, env.TRUSTED_ORIGINS);
}

export function isInternalRequest(request: Request): boolean {
  return sharedIsInternalRequest(request.url, "agent.internal", request.headers.has("origin"));
}

export async function readSession(env: AgentAiEnv, headers: Headers): Promise<AgentSessionUser | null> {
  return sharedReadSession<AgentSessionUser>(env.AUTH, headers);
}
