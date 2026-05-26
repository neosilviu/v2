import type { PluginBundle, PluginManifest, ToolContribution } from "@v2/plugin-contracts";
import type { MailProviderConfigure, MailProviderPublicSummary, MailProviderTestResult, MailTemplate } from "@v2/mail-contracts";
import type { SurfaceContribution } from "@v2/plugin-contracts";
import type { ApprovalRequest, ToolApproval, ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import type { DeclarativePageContribution, RuntimeResultEnvelope, SettingsPanelContribution, SettingsTabContribution } from "@v2/ui-schema";

export const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";

let activeWorkspaceId: string | null = null;
let shellBootstrap: Promise<ShellBootstrap> | null = null;
let securityBootstrap: { workspaceId: string; promise: Promise<unknown> } | null = null;

function workspaceFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get("workspace") || window.localStorage.getItem("v2.workspaceId") || null;
}

export function currentWorkspaceId() {
  return activeWorkspaceId ?? workspaceFromLocation() ?? "current";
}

export function setCurrentWorkspaceId(workspaceId: string) {
  activeWorkspaceId = workspaceId;
  window.localStorage.setItem("v2.workspaceId", workspaceId);
}

export class CoreAuthRequiredError extends Error {
  constructor() {
    super("Core authentication is required.");
    this.name = "CoreAuthRequiredError";
  }
}

export class CoreRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "CoreRequestError";
  }
}

export function isCoreAuthRequiredError(error: unknown): error is CoreAuthRequiredError {
  return error instanceof CoreAuthRequiredError;
}

async function parseCoreError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return new CoreRequestError(response.status, undefined, `Core request failed: ${response.status}`);
  try {
    const payload = JSON.parse(text) as { error?: { code?: string; message?: string }; code?: string; message?: string };
    return new CoreRequestError(response.status, payload.error?.code ?? payload.code, payload.error?.message ?? payload.message ?? `Core request failed: ${response.status}`);
  } catch {
    return new CoreRequestError(response.status, undefined, text || `Core request failed: ${response.status}`);
  }
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if ((method === "GET" || method === "HEAD") && !init.body) headers.delete("content-type");
  const response = await fetch(`${coreUrl}${path}`, { ...init, method, credentials: "include", headers });
  if (response.status === 401) throw new CoreAuthRequiredError();
  if (!response.ok) throw await parseCoreError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function resetShellBootstrap() { shellBootstrap = null; }

export type CoreSession = { authenticated: boolean; isAdmin: boolean; user: { id: string; email: string; name: string | null } | null };
export type WorkspaceSummary = { id: string; name: string; status: string; roles: Array<{ name: string; system_key: string | null }>; permissions: string[] };
export type RbacMe = { user: { id: string; email: string; name?: string | null } | null; roles: Array<{ name: string; system_key: string | null }> | string[]; permissions: string[]; recoveryAdmin?: boolean; bootstrap?: boolean };
export type MarketplacePlugin = {
  manifest: PluginManifest;
  category: string;
  demoAvailable: boolean;
  installed: boolean;
  active: boolean;
  source?: string;
};
export type PluginInstallResult =
  | { status: "installed"; plugin: MarketplacePlugin }
  | { status: "approval-required"; approvalId: string; pluginId: string; version: string; sha256: string; sensitiveCapabilities: string[] };
