import type { PluginBundle, PluginManifest, ToolContribution } from "@v2/plugin-contracts";
import type { ToolApproval, ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
const workspaceId = "default";
async function json<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${coreUrl}${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init }); if (!response.ok) throw new Error(`Core request failed: ${response.status}`); return response.json() as Promise<T>; }
export function runtimeSurfaceUrl(surfaceId: string): string { return `${coreUrl}/runtime/ui/surfaces/${encodeURIComponent(surfaceId)}?workspaceId=${encodeURIComponent(workspaceId)}`; }
export async function loadLayout(): Promise<WorkspaceLayout | null> { return (await json<{ layout: WorkspaceLayout | null }>(`/workspaces/${workspaceId}/layout`)).layout; }
export async function saveLayout(state: ShellState): Promise<void> { await json("/layouts", { method: "PUT", body: JSON.stringify({ workspaceId, layout: { zones: state.zones, placements: state.placements } }) }); }
export async function executeTool(toolId: string, approvalId?: string): Promise<ToolExecutionResult> { return json<ToolExecutionResult>("/tools/execute", { method: "POST", body: JSON.stringify({ workspaceId, toolId, ...(approvalId ? { approvalId } : {}) }) }); }
export async function decideToolApproval(approvalId: string, decision: "approved" | "denied"): Promise<ToolApproval> { return (await json<{ approval: ToolApproval }>("/tool-approvals/decision", { method: "POST", body: JSON.stringify({ workspaceId, approvalId, decision }) })).approval; }
export async function loadInstalledPlugins(): Promise<PluginManifest[]> { return (await json<{ plugins: PluginManifest[] }>("/plugins/installed")).plugins; }
export async function loadRuntimeTools(): Promise<ToolContribution[]> { return (await json<{ tools: ToolContribution[] }>(`/runtime/tools?workspaceId=${workspaceId}`)).tools; }
export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; bundle?: PluginBundle; sensitiveCapabilities?: string[] }> { const body = new FormData(); body.append("file", file); const response = await fetch(`${coreUrl}/plugins/upload`, { method: "POST", body, credentials: "include" }); if (!response.ok && response.status !== 202) throw new Error(`Plugin upload failed: ${response.status}`); return response.json() as Promise<{ status: string; manifest?: PluginManifest; bundle?: PluginBundle; sensitiveCapabilities?: string[] }>; }
export async function approveInstall(bundle: PluginBundle): Promise<PluginManifest> { return (await json<{ status: string; manifest: PluginManifest }>("/plugins/install", { method: "POST", body: JSON.stringify({ workspaceId, bundle, approved: true }) })).manifest; }
export async function grantCapabilities(pluginId: string, capabilities: string[]): Promise<void> { await json("/plugins/grants", { method: "POST", body: JSON.stringify({ workspaceId, pluginId, capabilities }) }); }
