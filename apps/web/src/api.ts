import type { PluginManifest, SurfaceContribution, ToolContribution } from "@v2/plugin-contracts";
import type { ApprovalRequest, ToolApproval, ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import type { DeclarativePageContribution, RuntimeResultEnvelope } from "@v2/ui-schema";
import {
  approvalRequestListSchema,
  coreSessionSchema,
  impersonationResponseSchema,
  interfaceContributionSchema,
  marketplacePluginSchema,
  ownerSetupConsumeResponseSchema,
  ownerSetupStatusSchema,
  pluginInstallResultSchema,
  rbacMeSchema,
  runtimeResultEnvelopeSchema,
  runtimeSettingsTabResolutionSchema,
  runtimeSettingsTabSchema,
  shellBootstrapSchema,
  startupBootstrapSchema,
  stopImpersonationResponseSchema,
  type CoreSession,
  type ImpersonationContext,
  type InterfaceContribution,
  type MarketplacePlugin,
  type PluginInstallResult,
  type RbacMe,
  type RuntimeNavigationItem,
  type RuntimeSettingsTab,
  type RuntimeSettingsTabResolution,
  type ShellBootstrap,
  type WorkspaceSummary,
} from "./platform-contracts";
import { z } from "zod";

export type {
  CoreSession,
  ImpersonationContext,
  InterfaceContribution,
  MarketplacePlugin,
  PluginInstallResult,
  RbacMe,
  RuntimeNavigationItem,
  RuntimeSettingsTab,
  RuntimeSettingsTabResolution,
  ShellBootstrap,
  WorkspaceSummary,
} from "./platform-contracts";

export const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";

let activeWorkspaceId: string | null = null;
let shellBootstrap: Promise<ShellBootstrap> | null = null;
let startupBootstrap: Promise<ShellBootstrap | null> | null = null;

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

export class CoreAuthRequiredError extends CoreRequestError {
  constructor() {
    super(401, "not_authenticated", "Authentication is required.");
    this.name = "CoreAuthRequiredError";
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

async function request<T>(path: string, schema: { parse(input: unknown): T }, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${coreUrl}${path}`, { ...init, method, credentials: "include", headers });
  if (response.status === 401) throw new CoreAuthRequiredError();
  if (!response.ok) throw await parseCoreError(response);
  if (response.status === 204) return schema.parse(undefined);
  return schema.parse(await response.json().catch(() => undefined));
}

async function requestUnknown<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request(path, { parse: (input) => input as T }, init);
}

export function invalidateApiCaches() {
  shellBootstrap = null;
  startupBootstrap = null;
}

export function loadStartupBootstrap(): Promise<ShellBootstrap | null> {
  if (!startupBootstrap) {
    const workspaceId = workspaceFromLocation();
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    startupBootstrap = request(`/bootstrap${query}`, startupBootstrapSchema).then((result) => {
      if (!result.authenticated) return null;
      shellBootstrap = Promise.resolve(result.bootstrap);
      setCurrentWorkspaceId(result.bootstrap.currentWorkspace.id);
      return result.bootstrap;
    }).catch((error: unknown) => {
      startupBootstrap = null;
      throw error;
    });
  }
  return startupBootstrap;
}

export function loadShellBootstrap(workspaceId = workspaceFromLocation()): Promise<ShellBootstrap> {
  if (!shellBootstrap) {
    const path = workspaceId ? `/workspaces/${encodeURIComponent(workspaceId)}/bootstrap` : "/workspaces/current/bootstrap";
    shellBootstrap = request(path, shellBootstrapSchema).then((bootstrap) => {
      setCurrentWorkspaceId(bootstrap.currentWorkspace.id);
      return bootstrap;
    }).catch((error: unknown) => {
      shellBootstrap = null;
      throw error;
    });
  }
  return shellBootstrap;
}

export async function loadCoreSession(): Promise<CoreSession> {
  return request("/session", coreSessionSchema);
}

export async function loadCurrentImpersonation(): Promise<ImpersonationContext | null> {
  return (await request("/session/impersonation", impersonationResponseSchema)).impersonation;
}

export async function stopCurrentImpersonation(): Promise<{ restored: boolean; reauthenticationRequired: boolean }> {
  const result = await request("/session/impersonation/stop", stopImpersonationResponseSchema, { method: "POST", body: JSON.stringify({}) });
  invalidateApiCaches();
  return { restored: result.restored, reauthenticationRequired: result.reauthenticationRequired };
}

export async function loadOwnerSetup(token: string) {
  return request(`/setup/owner?token=${encodeURIComponent(token)}`, ownerSetupStatusSchema);
}

export async function consumeOwnerSetup(token: string): Promise<{ status: "consumed"; workspaceId: string }> {
  const result = await request("/setup/owner/consume", ownerSetupConsumeResponseSchema, { method: "POST", body: JSON.stringify({ token }) });
  setCurrentWorkspaceId(result.workspaceId);
  invalidateApiCaches();
  return result;
}

export async function loadCurrentRbac(): Promise<RbacMe> {
  return request(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/rbac/me`, rbacMeSchema);
}

export function runtimeSurfaceUrl(surfaceId: string) {
  return `${coreUrl}/runtime/ui/surfaces/${encodeURIComponent(surfaceId)}?workspaceId=${encodeURIComponent(currentWorkspaceId())}`;
}

export async function saveLayout(state: ShellState): Promise<void> {
  await requestUnknown("/layouts", { method: "PUT", body: JSON.stringify({ workspaceId: currentWorkspaceId(), layout: { zones: state.zones, placements: state.placements } }) });
  invalidateApiCaches();
}

export async function loadInterfaceContributions(): Promise<InterfaceContribution[]> {
  const result = await request(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/contributions`, z.object({ contributions: z.array(interfaceContributionSchema) }));
  return result.contributions;
}

export async function updateInterfaceContribution(contributionId: string, input: Record<string, unknown>): Promise<void> {
  await requestUnknown(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/contributions/${encodeURIComponent(contributionId)}`, { method: "PUT", body: JSON.stringify(input) });
  invalidateApiCaches();
}

export async function createManualInterfacePage(input: Record<string, unknown>): Promise<{ contributionId: string; path: string }> {
  const result = await request(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/pages`, z.object({ page: z.object({ contributionId: z.string(), path: z.string() }) }), { method: "POST", body: JSON.stringify(input) });
  invalidateApiCaches();
  return result.page;
}

export async function deleteManualInterfacePage(contributionId: string): Promise<void> {
  await requestUnknown(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/pages/${encodeURIComponent(contributionId)}`, { method: "DELETE" });
  invalidateApiCaches();
}

export async function loadRuntimePage(contributionId: string): Promise<{ contribution: InterfaceContribution; page: DeclarativePageContribution }> {
  return request(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/interface/pages/${encodeURIComponent(contributionId)}`, z.object({ contribution: interfaceContributionSchema, page: z.any() as z.ZodType<DeclarativePageContribution> }));
}

export async function loadSettingsTabs(): Promise<RuntimeSettingsTab[]> {
  return (await request(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/settings/tabs`, z.object({ tabs: z.array(runtimeSettingsTabSchema) }))).tabs;
}

export async function loadSettingsTab(tabId: string): Promise<RuntimeSettingsTabResolution> {
  return request(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/settings/tabs/${encodeURIComponent(tabId)}`, runtimeSettingsTabResolutionSchema);
}

export async function loadRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> {
  return request("/runtime/ui/data", runtimeResultEnvelopeSchema, { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), contributionId, dataSourceId, routeParams, queryParams: {} }) });
}

export async function executeRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> {
  return request("/runtime/ui/actions", runtimeResultEnvelopeSchema, { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), contributionId, actionId, input, routeParams }) });
}

export async function loadPublicPage(pathname: string): Promise<{ page: DeclarativePageContribution; routeParams: Record<string, string>; plugin: { id: string; name: string; version: string } | null }> {
  return request(pathname.replace(coreUrl, ""), z.object({ page: z.any() as z.ZodType<DeclarativePageContribution>, routeParams: z.record(z.string(), z.string()), plugin: z.object({ id: z.string(), name: z.string(), version: z.string() }).nullable() }));
}

export async function loadPublicRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> {
  return request(`/public/${encodeURIComponent(publicWorkspaceId)}/runtime/data`, runtimeResultEnvelopeSchema, { method: "POST", body: JSON.stringify({ workspaceId: publicWorkspaceId, contributionId, dataSourceId, routeParams, queryParams: {} }) });
}

export async function executePublicRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> {
  return request(`/public/${encodeURIComponent(publicWorkspaceId)}/runtime/actions`, runtimeResultEnvelopeSchema, { method: "POST", body: JSON.stringify({ workspaceId: publicWorkspaceId, contributionId, actionId, input, routeParams }) });
}

export async function loadWorkspaceUiSurfaces(): Promise<SurfaceContribution[]> {
  return (await requestUnknown<{ surfaces: SurfaceContribution[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/ui/surfaces`)).surfaces;
}

