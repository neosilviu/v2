import { hc } from "hono/client";
import type { ProviderConnection } from "@v2/provider-contracts";
type AiProvidersApi = typeof import("../server/app").default;
type ProviderApiClient = {
  manage: {
    connections: {
      $get(args: { query: { workspaceId: string } }): Promise<Response>;
      "workers-ai": {
        $post(args: { json: { workspaceId: string; title: string; modelId?: string } }): Promise<Response>;
      };
    };
  };
};

const workspaceId = "default";
const configuredUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_AI_PROVIDERS_API_URL;
const baseUrl = (configuredUrl ?? "http://localhost:8792").replace(/\/$/, "");
const providerApi = hc<AiProvidersApi>(baseUrl, { init: { credentials: "include" } }) as unknown as ProviderApiClient;

async function read<T>(request: Promise<Response>): Promise<T> {
  const response = await request;
  if (!response.ok) throw new Error(`AI Providers request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export const listConnections = async () => (await read<{ connections: ProviderConnection[] }>(providerApi.manage.connections.$get({ query: { workspaceId } }))).connections;
export const addWorkersAiConnection = async (title: string) => (await read<{ connection: ProviderConnection }>(providerApi.manage.connections["workers-ai"].$post({ json: { workspaceId, title } }))).connection;