export type RuntimeSettingsTab = SettingsTabContribution & { ownerName: string; orderIndex: number };
export type RuntimeSettingsTabResolution = { tab: RuntimeSettingsTab; panel: SettingsPanelContribution };
export type ShellBootstrap = {
  session: CoreSession;
  workspaces: WorkspaceSummary[];
  currentWorkspace: WorkspaceSummary;
  membership: RbacMe;
  layout: WorkspaceLayout | null;
  plugins: PluginManifest[];
  active: string[];
  tools: ToolContribution[];
  surfaces: SurfaceContribution[];
  settingsNavigation: { pluginTabs: RuntimeSettingsTab[] };
  featureAvailability: { canReadMarketplace: boolean; canInstallPlugins: boolean; canActivatePlugins: boolean; canUploadPlugins: boolean };
};
export type WorkspaceDomain = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: "admin" | "auth" | "website" | "storefront" | "public-chat" | "mail";
  status: "draft" | "verifying" | "verified" | "active" | "disabled";
  verificationMethod: "manual" | "dns-txt" | "dns-cname";
  verificationInstructions: Record<string, unknown> | null;
  publicationId: string | null;
  isPrimary: boolean;
  createdAt: string;
  verifiedAt: string | null;
  updatedAt: string;
};
export type MailSummary = {
  providers: MailProviderPublicSummary[];
  templates: MailTemplate[];
  events: { id: string; provider_id: string | null; template_key: string | null; status: string; purpose: string; error_safe: string | null; created_at: string; completed_at: string | null }[];
  activeProvider: MailProviderPublicSummary | null;
};

export function loadShellBootstrap(workspaceId = workspaceFromLocation()): Promise<ShellBootstrap> {
  if (!shellBootstrap) {
    const path = workspaceId ? `/workspaces/${encodeURIComponent(workspaceId)}/bootstrap` : "/workspaces/current/bootstrap";
    shellBootstrap = json<ShellBootstrap>(path).then((bootstrap) => {
      setCurrentWorkspaceId(bootstrap.currentWorkspace.id);
      return bootstrap;
    }).catch((error) => {
      shellBootstrap = null;
      throw error;
    });
  }
  return shellBootstrap;
}

