import type { PluginBundle, PluginManifest, ToolContribution } from "@v2/plugin-contracts";
import type { ToolApproval, ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
const workspaceId = "default";
async function json<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${coreUrl}${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init }); if (!response.ok) throw new Error(`Core request failed: ${response.status}`); return response.json() as Promise<T>; }
export type CoreSession = { authenticated: boolean; isAdmin: boolean; user: { id: string; email: string; name: string | null } | null };
export type MarketplacePlugin = {
  manifest: PluginManifest;
  category: "ai" | "design" | "site" | "commerce";
  demoAvailable: boolean;
  installed: boolean;
  active: boolean;
};
export async function loadCoreSession(): Promise<CoreSession> { return json<CoreSession>("/session"); }
export function runtimeSurfaceUrl(surfaceId: string): string { return `${coreUrl}/runtime/ui/surfaces/${encodeURIComponent(surfaceId)}?workspaceId=${encodeURIComponent(workspaceId)}`; }
export async function loadLayout(): Promise<WorkspaceLayout | null> { return (await json<{ layout: WorkspaceLayout | null }>(`/workspaces/${workspaceId}/layout`)).layout; }
export async function saveLayout(state: ShellState): Promise<void> { await json("/layouts", { method: "PUT", body: JSON.stringify({ workspaceId, layout: { zones: state.zones, placements: state.placements } }) }); }
export async function loadActivePlugins(): Promise<string[]> { return (await json<{ active: string[] }>(`/workspaces/${workspaceId}/plugins`)).active; }
export async function activatePlugin(pluginId: string): Promise<void> { await json("/plugins/activate", { method: "POST", body: JSON.stringify({ workspaceId, pluginId }) }); }
export async function deactivatePlugin(pluginId: string): Promise<void> { await json("/plugins/deactivate", { method: "POST", body: JSON.stringify({ workspaceId, pluginId }) }); }
export async function loadSettings(scope: "platform" | `plugin:${string}`): Promise<Record<string, unknown>> { return (await json<{ settings: Record<string, unknown> }>(`/workspaces/${workspaceId}/settings/${encodeURIComponent(scope)}`)).settings; }
export async function saveSetting(scope: "platform" | `plugin:${string}`, key: string, value: unknown): Promise<void> { await json("/settings", { method: "PUT", body: JSON.stringify({ workspaceId, scope, key, value }) }); }
export async function executeTool(toolId: string, approvalId?: string): Promise<ToolExecutionResult> { return json<ToolExecutionResult>("/tools/execute", { method: "POST", body: JSON.stringify({ workspaceId, toolId, ...(approvalId ? { approvalId } : {}) }) }); }
export async function decideToolApproval(approvalId: string, decision: "approved" | "denied"): Promise<ToolApproval> { return (await json<{ approval: ToolApproval }>("/tool-approvals/decision", { method: "POST", body: JSON.stringify({ workspaceId, approvalId, decision }) })).approval; }
export async function loadPendingToolApprovals(): Promise<ToolApproval[]> { return (await json<{ approvals: ToolApproval[] }>(`/workspaces/${workspaceId}/tool-approvals`)).approvals; }
export async function approveToolApproval(approvalId: string): Promise<ToolApproval> { return decideToolApproval(approvalId, "approved"); }
export async function denyToolApproval(approvalId: string): Promise<ToolApproval> { return decideToolApproval(approvalId, "denied"); }
export async function loadInstalledPlugins(): Promise<PluginManifest[]> { return (await json<{ plugins: PluginManifest[] }>("/plugins/installed")).plugins; }
export async function loadMarketplacePlugins(): Promise<MarketplacePlugin[]> { return (await json<{ plugins: MarketplacePlugin[] }>(`/marketplace/plugins?workspaceId=${workspaceId}`)).plugins; }
export async function installMarketplacePlugin(pluginId: string): Promise<MarketplacePlugin> { return (await json<{ status: string; plugin: MarketplacePlugin }>(`/marketplace/plugins/${encodeURIComponent(pluginId)}/install?workspaceId=${workspaceId}`, { method: "POST" })).plugin; }
export async function loadRuntimeTools(): Promise<ToolContribution[]> { return (await json<{ tools: ToolContribution[] }>(`/runtime/tools?workspaceId=${workspaceId}`)).tools; }
export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; bundle?: PluginBundle; sensitiveCapabilities?: string[] }> { const body = new FormData(); body.append("file", file); const response = await fetch(`${coreUrl}/plugins/upload`, { method: "POST", body, credentials: "include" }); if (!response.ok && response.status !== 202) throw new Error(`Plugin upload failed: ${response.status}`); return response.json() as Promise<{ status: string; manifest?: PluginManifest; bundle?: PluginBundle; sensitiveCapabilities?: string[] }>; }
export async function approveInstall(bundle: PluginBundle): Promise<PluginManifest> { return (await json<{ status: string; manifest: PluginManifest }>("/plugins/install", { method: "POST", body: JSON.stringify({ workspaceId, bundle, approved: true }) })).manifest; }
export async function grantCapabilities(pluginId: string, capabilities: string[]): Promise<void> { await json("/plugins/grants", { method: "POST", body: JSON.stringify({ workspaceId, pluginId, capabilities }) }); }
