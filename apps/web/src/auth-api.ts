import { hc } from "hono/client";
import { authPublicLoginConfigSchema, ownerSetupSignupRequestSchema, type AuthPublicLoginConfig } from "@v2/auth-contracts";
import { errorResponseSchema } from "@v2/rpc-contracts";
import { authUrl } from "./auth-client";

type HonoRequestArgs = {
  param?: Record<string, string>;
  query?: Record<string, unknown>;
  json?: unknown;
  body?: BodyInit | null;
  headers?: HeadersInit;
};
type HonoRoute = {
  $get(args?: HonoRequestArgs): Promise<Response>;
  $post(args?: HonoRequestArgs): Promise<Response>;
  $put(args?: HonoRequestArgs): Promise<Response>;
  $delete(args?: HonoRequestArgs): Promise<Response>;
};
type AuthApiClient = {
  public: { auth: { "login-config": HonoRoute; profile: HonoRoute } };
  api: { auth: { "update-user": { $post(args?: HonoRequestArgs): Promise<Response> }; "sign-in": { email: { $post(args?: HonoRequestArgs): Promise<Response> } }; "sign-out": { $post(args?: HonoRequestArgs): Promise<Response> } } };
  setup: { owner: { "sign-up": { email: { $post(args?: HonoRequestArgs): Promise<Response> } } } };
};
export const authApi = hc(authUrl, { init: { credentials: "include" } }) as unknown as AuthApiClient;
const loginConfigCache = new Map<string, Promise<AuthPublicLoginConfig>>();

export class AuthRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "AuthRequestError";
  }
}

async function parseAuthError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return new AuthRequestError(response.status, undefined, `Auth request failed: ${response.status}`);
  try {
    const payload = JSON.parse(text) as unknown;
    const parsed = errorResponseSchema.safeParse(payload);
    if (parsed.success) return new AuthRequestError(response.status, parsed.data.error.code, parsed.data.error.message);
    const fallback = payload as { error?: { code?: unknown; message?: unknown }; code?: unknown; message?: unknown };
    const nested = typeof fallback.error === "object" && fallback.error ? fallback.error as { code?: unknown; message?: unknown } : null;
    const code = typeof fallback.code === "string" ? fallback.code : typeof nested?.code === "string" ? nested.code : undefined;
    const message = typeof fallback.message === "string" ? fallback.message : typeof nested?.message === "string" ? nested.message : `Auth request failed: ${response.status}`;
    return new AuthRequestError(response.status, code, message);
  } catch {
    return new AuthRequestError(response.status, undefined, text || `Auth request failed: ${response.status}`);
  }
}

async function authResponse<T>(request: Promise<Response>, schema: { parse(input: unknown): T }): Promise<T> {
  const response = await request;
  if (!response.ok) throw await parseAuthError(response);
  return schema.parse(await response.json().catch(() => undefined));
}

export async function loadLoginConfig(workspaceId = "default"): Promise<AuthPublicLoginConfig> {
  const key = workspaceId || "default";
  if (!loginConfigCache.has(key)) {
    loginConfigCache.set(key, authResponse(authApi.public.auth["login-config"].$get({ query: { workspaceId } }), authPublicLoginConfigSchema).catch((error) => {
      loginConfigCache.delete(key);
      throw error;
    }));
  }
  return loginConfigCache.get(key)!;
}

export async function ownerSetupSignUp(input: { token: string; email: string; name: string; password: string }): Promise<void> {
  await authResponse(authApi.setup.owner["sign-up"].email.$post({ json: ownerSetupSignupRequestSchema.parse(input) }), { parse: () => undefined });
}

export async function signInEmail(input: { email: string; password: string }): Promise<void> {
  await authResponse(authApi.api.auth["sign-in"].email.$post({ json: input }), { parse: () => undefined });
}

export async function signOutAuth(): Promise<void> {
  await authResponse(authApi.api.auth["sign-out"].$post(), { parse: () => undefined });
}
