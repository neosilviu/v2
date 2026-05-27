import { hc } from "hono/client";
import type { AgentChannel, AgentMessage, AgentProviderBinding, AgentToolCall } from "@v2/agent-contracts";
import type { ProviderConnection } from "@v2/provider-contracts";
import type { AgentAiApi } from "../server/app";

const workspaceId = "default";
const configuredBaseUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_AGENT_AI_API_URL;
const agentUrl = (configuredBaseUrl ?? "http://localhost:8791").replace(/\/$/, "");
type AgentApiClient = {
  workspaces: {
    ":workspaceId": {
      channels: { $get(args: { param: { workspaceId: string } }): Promise<Response> };
      providers: { $get(args: { param: { workspaceId: string } }): Promise<Response> };
    };
  };
  "provider-runtime": { connections: { $get(args: { query: { workspaceId: string } }): Promise<Response> } };
  channels: {
    ":channelId": {
      messages: { $get(args: { param: { channelId: string } }): Promise<Response> };
      "tool-calls": { $get(args: { param: { channelId: string } }): Promise<Response> };
      provider: { $put(args: { param: { channelId: string }; json: { providerId: string | null } }): Promise<Response> };
    };
  };
  providers: { $post(args: { json: { workspaceId: string; contributionId: string; connectionId: string; title: string; model: string } }): Promise<Response> };
  messages: { $post(args: { json: { workspaceId: string; channelId: string; content: string } }): Promise<Response> };
  runs: { $post(args: { json: { workspaceId: string; channelId: string } }): Promise<Response> };
  "tool-calls": {
    $post(args: { json: { workspaceId: string; channelId: string; toolId: string; input: unknown; approvalId?: string } }): Promise<Response>;
    ":toolCallId": { refresh: { $post(args: { param: { toolCallId: string }; json: { workspaceId: string; approvalId?: string } }): Promise<Response> } };
  };
};
const agentApi = hc<AgentAiApi>(agentUrl, { init: { credentials: "include" } }) as unknown as AgentApiClient;

async function read<T>(request: Promise<Response>): Promise<T> {
  const response = await request;
  if (!response.ok) throw new Error(`Agent AI request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export const loadChannels = async () => (await read<{ channels: AgentChannel[] }>(agentApi.workspaces[":workspaceId"].channels.$get({ param: { workspaceId } }))).channels;
export const loadProviderBindings = async () => (await read<{ providers: AgentProviderBinding[] }>(agentApi.workspaces[":workspaceId"].providers.$get({ param: { workspaceId } }))).providers;
export const loadAvailableConnections = async () => (await read<{ connections: ProviderConnection[] }>(agentApi["provider-runtime"].connections.$get({ query: { workspaceId } }))).connections;
export const loadMessages = async (channelId: string) => (await read<{ messages: AgentMessage[] }>(agentApi.channels[":channelId"].messages.$get({ param: { channelId } }))).messages;
export const loadToolCalls = async (channelId: string) => (await read<{ toolCalls: AgentToolCall[] }>(agentApi.channels[":channelId"]["tool-calls"].$get({ param: { channelId } }))).toolCalls;
export const selectProvider = async (channelId: string, providerId: string | null) => { await read(agentApi.channels[":channelId"].provider.$put({ param: { channelId }, json: { providerId } })); };
export const createProviderBinding = async (connection: ProviderConnection) => (await read<{ provider: AgentProviderBinding }>(agentApi.providers.$post({ json: { workspaceId, contributionId: connection.providerId, connectionId: connection.id, title: connection.title, model: connection.defaultModelId ?? "@cf/meta/llama-3.1-8b-instruct" } }))).provider;
export async function sendAndRun(channelId: string, content: string): Promise<void> { await read(agentApi.messages.$post({ json: { workspaceId, channelId, content } })); await read(agentApi.runs.$post({ json: { workspaceId, channelId } })); }
export const submitToolCall = async (channelId: string, toolId: string, input: unknown) => (await read<{ toolCall: AgentToolCall }>(agentApi["tool-calls"].$post({ json: { workspaceId, channelId, toolId, input } }))).toolCall;
export const refreshToolCall = async (toolCallId: string) => (await read<{ toolCall: AgentToolCall }>(agentApi["tool-calls"][":toolCallId"].refresh.$post({ param: { toolCallId }, json: { workspaceId } }))).toolCall;
