import type { AgentChannel, AgentMessage, AgentProviderBinding, AgentRun } from "@v2/agent-contracts";
import type { PluginBundle, PluginManifest, ProviderContribution } from "@v2/plugin-contracts";
import type { ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";

const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
const agentUrl = import.meta.env.VITE_AGENT_API_URL ?? "http://localhost:8788";
const workspaceId = "default";
async function json<T>(base: string, path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${base}${path}`, { headers: { "content-type": "application/json" }, ...init }); return response.json() as Promise<T>; }
export async function loadLayout(): Promise<WorkspaceLayout | null> { return (await json<{ layout: WorkspaceLayout | null }>(coreUrl, `/workspaces/${workspaceId}/layout`)).layout; }
export async function saveLayout(state: ShellState): Promise<void> { await json(coreUrl, "/layouts", { method: "PUT", body: JSON.stringify({ workspaceId, layout: { zones: state.zones, placements: state.placements } }) }); }
export async function executeTool(toolId: string, approved = false): Promise<ToolExecutionResult> { return json<ToolExecutionResult>(coreUrl, "/tools/execute", { method: "POST", body: JSON.stringify({ workspaceId, toolId, approved }) }); }
export async function loadInstalledPlugins(): Promise<PluginManifest[]> { return (await json<{ plugins: PluginManifest[] }>(coreUrl, "/plugins/installed")).plugins; }
export async function loadRuntimeProviders(): Promise<ProviderContribution[]> { return (await json<{ providers: ProviderContribution[] }>(coreUrl, `/runtime/providers?workspaceId=${workspaceId}`)).providers; }
export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; bundle?: PluginBundle; sensitiveCapabilities?: string[] }> { const body = new FormData(); body.append("file", file); const response = await fetch(`${coreUrl}/plugins/upload`, { method: "POST", body }); return response.json() as Promise<{ status: string; manifest?: PluginManifest; bundle?: PluginBundle; sensitiveCapabilities?: string[] }>; }
export async function approveInstall(bundle: PluginBundle): Promise<PluginManifest> { return (await json<{ status: string; manifest: PluginManifest }>(coreUrl, "/plugins/install", { method: "POST", body: JSON.stringify({ workspaceId, bundle, approved: true }) })).manifest; }
export async function grantCapabilities(pluginId: string, capabilities: string[]): Promise<void> { await json(coreUrl, "/plugins/grants", { method: "POST", body: JSON.stringify({ workspaceId, pluginId, capabilities }) }); }
export async function loadChannels(): Promise<AgentChannel[]> { return (await json<{ channels: AgentChannel[] }>(agentUrl, `/workspaces/${workspaceId}/channels`)).channels; }
export async function loadMessages(channelId: string): Promise<AgentMessage[]> { return (await json<{ messages: AgentMessage[] }>(agentUrl, `/channels/${encodeURIComponent(channelId)}/messages`)).messages; }
export async function sendMessage(channelId: string, content: string): Promise<AgentMessage> { return (await json<{ message: AgentMessage }>(agentUrl, "/messages", { method: "POST", body: JSON.stringify({ workspaceId, channelId, content }) })).message; }
export async function loadProviderBindings(): Promise<AgentProviderBinding[]> { return (await json<{ providers: AgentProviderBinding[] }>(agentUrl, `/workspaces/${workspaceId}/providers`)).providers; }
export async function bindProvider(contribution: ProviderContribution, model: string): Promise<AgentProviderBinding> { return (await json<{ provider: AgentProviderBinding }>(agentUrl, "/providers", { method: "POST", body: JSON.stringify({ workspaceId, contributionId: contribution.id, title: contribution.title, model }) })).provider; }
export async function setChannelProvider(channelId: string, providerId: string | null): Promise<void> { await json(agentUrl, `/channels/${encodeURIComponent(channelId)}/provider`, { method: "PUT", body: JSON.stringify({ providerId }) }); }
export async function createRun(channelId: string): Promise<AgentRun> { return (await json<{ run: AgentRun }>(agentUrl, "/runs", { method: "POST", body: JSON.stringify({ workspaceId, channelId }) })).run; }
