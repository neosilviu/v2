import type { PluginBundle, PluginManifest, ToolContribution } from "@v2/plugin-contracts";
import type { SurfaceContribution } from "@v2/plugin-contracts";
import type { ApprovalRequest, ToolApproval, ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import type { DeclarativePageContribution, RuntimeResultEnvelope, SettingsPanelContribution, SettingsTabContribution } from "@v2/ui-schema";
const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
const workspaceId = "default";
export class CoreAuthRequiredError extends Error {
  constructor() {
    super("Core authentication is required.");
    this.name = "CoreAuthRequiredError";
  }
}
export function isCoreAuthRequiredError(error: unknown): error is CoreAuthRequiredError {
  return error instanceof CoreAuthRequiredError;
}
async function json<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${coreUrl}${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init }); if (response.status === 401) throw new CoreAuthRequiredError(); if (!response.ok) throw new Error(`Core request failed: ${response.status}`); return response.json() as Promise<T>; }
export type CoreSession = { authenticated: boolean; isAdmin: boolean; user: { id: string; email: string; name: string | null } | null };
export type MarketplacePlugin = {
  manifest: PluginManifest;
  category: string;
  demoAvailable: boolean;
  installed: boolean;
  active: boolean;
};
export type PluginInstallResult =
  | { status: "installed"; plugin: MarketplacePlugin }
  | { status: "approval-required"; approvalId: string; pluginId: string; version: string; sha256: string; sensitiveCapabilities: string[] };
