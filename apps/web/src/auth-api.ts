import { authPolicySchema, authPublicLoginConfigSchema, type AuthMethod, type AuthPolicy, type AuthPublicLoginConfig, type AuthUiContribution } from "@v2/auth-contracts";
import { authUrl } from "./auth-client";

const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";

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

async function coreJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, coreUrl), { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  if (!response.ok) throw new Error(`Core auth request failed: ${response.status}`);
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
  return (await coreJson<{ summary: AuthSecuritySummary }>(`/workspaces/${encodeURIComponent(workspaceId)}/auth/security-summary`)).summary;
}

export async function loadAuthSessionsSummary(workspaceId = "default"): Promise<{ sessions: number; passkeys: number }> {
  return (await coreJson<{ summary: { sessions: number; passkeys: number } }>(`/workspaces/${encodeURIComponent(workspaceId)}/auth/sessions/summary`)).summary;
}

export async function saveAuthPolicy(policy: AuthPolicy, workspaceId = "default"): Promise<AuthPolicy> {
  const result = await coreJson<{ policy: AuthPolicy }>(`/workspaces/${encodeURIComponent(workspaceId)}/auth/policy`, { method: "PUT", body: JSON.stringify({ workspaceId, registrationMode: policy.registrationMode, requireEmailVerification: policy.requireEmailVerification, allowPasskeyRegistration: policy.allowPasskeyRegistration, allowPasskeySignin: policy.allowPasskeySignin }) });
  return authPolicySchema.parse(result.policy);
}

export async function saveAuthMethod(method: AuthMethod, workspaceId = "default"): Promise<AuthMethod> {
  return (await coreJson<{ method: AuthMethod }>(`/workspaces/${encodeURIComponent(workspaceId)}/auth/methods/${encodeURIComponent(method.id)}`, { method: "PUT", body: JSON.stringify({ workspaceId, type: method.type, providerId: method.providerId, title: method.title, status: method.status, publicVisible: method.publicVisible, displayOrder: method.displayOrder }) })).method;
}

export async function loadAuthUiContributions(workspaceId = "default"): Promise<AuthUiContribution[]> {
  return (await coreJson<{ contributions: AuthUiContribution[] }>(`/workspaces/${encodeURIComponent(workspaceId)}/auth/ui-contributions`)).contributions;
}

export async function updateAuthProfile(input: { name: string }): Promise<void> {
  await authJson<unknown>("/api/auth/update-user", { method: "POST", body: JSON.stringify({ name: input.name.trim() || null }) });
}

export async function signOutAuth(): Promise<void> {
  const response = await fetch(new URL("/api/auth/sign-out", authUrl), { method: "POST", credentials: "include", headers: { "content-type": "application/json" } });
  if (!response.ok) throw new Error(`Auth sign out failed: ${response.status}`);
}
