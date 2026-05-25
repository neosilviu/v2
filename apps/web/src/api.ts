import type { ShellState } from "@v2/ui-runtime";
import type { PluginManifest } from "@v2/plugin-contracts";
import type { ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";

const baseUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
const workspaceId = "default";
async function json<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${baseUrl}${path}`, { headers: { "content-type": "application/json" }, ...init }); return response.json() as Promise<T>; }
export async function loadLayout(): Promise<WorkspaceLayout | null> { return (await json<{ layout: WorkspaceLayout | null }>(`/workspaces/${workspaceId}/layout`)).layout; }
export async function saveLayout(state: ShellState): Promise<void> { const layout: WorkspaceLayout = { zones: state.zones, placements: state.placements }; await json("/layouts", { method: "PUT", body: JSON.stringify({ workspaceId, layout }) }); }
export async function executeTool(toolId: string, approved = false): Promise<ToolExecutionResult> { return json<ToolExecutionResult>("/tools/execute", { method: "POST", body: JSON.stringify({ workspaceId, toolId, approved }) }); }
export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; bundle?: { manifest: PluginManifest }; sensitiveCapabilities?: string[] }> { const body = new FormData(); body.append("file", file); const response = await fetch(`${baseUrl}/plugins/upload`, { method: "POST", body }); return response.json() as Promise<{ status: string; manifest?: PluginManifest; bundle?: { manifest: PluginManifest }; sensitiveCapabilities?: string[] }>; }
