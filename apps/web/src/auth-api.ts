import { hc } from "hono/client";
import { authPolicySchema, authPublicLoginConfigSchema, type AuthMethod, type AuthPolicy, type AuthPublicLoginConfig, type AuthUiContribution, ownerSetupSignupRequestSchema } from "@v2/auth-contracts";
import { errorResponseSchema } from "@v2/rpc-contracts";
import { currentWorkspaceId } from "./api";
import { authUrl } from "./auth-client";
import { authSecurityBootstrapSchema, authSecuritySummarySchema } from "./platform-contracts";

export const authApi: any = hc(authUrl, { init: { credentials: "include" } });
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

export type AuthSecuritySummary = {
  policy: AuthPolicy;
  methods: AuthMethod[];
  publishedLoginContributions: number;
  serverSideAvailability: { password: boolean; passkey: boolean; github: boolean };
  emailDelivery: { verification: boolean; passwordReset: boolean; status: string };
  bootstrapAdmin: boolean;
};

export async function loadAuthSecuritySummary(workspaceId = currentWorkspaceId()): Promise<AuthSecuritySummary> {
  return (await authResponse(authApi.workspaces[":workspaceId"].auth["security-bootstrap"].$get({ param: { workspaceId } }), authSecurityBootstrapSchema)).summary;
}

export async function loadAuthSessionsSummary(workspaceId = currentWorkspaceId()): Promise<{ sessions: number; passkeys: number }> {
  return (await authResponse(authApi.workspaces[":workspaceId"].auth["security-bootstrap"].$get({ param: { workspaceId } }), authSecurityBootstrapSchema)).sessions;
}

export async function saveAuthPolicy(policy: AuthPolicy, workspaceId = currentWorkspaceId()): Promise<AuthPolicy> {
  const result = await authResponse(authApi.workspaces[":workspaceId"].auth.policy.$put({ param: { workspaceId }, json: { workspaceId, registrationMode: policy.registrationMode, requireEmailVerification: policy.requireEmailVerification, allowPasskeyRegistration: policy.allowPasskeyRegistration, allowPasskeySignin: policy.allowPasskeySignin } }), { parse: (value) => value as { policy: AuthPolicy } });
  return authPolicySchema.parse(result.policy);
}

export async function saveAuthMethod(method: AuthMethod, workspaceId = currentWorkspaceId()): Promise<AuthMethod> {
  return (await authResponse(authApi.workspaces[":workspaceId"].auth.methods[":methodId"].$put({ param: { workspaceId, methodId: method.id }, json: { workspaceId, type: method.type, providerId: method.providerId, title: method.title, status: method.status, publicVisible: method.publicVisible, displayOrder: method.displayOrder } }), { parse: (value) => value as { method: AuthMethod } })).method;
}

export async function loadAuthUiContributions(workspaceId = currentWorkspaceId()): Promise<AuthUiContribution[]> {
  return (await authResponse(authApi.workspaces[":workspaceId"].auth["ui-contributions"].$get({ param: { workspaceId } }), { parse: (value) => value as { contributions: AuthUiContribution[] } })).contributions;
}

export async function updateAuthProfile(input: { name: string }): Promise<void> {
  await authResponse(authApi.api.auth["update-user"].$post({ json: { name: input.name.trim() || null } }), { parse: () => undefined });
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
