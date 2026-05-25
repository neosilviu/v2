import type { ProviderConnection } from "@v2/provider-contracts";
const workspaceId = "default";
const configuredUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_AI_PROVIDERS_API_URL;
const baseUrl = (configuredUrl ?? "http://localhost:8792").replace(/\/$/, "");
async function json<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${baseUrl}${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init }); if (!response.ok) throw new Error(`AI Providers request failed: ${response.status}`); return response.json() as Promise<T>; }
export const listConnections = async () => (await json<{ connections: ProviderConnection[] }>(`/manage/connections?workspaceId=${workspaceId}`)).connections;
export const addWorkersAiConnection = async (title: string) => (await json<{ connection: ProviderConnection }>("/manage/connections/workers-ai", { method: "POST", body: JSON.stringify({ workspaceId, title }) })).connection;
