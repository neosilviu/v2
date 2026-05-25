import type { AgentChannel, AgentMessage, AgentProviderBinding, AgentToolCall } from "@v2/agent-contracts";
import type { ProviderConnection } from "@v2/provider-contracts";
const workspaceId = "default";
const configuredBaseUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_AGENT_AI_API_URL;
const agentUrl = (configuredBaseUrl ?? "http://localhost:8791").replace(/\/$/, "");
async function json<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${agentUrl}${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init }); if (!response.ok) throw new Error(`Agent AI request failed: ${response.status}`); return response.json() as Promise<T>; }
export const loadChannels = async () => (await json<{ channels: AgentChannel[] }>(`/workspaces/${workspaceId}/channels`)).channels;
export const loadProviderBindings = async () => (await json<{ providers: AgentProviderBinding[] }>(`/workspaces/${workspaceId}/providers`)).providers;
export const loadAvailableConnections = async () => (await json<{ connections: ProviderConnection[] }>(`/provider-runtime/connections?workspaceId=${workspaceId}`)).connections;
export const loadMessages = async (channelId: string) => (await json<{ messages: AgentMessage[] }>(`/channels/${encodeURIComponent(channelId)}/messages`)).messages;
export const loadToolCalls = async (channelId: string) => (await json<{ toolCalls: AgentToolCall[] }>(`/channels/${encodeURIComponent(channelId)}/tool-calls`)).toolCalls;
export const selectProvider = async (channelId: string, providerId: string | null) => { await json(`/channels/${encodeURIComponent(channelId)}/provider`, { method: "PUT", body: JSON.stringify({ providerId }) }); };
export const createProviderBinding = async (connection: ProviderConnection) => (await json<{ provider: AgentProviderBinding }>("/providers", { method: "POST", body: JSON.stringify({ workspaceId, contributionId: connection.providerId, connectionId: connection.id, title: connection.title, model: connection.defaultModelId ?? "@cf/meta/llama-3.1-8b-instruct" }) })).provider;
export async function sendAndRun(channelId: string, content: string): Promise<void> { await json("/messages", { method: "POST", body: JSON.stringify({ workspaceId, channelId, content }) }); await json("/runs", { method: "POST", body: JSON.stringify({ workspaceId, channelId }) }); }
export const submitToolCall = async (channelId: string, toolId: string, input: unknown) => (await json<{ toolCall: AgentToolCall }>("/tool-calls", { method: "POST", body: JSON.stringify({ workspaceId, channelId, toolId, input }) })).toolCall;
export const refreshToolCall = async (toolCallId: string) => (await json<{ toolCall: AgentToolCall }>(`/tool-calls/${encodeURIComponent(toolCallId)}/refresh`, { method: "POST", body: JSON.stringify({ workspaceId }) })).toolCall;