export async function loadActivePlugins(): Promise<string[]> {
  return (await requestUnknown<{ active: string[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/plugins`)).active;
}

export async function loadInstalledPlugins(): Promise<PluginManifest[]> {
  return (await requestUnknown<{ plugins: PluginManifest[] }>(`/runtime/plugins?workspaceId=${encodeURIComponent(currentWorkspaceId())}`)).plugins;
}

export async function loadMarketplacePlugins(): Promise<MarketplacePlugin[]> {
  return (await request(`/marketplace/plugins?workspaceId=${encodeURIComponent(currentWorkspaceId())}`, z.object({ plugins: z.array(marketplacePluginSchema) }))).plugins;
}

export async function installMarketplacePlugin(pluginId: string, approvalId?: string): Promise<PluginInstallResult> {
  const result = await request(`/marketplace/plugins/${encodeURIComponent(pluginId)}/install?workspaceId=${encodeURIComponent(currentWorkspaceId())}`, pluginInstallResultSchema, { method: "POST", body: JSON.stringify(approvalId ? { approvalId } : {}) });
  invalidateApiCaches();
  return result;
}

export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }> {
  const body = new FormData();
  body.append("file", file);
  const result = await requestUnknown<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }>(`/plugins/upload?workspaceId=${encodeURIComponent(currentWorkspaceId())}`, { method: "POST", body });
  invalidateApiCaches();
  return result;
}

export async function approveInstall(approvalId: string): Promise<PluginManifest> {
  const result = await requestUnknown<{ status: string; manifest: PluginManifest }>("/plugins/install", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), approvalId }) });
  invalidateApiCaches();
  return result.manifest;
}

export async function deactivatePlugin(pluginId: string): Promise<void> {
  await requestUnknown("/plugins/deactivate", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), pluginId }) });
  invalidateApiCaches();
}

export async function executeTool(toolId: string, approvalId?: string): Promise<ToolExecutionResult> {
  return requestUnknown("/tools/execute", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), toolId, ...(approvalId ? { approvalId } : {}) }) });
}

export async function decideToolApproval(approvalId: string, decision: "approved" | "denied"): Promise<ToolApproval> {
  return (await requestUnknown<{ approval: ToolApproval }>("/tool-approvals/decision", { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), approvalId, decision }) })).approval;
}

export async function loadPendingToolApprovals(): Promise<ToolApproval[]> {
  return (await requestUnknown<{ approvals: ToolApproval[] }>(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/tool-approvals`)).approvals;
}

export async function approveToolApproval(approvalId: string) { return decideToolApproval(approvalId, "approved"); }
export async function denyToolApproval(approvalId: string) { return decideToolApproval(approvalId, "denied"); }

export async function loadPendingApprovalRequests(): Promise<ApprovalRequest[]> {
  return (await request(`/workspaces/${encodeURIComponent(currentWorkspaceId())}/approval-requests`, approvalRequestListSchema)).approvals;
}

export async function decideApprovalRequest(approvalId: string, decision: "approved" | "denied"): Promise<ApprovalRequest> {
  return (await requestUnknown<{ approval: ApprovalRequest }>(`/approval-requests/${encodeURIComponent(approvalId)}/decision`, { method: "POST", body: JSON.stringify({ workspaceId: currentWorkspaceId(), decision }) })).approval;
}

export async function loadRuntimeTools(): Promise<ToolContribution[]> {
  return (await requestUnknown<{ tools: ToolContribution[] }>(`/runtime/tools?workspaceId=${encodeURIComponent(currentWorkspaceId())}`)).tools;
}
