import { authPublicLoginConfigSchema, type AuthPublicLoginConfig } from "@v2/auth-contracts";
import { authUrl } from "./auth-client";

export async function loadLoginConfig(workspaceId = "default"): Promise<AuthPublicLoginConfig> {
  const url = new URL("/public/auth/login-config", authUrl);
  url.searchParams.set("workspaceId", workspaceId);
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Auth login config failed: ${response.status}`);
  return authPublicLoginConfigSchema.parse(await response.json());
}
