import type { PluginBundle, PluginManifest, ToolContribution } from "@v2/plugin-contracts";
import type { MailProviderConfigure, MailProviderPublicSummary, MailProviderTestResult, MailTemplate } from "@v2/mail-contracts";
import type { SurfaceContribution } from "@v2/plugin-contracts";
import type { ApprovalRequest, ToolApproval, ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import type { DeclarativePageContribution, RuntimeResultEnvelope, SettingsPanelContribution, SettingsTabContribution } from "@v2/ui-schema";
import { CoreAuthRequiredError, PlatformApiError, createGeneratedApiClient } from "@v2/api-client";
import { interfaceContributionSchema, type InterfaceContribution } from "./platform-contracts";
import { authUrl } from "./auth-client";
import { z } from "zod";

export const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
const apiClient = createGeneratedApiClient({ coreUrl, authUrl });

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

export class CoreRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "CoreRequestError";
  }
}

export function isCoreAuthRequiredError(error: unknown): error is CoreAuthRequiredError {
  return error instanceof CoreAuthRequiredError;
}

async function generated<T>(promise: Promise<unknown>): Promise<T> {
  try {
    return await promise as T;
  } catch (error) {
    if (error instanceof CoreAuthRequiredError) throw error;
    if (error instanceof PlatformApiError) throw new CoreRequestError(error.status, error.code, error.message);
    throw error;
  }
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
  if (response.status === 401) throw new CoreAuthRequiredError("legacyCoreRequest");
  if (!response.ok) throw await parseCoreError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function resetShellBootstrap() { shellBootstrap = null; }
export function invalidateApiCaches() {
  shellBootstrap = null;
  securityBootstrap = null;
}

export type CoreSession = { authenticated: boolean; impersonated?: boolean; isAdmin: boolean; user: { id: string; email: string; name: string | null } | null };
export type ImpersonationContext = { id: string; actorUserId: string; subjectUserId: string; workspaceId: string; reason: string; expiresAt?: string | null };
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
export type RuntimeNavigationItem = { id: string; pluginId: string; path: string; label: string; icon?: string; section: "user" | "administration"; displayOrder: number; rendererMode: "native" | "declarative" | "sandbox-frame"; componentId?: string; source: "platform" | "plugin" | "manual"; requiredPermission?: string };
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
    const request = workspaceId
      ? apiClient.workspaceBootstrap({ params: { workspaceId } })
      : apiClient.workspaceBootstrapCurrent();
    shellBootstrap = generated<ShellBootstrap>(request).then((bootstrap) => {
      setCurrentWorkspaceId(bootstrap.currentWorkspace.id);
      return bootstrap;
    }).catch((error) => {
      shellBootstrap = null;
      throw error;
    });
  }
  return shellBootstrap;
}