export type RuntimeSettingsTab = SettingsTabContribution & { ownerName: string; orderIndex: number };
export type RuntimeSettingsTabResolution = { tab: RuntimeSettingsTab; panel: SettingsPanelContribution };
export type RbacMe = { user: { id: string; email: string; name?: string | null } | null; roles: string[]; permissions: string[]; recoveryAdmin: boolean };
export type WorkspaceDomain = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: "admin" | "auth" | "website" | "storefront" | "public-chat";
  status: "draft" | "verifying" | "verified" | "active" | "disabled";
  verificationMethod: "manual" | "dns-txt" | "dns-cname";
  verificationInstructions: Record<string, unknown> | null;
  publicationId: string | null;
  isPrimary: boolean;
  createdAt: string;
  verifiedAt: string | null;
  updatedAt: string;
};
export async function loadCoreSession(): Promise<CoreSession> { return json<CoreSession>("/session"); }
export async function loadCurrentRbac(): Promise<RbacMe> { return json<RbacMe>(`/workspaces/${workspaceId}/rbac/me`); }
export function runtimeSurfaceUrl(surfaceId: string): string { return `${coreUrl}/runtime/ui/surfaces/${encodeURIComponent(surfaceId)}?workspaceId=${encodeURIComponent(workspaceId)}`; }
export async function loadLayout(): Promise<WorkspaceLayout | null> { return (await json<{ layout: WorkspaceLayout | null }>(`/workspaces/${workspaceId}/layout`)).layout; }
export async function saveLayout(state: ShellState): Promise<void> { await json("/layouts", { method: "PUT", body: JSON.stringify({ workspaceId, layout: { zones: state.zones, placements: state.placements } }) }); }
export async function loadActivePlugins(): Promise<string[]> { return (await json<{ active: string[] }>(`/workspaces/${workspaceId}/plugins`)).active; }
export async function loadWorkspaceUiSurfaces(): Promise<SurfaceContribution[]> { return (await json<{ surfaces: SurfaceContribution[] }>(`/workspaces/${workspaceId}/ui/surfaces`)).surfaces; }
export async function loadSettingsTabs(): Promise<RuntimeSettingsTab[]> { return (await json<{ tabs: RuntimeSettingsTab[] }>(`/workspaces/${workspaceId}/settings/tabs`)).tabs; }
export async function loadSettingsTab(tabId: string): Promise<RuntimeSettingsTabResolution> { return json<RuntimeSettingsTabResolution>(`/workspaces/${workspaceId}/settings/tabs/${encodeURIComponent(tabId)}`); }
export async function saveSettingsTabOrder(tabIds: string[]): Promise<void> { await json(`/workspaces/${workspaceId}/settings/tabs/order`, { method: "POST", body: JSON.stringify({ tabIds }) }); }
export async function loadPublicPage(pathname: string): Promise<{ page: DeclarativePageContribution; routeParams: Record<string, string> }> { return json<{ page: DeclarativePageContribution; routeParams: Record<string, string> }>(pathname); }
export async function loadRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>("/runtime/ui/data", { method: "POST", body: JSON.stringify({ workspaceId, contributionId, dataSourceId, routeParams }) }); }
export async function executeRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>("/runtime/ui/actions", { method: "POST", body: JSON.stringify({ workspaceId, contributionId, actionId, input, routeParams }) }); }
export async function loadPublicRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}, publicWorkspaceId = workspaceId): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>(`/public/${encodeURIComponent(publicWorkspaceId)}/runtime/data`, { method: "POST", body: JSON.stringify({ contributionId, dataSourceId, routeParams }) }); }
export async function executePublicRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}, publicWorkspaceId = workspaceId): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>(`/public/${encodeURIComponent(publicWorkspaceId)}/runtime/actions`, { method: "POST", body: JSON.stringify({ contributionId, actionId, input, routeParams }) }); }
export async function activatePlugin(pluginId: string): Promise<void> { await json("/plugins/activate", { method: "POST", body: JSON.stringify({ workspaceId, pluginId }) }); }
export async function deactivatePlugin(pluginId: string): Promise<void> { await json("/plugins/deactivate", { method: "POST", body: JSON.stringify({ workspaceId, pluginId }) }); }
export async function loadSettings(scope: "platform" | `plugin:${string}`): Promise<Record<string, unknown>> { return (await json<{ settings: Record<string, unknown> }>(`/workspaces/${workspaceId}/settings/${encodeURIComponent(scope)}`)).settings; }
export async function saveSetting(scope: "platform" | `plugin:${string}`, key: string, value: unknown): Promise<void> { await json("/settings", { method: "PUT", body: JSON.stringify({ workspaceId, scope, key, value }) }); }
export async function loadDomains(): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${workspaceId}/domains`)).domains; }
export async function createDomain(input: { hostname: string; kind: WorkspaceDomain["kind"]; verificationMethod: WorkspaceDomain["verificationMethod"]; isPrimary?: boolean }): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${workspaceId}/domains`, { method: "POST", body: JSON.stringify(input) })).domains; }
export async function verifyDomain(domainId: string): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${workspaceId}/domains/${encodeURIComponent(domainId)}/verify`, { method: "POST" })).domains; }
export async function activateDomain(domainId: string): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${workspaceId}/domains/${encodeURIComponent(domainId)}/activate`, { method: "POST" })).domains; }
export async function disableDomain(domainId: string): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${workspaceId}/domains/${encodeURIComponent(domainId)}/disable`, { method: "POST" })).domains; }
export async function executeTool(toolId: string, approvalId?: string): Promise<ToolExecutionResult> { return json<ToolExecutionResult>("/tools/execute", { method: "POST", body: JSON.stringify({ workspaceId, toolId, ...(approvalId ? { approvalId } : {}) }) }); }
export async function decideToolApproval(approvalId: string, decision: "approved" | "denied"): Promise<ToolApproval> { return (await json<{ approval: ToolApproval }>("/tool-approvals/decision", { method: "POST", body: JSON.stringify({ workspaceId, approvalId, decision }) })).approval; }
export async function loadPendingToolApprovals(): Promise<ToolApproval[]> { return (await json<{ approvals: ToolApproval[] }>(`/workspaces/${workspaceId}/tool-approvals`)).approvals; }
export async function approveToolApproval(approvalId: string): Promise<ToolApproval> { return decideToolApproval(approvalId, "approved"); }
export async function denyToolApproval(approvalId: string): Promise<ToolApproval> { return decideToolApproval(approvalId, "denied"); }
export async function loadPendingApprovalRequests(): Promise<ApprovalRequest[]> { return (await json<{ approvals: ApprovalRequest[] }>(`/workspaces/${workspaceId}/approval-requests`)).approvals; }
export async function decideApprovalRequest(approvalId: string, decision: "approved" | "denied"): Promise<ApprovalRequest> { return (await json<{ approval: ApprovalRequest }>(`/approval-requests/${encodeURIComponent(approvalId)}/decision`, { method: "POST", body: JSON.stringify({ workspaceId, decision }) })).approval; }
export async function loadInstalledPlugins(): Promise<PluginManifest[]> { return (await json<{ plugins: PluginManifest[] }>(`/plugins/installed?workspaceId=${workspaceId}`)).plugins; }
export async function loadMarketplacePlugins(): Promise<MarketplacePlugin[]> { return (await json<{ plugins: MarketplacePlugin[] }>(`/marketplace/plugins?workspaceId=${workspaceId}`)).plugins; }
export async function installMarketplacePlugin(pluginId: string, approvalId?: string): Promise<PluginInstallResult> {
  return json<PluginInstallResult>(`/marketplace/plugins/${encodeURIComponent(pluginId)}/install?workspaceId=${workspaceId}`, approvalId ? { method: "POST", body: JSON.stringify({ approvalId }) } : { method: "POST" });
}
export async function publishMarketplaceRelease(pluginId: string, file: File, fields?: { category?: string; source?: string; status?: "draft" | "published" | "deprecated"; demoAvailable?: boolean }): Promise<{ status: string; bundle: PluginBundle; sensitiveCapabilities: string[] }> {
  const body = new FormData();
  body.append("file", file);
  if (fields?.category) body.append("category", fields.category);
  if (fields?.source) body.append("source", fields.source);
  if (fields?.status) body.append("status", fields.status);
  if (fields?.demoAvailable !== undefined) body.append("demoAvailable", String(fields.demoAvailable));
  const response = await fetch(`${coreUrl}/marketplace/plugins/${encodeURIComponent(pluginId)}/releases`, { method: "POST", body, credentials: "include" });
  if (response.status === 401) throw new CoreAuthRequiredError();
  if (!response.ok) throw new Error(`Marketplace release publish failed: ${response.status}`);
  return response.json() as Promise<{ status: string; bundle: PluginBundle; sensitiveCapabilities: string[] }>;
}
export async function loadRuntimeTools(): Promise<ToolContribution[]> { return (await json<{ tools: ToolContribution[] }>(`/runtime/tools?workspaceId=${workspaceId}`)).tools; }
export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }> { const body = new FormData(); body.append("file", file); const response = await fetch(`${coreUrl}/plugins/upload`, { method: "POST", body, credentials: "include" }); if (!response.ok && response.status !== 202) throw new Error(`Plugin upload failed: ${response.status}`); return response.json() as Promise<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }>; }
export async function approveInstall(approvalId: string): Promise<PluginManifest> { return (await json<{ status: string; manifest: PluginManifest }>("/plugins/install", { method: "POST", body: JSON.stringify({ workspaceId, approvalId }) })).manifest; }
export async function grantCapabilities(pluginId: string, capabilities: string[]): Promise<void> { await json("/plugins/grants", { method: "POST", body: JSON.stringify({ workspaceId, pluginId, capabilities }) }); }
