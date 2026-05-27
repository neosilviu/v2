import { authPolicySchema, authPublicLoginConfigSchema, type AuthMethod, type AuthPolicy, type AuthPublicLoginConfig, type AuthUiContribution } from "@v2/auth-contracts";
import { PlatformApiError, createGeneratedApiClient } from "@v2/api-client";
import { currentWorkspaceId } from "./api";
import { authUrl } from "./auth-client";

const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
const apiClient = createGeneratedApiClient({ coreUrl, authUrl });
const loginConfigCache = new Map<string, Promise<AuthPublicLoginConfig>>();

export class AuthRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "AuthRequestError";
  }
}

async function generated<T>(promise: Promise<unknown>): Promise<T> {
  try {
    return await promise as T;
  } catch (error) {
    if (error instanceof PlatformApiError) throw new AuthRequestError(error.status, error.code, error.message);
    throw error;
  }
}

export async function loadLoginConfig(workspaceId = "default"): Promise<AuthPublicLoginConfig> {
  const key = workspaceId || "default";
  if (!loginConfigCache.has(key)) {
    loginConfigCache.set(key, generated(apiClient.loginConfig({ query: { workspaceId } }))
      .then((payload) => authPublicLoginConfigSchema.parse(payload))
      .catch((error) => {
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
  return (await generated<{ summary: AuthSecuritySummary; sessions: { sessions: number; passkeys: number } }>(apiClient.securityBootstrap({ params: { workspaceId } }))).summary;
}

export async function loadAuthSessionsSummary(workspaceId = currentWorkspaceId()): Promise<{ sessions: number; passkeys: number }> {
  return (await generated<{ sessions: { sessions: number; passkeys: number } }>(apiClient.securityBootstrap({ params: { workspaceId } }))).sessions;
}

export async function saveAuthPolicy(policy: AuthPolicy, workspaceId = currentWorkspaceId()): Promise<AuthPolicy> {
  const result = await generated<{ policy: AuthPolicy }>(apiClient.saveAuthPolicy({ params: { workspaceId }, body: { workspaceId, registrationMode: policy.registrationMode, requireEmailVerification: policy.requireEmailVerification, allowPasskeyRegistration: policy.allowPasskeyRegistration, allowPasskeySignin: policy.allowPasskeySignin } }));
  return authPolicySchema.parse(result.policy);
}

export async function saveAuthMethod(method: AuthMethod, workspaceId = currentWorkspaceId()): Promise<AuthMethod> {
  return (await generated<{ method: AuthMethod }>(apiClient.saveAuthMethod({ params: { workspaceId, methodId: method.id }, body: { workspaceId, type: method.type, providerId: method.providerId, title: method.title, status: method.status, publicVisible: method.publicVisible, displayOrder: method.displayOrder } }))).method;
}

export async function loadAuthUiContributions(workspaceId = currentWorkspaceId()): Promise<AuthUiContribution[]> {
  return (await generated<{ contributions: AuthUiContribution[] }>(apiClient.authUiContributions({ params: { workspaceId } }))).contributions;
}

export async function updateAuthProfile(input: { name: string }): Promise<void> {
  await generated(apiClient.updateUser({ body: { name: input.name.trim() || null } }));
}

export async function ownerSetupSignUp(input: { token: string; email: string; name: string; password: string }): Promise<void> {
  await generated(apiClient.ownerSetupSignup({ body: input }));
}

export async function signInEmail(input: { email: string; password: string }): Promise<void> {
  await generated(apiClient.signInEmail({ body: input }));
}

export async function signOutAuth(): Promise<void> {
  await generated(apiClient.signOut());
}
