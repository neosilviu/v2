import type { AgentChannel, AgentMessage } from "@v2/agent-contracts";
import type { PluginManifest } from "@v2/plugin-contracts";
import type { ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";

const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
const agentUrl = import.meta.env.VITE_AGENT_API_URL ?? "http://localhost:8788";
const workspaceId = "default";
async function json<T>(base: string, path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${base}${path}`, { headers: { "content-type": "application/json" }, ...init }); return response.json() as Promise<T>; }
export async function loadLayout(): Promise<WorkspaceLayout | null> { return (await json<{ layout: WorkspaceLayout | null }>(coreUrl, `/workspaces/${workspaceId}/layout`)).layout; }
export async function saveLayout(state: ShellState): Promise<void> { await json(coreUrl, "/layouts", { method: "PUT", body: JSON.stringify({ workspaceId, layout: { zones: state.zones, placements: state.placements } }) }); }
export async function executeTool(toolId: string, approved = false): Promise<ToolExecutionResult> { return json<ToolExecutionResult>(coreUrl, "/tools/execute", { method: "POST", body: JSON.stringify({ workspaceId, toolId, approved }) }); }
export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; bundle?: { manifest: PluginManifest }; sensitiveCapabilities?: string[] }> { const body = new FormData(); body.append("file", file); const response = await fetch(`${coreUrl}/plugins/upload`, { method: "POST", body }); return response.json() as Promise<{ status: string; manifest?: PluginManifest; bundle?: { manifest: PluginManifest }; sensitiveCapabilities?: string[] }>; }
export async function loadChannels(): Promise<AgentChannel[]> { return (await json<{ channels: AgentChannel[] }>(agentUrl, `/workspaces/${workspaceId}/channels`)).channels; }
export async function loadMessages(channelId: string): Promise<AgentMessage[]> { return (await json<{ messages: AgentMessage[] }>(agentUrl, `/channels/${encodeURIComponent(channelId)}/messages`)).messages; }
export async function sendMessage(channelId: string, content: string): Promise<AgentMessage> { return (await json<{ message: AgentMessage }>(agentUrl, "/messages", { method: "POST", body: JSON.stringify({ workspaceId, channelId, content }) })).message; }
