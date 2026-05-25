import type { ShellState } from "@v2/ui-runtime";
import type { ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";

const baseUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
const workspaceId = "default";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { headers: { "content-type": "application/json" }, ...init });
  const body = await response.json() as T;
  return body;
}

export async function loadLayout(): Promise<WorkspaceLayout | null> {
  const result = await request<{ layout: WorkspaceLayout | null }>(`/workspaces/${workspaceId}/layout`);
  return result.layout;
}

export async function saveLayout(state: ShellState): Promise<void> {
  const layout: WorkspaceLayout = { zones: state.zones, placements: state.placements };
  await request("/layouts", { method: "PUT", body: JSON.stringify({ workspaceId, layout }) });
}

export async function executeTool(toolId: string, approved = false): Promise<ToolExecutionResult> {
  return request<ToolExecutionResult>("/tools/execute", { method: "POST", body: JSON.stringify({ workspaceId, toolId, approved }) });
}
