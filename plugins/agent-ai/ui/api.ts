import type { AgentChannel, AgentMessage, AgentProviderBinding } from "@v2/agent-contracts";

const workspaceId = "default";
const configuredBaseUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_AGENT_AI_API_URL;
const agentUrl = (configuredBaseUrl ?? "http://localhost:8791").replace(/\/$/, "");

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${agentUrl}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error(`Agent AI request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadChannels(): Promise<AgentChannel[]> {
  return (await json<{ channels: AgentChannel[] }>(`/workspaces/${encodeURIComponent(workspaceId)}/channels`)).channels;
}
export async function loadProviderBindings(): Promise<AgentProviderBinding[]> {
  return (await json<{ providers: AgentProviderBinding[] }>(`/workspaces/${encodeURIComponent(workspaceId)}/providers`)).providers;
}
export async function loadMessages(channelId: string): Promise<AgentMessage[]> {
  return (await json<{ messages: AgentMessage[] }>(`/channels/${encodeURIComponent(channelId)}/messages`)).messages;
}
export async function selectProvider(channelId: string, providerId: string | null): Promise<void> {
  await json(`/channels/${encodeURIComponent(channelId)}/provider`, { method: "PUT", body: JSON.stringify({ providerId }) });
}
export async function sendAndRun(channelId: string, content: string): Promise<void> {
  await json("/messages", { method: "POST", body: JSON.stringify({ workspaceId, channelId, content }) });
  await json("/runs", { method: "POST", body: JSON.stringify({ workspaceId, channelId }) });
}