export async function loadCoreSession(): Promise<CoreSession> { return json<CoreSession>("/session"); }
export async function loadOwnerSetup(token: string): Promise<{ setup: { workspaceId: string; ownerEmail: string; status: string; expiresAt: string } }> { return json<{ setup: { workspaceId: string; ownerEmail: string; status: string; expiresAt: string } }>(`/setup/owner?token=${encodeURIComponent(token)}`); }
export async function consumeOwnerSetup(token: string): Promise<{ status: "consumed"; workspaceId: string }> { const result = await json<{ status: "consumed"; workspaceId: string }>("/setup/owner/consume", { method: "POST", body: JSON.stringify({ token }) }); setCurrentWorkspaceId(result.workspaceId); resetShellBootstrap(); return result; }
export async function loadCurrentRbac(): Promise<RbacMe> { return json<RbacMe>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/rbac/me`); }
export function runtimeSurfaceUrl(surfaceId: string): string { return `${coreUrl}/runtime/ui/surfaces/${encodeURIComponent(surfaceId)}?workspaceId=${encodeURIComponent(currentWorkspaceId())}`; }
export async function loadLayout(): Promise<WorkspaceLayout | null> { return (await loadShellBootstrap()).layout; }
export async function saveLayout(state: ShellState): Promise<void> { await json("/layouts", { method: "PUT", body: JSON.stringify({ workspaceId: currentWorkspaceId(), layout: { zones: state.zones, placements: state.placements } }) }); resetShellBootstrap(); }
export async function loadActivePlugins(): Promise<string[]> { return (await loadShellBootstrap()).active; }
export async function loadWorkspaceUiSurfaces(): Promise<SurfaceContribution[]> { return (await loadShellBootstrap()).surfaces; }
export async function loadSettingsTabs(): Promise<RuntimeSettingsTab[]> { return (await loadShellBootstrap()).settingsNavigation.pluginTabs; }
export async function loadSettingsTab(tabId: string): Promise<RuntimeSettingsTabResolution> { return json<RuntimeSettingsTabResolution>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/settings/tabs/${encodeURIComponent(tabId)}`); }
export async function saveSettingsTabOrder(tabIds: string[]): Promise<void> { await json(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/settings/tabs/order`, { method: "POST", body: JSON.stringify({ tabIds }) }); }
export async function loadPublicPage(pathname: string): Promise<{ page: DeclarativePageContribution; routeParams: Record<string, string> }> { return json<{ page: DeclarativePageContribution; routeParams: Record<string, string> }>(pathname); }
export async function loadRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>("/runtime/ui/data", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), contributionId, dataSourceId, routeParams }) }); }
export async function executeRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>("/runtime/ui/actions", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), contributionId, actionId, input, routeParams }) }); }
export async function loadPublicRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>(`/public/${encodeURIComponent(publicWorkspaceId)}/runtime/data`, { method: "POST", body: JSON.stringify({ contributionId, dataSourceId, routeParams }) }); }
export async function executePublicRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>(`/public/${encodeURIComponent(publicWorkspaceId)}/runtime/actions`, { method: "POST", body: JSON.stringify({ contributionId, actionId, input, routeParams }) }); }
export async function activatePlugin(pluginId: string): Promise<void> { await json("/plugins/activate", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), pluginId }) }); resetShellBootstrap(); }
export async function deactivatePlugin(pluginId: string): Promise<void> { await json("/plugins/deactivate", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), pluginId }) }); resetShellBootstrap(); }
export async function loadSettings(scope: "platform" | `plugin:${string}`): Promise<Record<string, unknown>> { return (await json<{ settings: Record<string, unknown> }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/settings/${encodeURIComponent(scope)}`)).settings; }
export async function saveSetting(scope: "platform" | `plugin:${string}`, key: string, value: unknown): Promise<void> { await json("/settings", { method: "PUT", body: JSON.stringify({ workspaceId: currentWorkspaceId(), scope, key, value }) }); }
export async function loadGeneralSettings(): Promise<Record<string, unknown>> { return (await json<{ settings: Record<string, unknown> }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/settings/general`)).settings; }
export async function saveGeneralSettings(input: Record<string, unknown>): Promise<Record<string, unknown>> { return (await json<{ settings: Record<string, unknown> }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/settings/general`, { method: "PUT", body: JSON.stringify(input) })).settings; }
export async function loadSecurityBootstrap<T>(): Promise<T> {
  const workspaceId = currentWorkspaceId();
  if (!securityBootstrap || securityBootstrap.workspaceId !== workspaceId) {
    securityBootstrap = {
      workspaceId,
      promise: json<T>(`/workspaces/${encodeURIComponent(workspaceId)}/auth/security-bootstrap`).catch((error) => {
        securityBootstrap = null;
        throw error;
      }),
    };
  }
  return securityBootstrap.promise as Promise<T>;
}
export async function loadDomains(): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/domains`)).domains; }
export async function createDomain(input: { hostname: string; kind: WorkspaceDomain["kind"]; verificationMethod: WorkspaceDomain["verificationMethod"]; isPrimary?: boolean }): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/domains`, { method: "POST", body: JSON.stringify(input) })).domains; }
export async function verifyDomain(domainId: string): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/domains/${encodeURIComponent(domainId)}/verify`, { method: "POST" })).domains; }
export async function activateDomain(domainId: string): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/domains/${encodeURIComponent(domainId)}/activate`, { method: "POST" })).domains; }
export async function disableDomain(domainId: string): Promise<WorkspaceDomain[]> { return (await json<{ domains: WorkspaceDomain[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/domains/${encodeURIComponent(domainId)}/disable`, { method: "POST" })).domains; }
export async function loadMailSummary(): Promise<MailSummary> { return json<MailSummary>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/mail`); }
export async function configureMailProvider(input: MailProviderConfigure): Promise<MailSummary> { return json<MailSummary>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/mail/providers`, { method: "POST", body: JSON.stringify(input) }); }
export async function activateMailProvider(providerId: string): Promise<MailSummary> { return json<MailSummary>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/mail/providers/${encodeURIComponent(providerId)}/activate`, { method: "POST" }); }
export async function disableMailProvider(providerId: string): Promise<MailSummary> { return json<MailSummary>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/mail/providers/${encodeURIComponent(providerId)}/disable`, { method: "POST" }); }
export async function testMailProvider(providerId: string, to: string): Promise<MailProviderTestResult> { return json<MailProviderTestResult>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/mail/providers/${encodeURIComponent(providerId)}/test`, { method: "POST", body: JSON.stringify({ to }) }); }
export async function executeTool(toolId: string, approvalId?: string): Promise<ToolExecutionResult> { return json<ToolExecutionResult>("/tools/execute", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), toolId, ...(approvalId ? { approvalId } : {}) }) }); }
export async function decideToolApproval(approvalId: string, decision: "approved" | "denied"): Promise<ToolApproval> { return (await json<{ approval: ToolApproval }>("/tool-approvals/decision", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), approvalId, decision }) })).approval; }
export async function loadPendingToolApprovals(): Promise<ToolApproval[]> { return (await json<{ approvals: ToolApproval[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/tool-approvals`)).approvals; }
export async function approveToolApproval(approvalId: string): Promise<ToolApproval> { return decideToolApproval(approvalId, "approved"); }
export async function denyToolApproval(approvalId: string): Promise<ToolApproval> { return decideToolApproval(approvalId, "denied"); }
export async function loadPendingApprovalRequests(): Promise<ApprovalRequest[]> { return (await json<{ approvals: ApprovalRequest[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/approval-requests`)).approvals; }
export async function decideApprovalRequest(approvalId: string, decision: "approved" | "denied"): Promise<ApprovalRequest> { return (await json<{ approval: ApprovalRequest }>(`/approval-requests/${encodeURIComponent(approvalId)}/decision`, { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), decision }) })).approval; }
export async function loadInstalledPlugins(): Promise<PluginManifest[]> { return (await loadShellBootstrap()).plugins; }
export async function loadMarketplacePlugins(): Promise<MarketplacePlugin[]> { return (await json<{ plugins: MarketplacePlugin[] }>(`/marketplace/plugins?workspaceId=${encodeURIComponent(currentWorkspaceId())}`)).plugins; }
export async function installMarketplacePlugin(pluginId: string, approvalId?: string): Promise<PluginInstallResult> { const result = await json<PluginInstallResult>(`/marketplace/plugins/${encodeURIComponent(pluginId)}/install?workspaceId=${encodeURIComponent(currentWorkspaceId())}`, approvalId ? { method: "POST", body: JSON.stringify({ approvalId }) } : { method: "POST" }); resetShellBootstrap(); return result; }
export async function publishMarketplaceRelease(pluginId: string, file: File, fields?: { category?: string; source?: string; status?: "draft" | "published" | "deprecated"; demoAvailable?: boolean }): Promise<{ status: string; bundle: PluginBundle; sensitiveCapabilities: string[] }> { const body = new FormData(); body.append("file", file); if (fields?.category) body.append("category", fields.category); if (fields?.source) body.append("source", fields.source); if (fields?.status) body.append("status", fields.status); if (fields?.demoAvailable !== undefined) body.append("demoAvailable", String(fields.demoAvailable)); const response = await fetch(`${coreUrl}/marketplace/plugins/${encodeURIComponent(pluginId)}/releases`, { method: "POST", body, credentials: "include" }); if (response.status === 401) throw new CoreAuthRequiredError(); if (!response.ok) throw await parseCoreError(response); return response.json() as Promise<{ status: string; bundle: PluginBundle; sensitiveCapabilities: string[] }>; }
export async function loadRuntimeTools(): Promise<ToolContribution[]> { return (await loadShellBootstrap()).tools; }
export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }> { const body = new FormData(); body.append("file", file); const response = await fetch(`${coreUrl}/plugins/upload?workspaceId=${encodeURIComponent(currentWorkspaceId())}`, { method: "POST", body, credentials: "include" }); if (!response.ok && response.status !== 202) throw await parseCoreError(response); resetShellBootstrap(); return response.json() as Promise<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }>; }
export async function approveInstall(approvalId: string): Promise<PluginManifest> { const manifest = (await json<{ status: string; manifest: PluginManifest }>("/plugins/install", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), approvalId }) })).manifest; resetShellBootstrap(); return manifest; }
export async function grantCapabilities(pluginId: string, capabilities: string[]): Promise<void> { await json("/plugins/grants", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), pluginId, capabilities }) }); }
