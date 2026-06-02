import { allowedOrigins as sharedAllowedOrigins, isInternalRequest as sharedIsInternalRequest, readSession as sharedReadSession } from "@v2/feedback-runtime";
import type { Fetcher } from "@cloudflare/workers-types";

export type ProviderAccessEnv = { AUTH?: Fetcher; APP_ORIGIN?: string; TRUSTED_ORIGINS?: string };
export type ProviderSessionUser = { id: string; email: string; name?: string };

export const allowedOrigins = (env: ProviderAccessEnv) => sharedAllowedOrigins(env.APP_ORIGIN, env.TRUSTED_ORIGINS);
export const isInternalRequest = (request: Request) => sharedIsInternalRequest(request.url, "providers.internal", request.headers.has("origin"));
export async function readSession(env: ProviderAccessEnv, headers: Headers): Promise<ProviderSessionUser | null> {
  return sharedReadSession<ProviderSessionUser>(env.AUTH, headers);
}