export async function loadCoreSession(): Promise<CoreSession> { return generated<CoreSession>(apiClient.coreSession()); }
export async function loadCurrentImpersonation(): Promise<ImpersonationContext | null> { return (await json<{ impersonation: ImpersonationContext | null }>("/session/impersonation")).impersonation; }
export async function stopCurrentImpersonation(): Promise<{ restored: boolean; reauthenticationRequired: boolean }> { const response = await json<{ restored: boolean; reauthenticationRequired: boolean }>("/session/impersonation/stop", { method: "POST", body: JSON.stringify({}) }); invalidateApiCaches(); return response; }
export async function loadOwnerSetup(token: string): Promise<{ setup: { workspaceId: string; ownerEmail: string; status: string; expiresAt: string } }> { return generated<{ setup: { workspaceId: string; ownerEmail: string; status: string; expiresAt: string } }>(apiClient.ownerSetupStatus({ query: { token } })); }
export async function consumeOwnerSetup(token: string): Promise<{ status: "consumed"; workspaceId: string }> { const result = await generated<{ status: "consumed"; workspaceId: string }>(apiClient.ownerSetupConsume({ body: { token } })); setCurrentWorkspaceId(result.workspaceId); resetShellBootstrap(); return result; }
export async function loadCurrentRbac(): Promise<RbacMe> { return generated<RbacMe>(apiClient.currentRbac({ params: { workspaceId: currentWorkspaceId() } })); }
export function runtimeSurfaceUrl(surfaceId: string): string { return `${coreUrl}/runtime/ui/surfaces/${encodeURIComponent(surfaceId)}?workspaceId=${encodeURIComponent(currentWorkspaceId())}`; }
export async function loadLayout(): Promise<WorkspaceLayout | null> { return (await loadShellBootstrap()).layout; }
export async function saveLayout(state: ShellState): Promise<void> { await generated(apiClient.saveLayout({ body: { workspaceId: currentWorkspaceId(), layout: { zones: state.zones, placements: state.placements } } })); resetShellBootstrap(); }
export async function loadActivePlugins(): Promise<string[]> { return (await loadShellBootstrap()).active; }
export async function loadWorkspaceUiSurfaces(): Promise<SurfaceContribution[]> { return (await loadShellBootstrap()).surfaces; }
export async function loadSettingsTabs(): Promise<RuntimeSettingsTab[]> { return (await loadShellBootstrap()).settingsNavigation.pluginTabs; }
export async function loadSettingsTab(tabId: string): Promise<RuntimeSettingsTabResolution> { return generated<RuntimeSettingsTabResolution>(apiClient.settingsTab({ params: { workspaceId: currentWorkspaceId(), tabId } })); }
export async function saveSettingsTabOrder(tabIds: string[]): Promise<void> { await generated(apiClient.settingsTabOrder({ params: { workspaceId: currentWorkspaceId() }, body: { tabIds } })); }
export async function loadInterfaceContributions(): Promise<InterfaceContribution[]> { return (await json<{ contributions: unknown[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/contributions`)).contributions.map((item) => interfaceContributionSchema.parse(item)); }
export async function updateInterfaceContribution(contributionId: string, input: Record<string, unknown>): Promise<void> { await json(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/contributions/${encodeURIComponent(contributionId)}`, { method: "PUT", body: JSON.stringify(input) }); invalidateApiCaches(); }
export async function createManualInterfacePage(input: Record<string, unknown>): Promise<{ contributionId: string; path: string }> { return (await json<{ page: { contributionId: string; path: string } }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/pages`, { method: "POST", body: JSON.stringify(input) })).page; }
export async function deleteManualInterfacePage(contributionId: string): Promise<void> { await json(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/pages/${encodeURIComponent(contributionId)}`, { method: "DELETE" }); invalidateApiCaches(); }
export async function loadRuntimePage(contributionId: string): Promise<{ contribution: InterfaceContribution; page: DeclarativePageContribution }> { const result = await json<{ contribution: unknown; page: DeclarativePageContribution }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/pages/${encodeURIComponent(contributionId)}`); return { contribution: interfaceContributionSchema.parse(result.contribution), page: result.page }; }
export async function loadPublicPage(pathname: string): Promise<{ page: DeclarativePageContribution; routeParams: Record<string, string> }> { return json<{ page: DeclarativePageContribution; routeParams: Record<string, string> }>(pathname); }
export async function loadRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> { return generated<RuntimeResultEnvelope>(apiClient.runtimeData({ body: { workspaceId: currentWorkspaceId(), contributionId, dataSourceId, routeParams } })); }
export async function executeRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> { return generated<RuntimeResultEnvelope>(apiClient.runtimeAction({ body: { workspaceId: currentWorkspaceId(), contributionId, actionId, input, routeParams } })); }
export async function loadPublicRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>(`/public/${encodeURIComponent(publicWorkspaceId)}/runtime/data`, { method: "POST", body: JSON.stringify({ contributionId, dataSourceId, routeParams }) }); }
export async function executePublicRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> { return json<RuntimeResultEnvelope>(`/public/${encodeURIComponent(publicWorkspaceId)}/runtime/actions`, { method: "POST", body: JSON.stringify({ contributionId, actionId, input, routeParams }) }); }
export async function activatePlugin(pluginId: string): Promise<void> { await generated(apiClient.activatePlugin({ body: { workspaceId: currentWorkspaceId(), pluginId } })); resetShellBootstrap(); }
export async function deactivatePlugin(pluginId: string): Promise<void> { await generated(apiClient.deactivatePlugin({ body: { workspaceId: currentWorkspaceId(), pluginId } })); resetShellBootstrap(); }
export async function loadSettings(scope: "platform" | `plugin:${string}`): Promise<Record<string, unknown>> { return (await generated<{ settings: Record<string, unknown> }>(apiClient.settingsScope({ params: { workspaceId: currentWorkspaceId(), scope } }))).settings; }
export async function saveSetting(scope: "platform" | `plugin:${string}`, key: string, value: unknown): Promise<void> { await json("/settings", { method: "PUT", body: JSON.stringify({ workspaceId: currentWorkspaceId(), scope, key, value }) }); }
export async function loadGeneralSettings(): Promise<Record<string, unknown>> { return (await generated<{ settings: Record<string, unknown> }>(apiClient.generalSettings({ params: { workspaceId: currentWorkspaceId() } }))).settings; }
export async function saveGeneralSettings(input: Record<string, unknown>): Promise<Record<string, unknown>> { return (await generated<{ settings: Record<string, unknown> }>(apiClient.saveGeneralSettings({ params: { workspaceId: currentWorkspaceId() }, body: input }))).settings; }
export async function loadSecurityBootstrap<T>(): Promise<T> {
  const workspaceId = currentWorkspaceId();
  if (!securityBootstrap || securityBootstrap.workspaceId !== workspaceId) {
    securityBootstrap = { workspaceId, promise: generated<T>(apiClient.securityBootstrap({ params: { workspaceId } })).catch((error) => { securityBootstrap = null; throw error; }) };
  }
  return securityBootstrap.promise as Promise<T>;
}
export async function loadDomains(): Promise<WorkspaceDomain[]> { return (await generated<{ domains: WorkspaceDomain[] }>(apiClient.domains({ params: { workspaceId: currentWorkspaceId() } }))).domains; }
export async function createDomain(input: { hostname: string; kind: WorkspaceDomain["kind"]; verificationMethod: WorkspaceDomain["verificationMethod"]; isPrimary?: boolean }): Promise<WorkspaceDomain[]> { return (await generated<{ domains: WorkspaceDomain[] }>(apiClient.createDomain({ params: { workspaceId: currentWorkspaceId() }, body: input }))).domains; }
export async function verifyDomain(domainId: string): Promise<WorkspaceDomain[]> { return (await generated<{ domains: WorkspaceDomain[] }>(apiClient.verifyDomain({ params: { workspaceId: currentWorkspaceId(), domainId } }))).domains; }
export async function activateDomain(domainId: string): Promise<WorkspaceDomain[]> { return (await generated<{ domains: WorkspaceDomain[] }>(apiClient.activateDomain({ params: { workspaceId: currentWorkspaceId(), domainId } }))).domains; }
export async function disableDomain(domainId: string): Promise<WorkspaceDomain[]> { return (await generated<{ domains: WorkspaceDomain[] }>(apiClient.disableDomain({ params: { workspaceId: currentWorkspaceId(), domainId } }))).domains; }
export async function loadMailSummary(): Promise<MailSummary> { return generated<MailSummary>(apiClient.mailSummary({ params: { workspaceId: currentWorkspaceId() } })); }
export async function configureMailProvider(input: MailProviderConfigure): Promise<MailSummary> { return generated<MailSummary>(apiClient.configureMailProvider({ params: { workspaceId: currentWorkspaceId() }, body: input })); }
export async function activateMailProvider(providerId: string): Promise<MailSummary> { return generated<MailSummary>(apiClient.activateMailProvider({ params: { workspaceId: currentWorkspaceId(), providerId } })); }
export async function disableMailProvider(providerId: string): Promise<MailSummary> { return generated<MailSummary>(apiClient.disableMailProvider({ params: { workspaceId: currentWorkspaceId(), providerId } })); }
export async function testMailProvider(providerId: string, to: string): Promise<MailProviderTestResult> { return generated<MailProviderTestResult>(apiClient.testMailProvider({ params: { workspaceId: currentWorkspaceId(), providerId }, body: { to } })); }
export async function executeTool(toolId: string, approvalId?: string): Promise<ToolExecutionResult> { return generated<ToolExecutionResult>(apiClient.executeTool({ body: { workspaceId: currentWorkspaceId(), toolId, ...(approvalId ? { approvalId } : {}) } })); }
export async function decideToolApproval(approvalId: string, decision: "approved" | "denied"): Promise<ToolApproval> { return (await generated<{ approval: ToolApproval }>(apiClient.decideToolApproval({ body: { workspaceId: currentWorkspaceId(), approvalId, decision } }))).approval; }
export async function loadPendingToolApprovals(): Promise<ToolApproval[]> { return (await generated<{ approvals: ToolApproval[] }>(apiClient.pendingToolApprovals({ params: { workspaceId: currentWorkspaceId() } }))).approvals; }
export async function approveToolApproval(approvalId: string): Promise<ToolApproval> { return decideToolApproval(approvalId, "approved"); }
export async function denyToolApproval(approvalId: string): Promise<ToolApproval> { return decideToolApproval(approvalId, "denied"); }
export async function loadPendingApprovalRequests(): Promise<ApprovalRequest[]> { return (await generated<{ approvals: ApprovalRequest[] }>(apiClient.pendingApprovalRequests({ params: { workspaceId: currentWorkspaceId() } }))).approvals; }
export async function decideApprovalRequest(approvalId: string, decision: "approved" | "denied"): Promise<ApprovalRequest> { return (await generated<{ approval: ApprovalRequest }>(apiClient.decideApprovalRequest({ params: { approvalId }, body: { workspaceId: currentWorkspaceId(), decision } }))).approval; }
export async function loadInstalledPlugins(): Promise<PluginManifest[]> { return (await loadShellBootstrap()).plugins; }
export async function loadMarketplacePlugins(): Promise<MarketplacePlugin[]> { return (await generated<{ plugins: MarketplacePlugin[] }>(apiClient.marketplacePlugins({ query: { workspaceId: currentWorkspaceId() } }))).plugins; }
export async function installMarketplacePlugin(pluginId: string, approvalId?: string): Promise<PluginInstallResult> { const result = await generated<PluginInstallResult>(apiClient.installMarketplacePlugin({ params: { pluginId }, query: { workspaceId: currentWorkspaceId() }, body: approvalId ? { approvalId } : {} })); resetShellBootstrap(); return result; }
export async function publishMarketplaceRelease(pluginId: string, file: File, fields?: { category?: string; source?: string; status?: "draft" | "published" | "deprecated"; demoAvailable?: boolean }): Promise<{ status: string; bundle: PluginBundle; sensitiveCapabilities: string[] }> { const body = new FormData(); body.append("file", file); if (fields?.category) body.append("category", fields.category); if (fields?.source) body.append("source", fields.source); if (fields?.status) body.append("status", fields.status); if (fields?.demoAvailable !== undefined) body.append("demoAvailable", String(fields.demoAvailable)); return generated<{ status: string; bundle: PluginBundle; sensitiveCapabilities: string[] }>(apiClient.publishMarketplaceRelease({ params: { pluginId }, body })); }
export async function loadRuntimeTools(): Promise<ToolContribution[]> { return (await loadShellBootstrap()).tools; }
export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }> { const body = new FormData(); body.append("file", file); const result = await generated<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }>(apiClient.uploadPlugin({ query: { workspaceId: currentWorkspaceId() }, body })); resetShellBootstrap(); return result; }
export async function approveInstall(approvalId: string): Promise<PluginManifest> { const manifest = (await generated<{ status: string; manifest: PluginManifest }>(apiClient.approveInstall({ body: { workspaceId: currentWorkspaceId(), approvalId } }))).manifest; resetShellBootstrap(); return manifest; }
export async function grantCapabilities(pluginId: string, capabilities: string[]): Promise<void> { await generated(apiClient.grantCapabilities({ body: { workspaceId: currentWorkspaceId(), pluginId, capabilities } })); }
