import { authPolicySchema, authPublicLoginConfigSchema, type AuthMethod, type AuthPolicy, type AuthPublicLoginConfig, type AuthUiContribution } from "@v2/auth-contracts";
import { authUrl } from "./auth-client";

export async function loadLoginConfig(workspaceId = "default"): Promise<AuthPublicLoginConfig> {
  const url = new URL("/public/auth/login-config", authUrl);
  url.searchParams.set("workspaceId", workspaceId);
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Auth login config failed: ${response.status}`);
  return authPublicLoginConfigSchema.parse(await response.json());
}

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, authUrl), { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  if (!response.ok) throw new Error(`Auth request failed: ${response.status}`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export type AuthSecuritySummary = {
  policy: AuthPolicy;
  methods: AuthMethod[];
  publishedLoginContributions: number;
  serverSideAvailability: { password: boolean; passkey: boolean; github: boolean };
  emailDelivery: { verification: boolean; passwordReset: boolean; status: string };
  bootstrapAdmin: boolean;
};

export async function loadAuthSecuritySummary(workspaceId = "default"): Promise<AuthSecuritySummary> {
  return (await authJson<{ summary: AuthSecuritySummary }>(`/admin/auth/security-summary?workspaceId=${encodeURIComponent(workspaceId)}`)).summary;
}

export async function loadAuthSessionsSummary(workspaceId = "default"): Promise<{ sessions: number; passkeys: number }> {
  return (await authJson<{ summary: { sessions: number; passkeys: number } }>(`/admin/auth/sessions/summary?workspaceId=${encodeURIComponent(workspaceId)}`)).summary;
}

export async function saveAuthPolicy(policy: AuthPolicy, workspaceId = "default"): Promise<AuthPolicy> {
  const result = await authJson<{ policy: AuthPolicy }>("/admin/auth/policy", { method: "PUT", body: JSON.stringify({ workspaceId, registrationMode: policy.registrationMode, requireEmailVerification: policy.requireEmailVerification, allowPasskeyRegistration: policy.allowPasskeyRegistration, allowPasskeySignin: policy.allowPasskeySignin }) });
  return authPolicySchema.parse(result.policy);
}

export async function saveAuthMethod(method: AuthMethod, workspaceId = "default"): Promise<AuthMethod> {
  return (await authJson<{ method: AuthMethod }>(`/admin/auth/methods/${encodeURIComponent(method.id)}`, { method: "PUT", body: JSON.stringify({ workspaceId: method.workspaceId ?? null, type: method.type, providerId: method.providerId, title: method.title, status: method.status, publicVisible: method.publicVisible, displayOrder: method.displayOrder }) })).method;
}

export async function loadAuthUiContributions(workspaceId = "default"): Promise<AuthUiContribution[]> {
  return (await authJson<{ contributions: AuthUiContribution[] }>(`/admin/auth/ui-contributions?workspaceId=${encodeURIComponent(workspaceId)}`)).contributions;
}

export async function updateAuthProfile(input: { name: string }): Promise<void> {
  await authJson<unknown>("/api/auth/update-user", { method: "POST", body: JSON.stringify({ name: input.name.trim() || null }) });
}

export async function signOutAuth(): Promise<void> {
  const response = await fetch(new URL("/api/auth/sign-out", authUrl), { method: "POST", credentials: "include", headers: { "content-type": "application/json" } });
  if (!response.ok) throw new Error(`Auth sign out failed: ${response.status}`);
}
