import { hc } from "hono/client";
import type { CoreApi } from "@v2/core-worker";
import { z } from "zod";
import { approvalRequestSchema, errorResponseSchema } from "@v2/rpc-contracts";
import type { ApprovalRequest, ToolApproval, ToolExecutionResult } from "@v2/rpc-contracts";
import type { DeclarativePageContribution, RuntimeResultEnvelope } from "@v2/ui-schema";
import type { PluginManifest, PluginOperation, SurfaceContribution, ToolContribution } from "@v2/plugin-contracts";
import { approvalRequestListSchema, coreSessionSchema, impersonationResponseSchema, runtimeUiBootstrapSchema, startupBootstrapSchema, marketplacePluginSchema, ownerSetupConsumeResponseSchema, ownerSetupStatusSchema, pluginInstallResultSchema, rbacMeSchema, runtimeSettingsTabSchema, runtimeSettingsTabResolutionSchema, runtimeResultEnvelopeSchema, shellBootstrapSchema, interfaceContributionSchema, stopImpersonationResponseSchema, type CoreSession, type ImpersonationContext, type RuntimeUiBootstrap, type StartupBootstrap, type MarketplacePlugin, type PluginInstallResult, type RbacMe, type RuntimeSettingsTab, type RuntimeSettingsTabResolution, type ShellBootstrap, type WorkspaceSummary, type InterfaceContribution } from "./platform-contracts";
import type { ShellState } from "@v2/ui-runtime";
export type { CoreSession, ImpersonationContext, StartupBootstrap, MarketplacePlugin, PluginInstallResult, RbacMe, RuntimeSettingsTab, RuntimeSettingsTabResolution, ShellBootstrap, WorkspaceSummary, InterfaceContribution, RuntimeNavigationItem } from "./platform-contracts";

export const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
type ResponseLike = Pick<Response, "ok" | "status" | "json" | "text">;
export const coreApi = hc<CoreApi>(coreUrl, { init: { credentials: "include" } });

let activeWorkspaceId: string | null = null;
let shellBootstrap: Promise<ShellBootstrap> | null = null;
let startupBootstrap: Promise<ShellBootstrap | null> | null = null;
let runtimeUiBootstrap: Promise<RuntimeUiBootstrap> | null = null;

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

function resetShellBootstrap() {
  shellBootstrap = null;
}

function resetRuntimeUiBootstrap() {
  runtimeUiBootstrap = null;
}

export function isCoreAuthRequiredError(error: unknown): error is CoreAuthRequiredError {
  return error instanceof CoreAuthRequiredError;
}

export function invalidateApiCaches() {
  shellBootstrap = null;
  startupBootstrap = null;
  runtimeUiBootstrap = null;
}

async function parseCoreError(response: ResponseLike) {
  const text = await response.text().catch(() => "");
  if (!text) return new CoreRequestError(response.status, undefined, `Core request failed: ${response.status}`);
  try {
    const payload = JSON.parse(text) as unknown;
    const parsed = errorResponseSchema.safeParse(payload);
    if (parsed.success) return new CoreRequestError(response.status, parsed.data.error.code, parsed.data.error.message);
    const fallback = payload as { code?: unknown; error?: unknown; message?: unknown };
    const nested = typeof fallback.error === "object" && fallback.error ? fallback.error as { code?: unknown; message?: unknown } : null;
    const code = typeof fallback.code === "string" ? fallback.code : typeof nested?.code === "string" ? nested.code : undefined;
    const message = typeof fallback.message === "string" ? fallback.message : typeof nested?.message === "string" ? nested.message : `Core request failed: ${response.status}`;
    return new CoreRequestError(response.status, code, message);
  } catch {
    return new CoreRequestError(response.status, undefined, text || `Core request failed: ${response.status}`);
  }
}

function stripJsonContentType(headers: Headers) {
  headers.delete("content-type");
}

async function coreResponse<T>(request: Promise<ResponseLike>, schema: { parse(input: unknown): T }): Promise<T> {
  const response = await request;
  if (response.status === 401) throw new CoreAuthRequiredError();
  if (!response.ok) throw await parseCoreError(response);
  if (response.status === 204) return schema.parse(undefined);
  return schema.parse(await response.json().catch(() => undefined));
}

async function resolvePluginOperation(operationId: string): Promise<{ pluginId: string; operation: PluginOperation } | null> {
  const plugins = await loadInstalledPlugins();
  for (const plugin of plugins) {
    const operation = plugin.api.operations.find((item) => item.id === operationId);
    if (operation) return { pluginId: plugin.id, operation };
  }
  return null;
}

function isPlatformSettingsOperation(operationId: string) {
  return operationId.startsWith("platform.settings.");
}

async function invokePluginOperation(workspaceId: string, operationId: string, input?: unknown, routeParams: Record<string, string> = {}, queryParams: Record<string, string | string[]> = {}) {
  const resolved = await resolvePluginOperation(operationId);
  if (!resolved) throw new CoreRequestError(404, "not_found", `Plugin operation ${operationId} is not available.`);
  return coreResponse(
    coreApi.workspaces[":workspaceId"].plugins[":pluginId"].operations[":operationId"].$post({ param: { workspaceId, pluginId: resolved.pluginId, operationId }, json: { input, routeParams, queryParams } }),
    runtimeResultEnvelopeSchema,
  );
}

export function loadShellBootstrap(workspaceId = workspaceFromLocation()): Promise<ShellBootstrap> {
  if (!shellBootstrap) {
    const request = workspaceId
      ? coreApi.workspaces[":workspaceId"].bootstrap.$get({ param: { workspaceId } })
      : coreApi.workspaces.current.bootstrap.$get();
    shellBootstrap = coreResponse(request, shellBootstrapSchema).then((bootstrap) => {
      setCurrentWorkspaceId(bootstrap.currentWorkspace.id);
      return bootstrap;
    }).catch((error) => {
      shellBootstrap = null;
      throw error;
    });
  }
  return shellBootstrap;
}

export function loadStartupBootstrap(): Promise<ShellBootstrap | null> {
  if (!startupBootstrap) {
    const workspaceId = workspaceFromLocation();
    const request = workspaceId
      ? coreApi.bootstrap.$get({ query: { workspaceId } })
      : coreApi.bootstrap.$get();
    startupBootstrap = coreResponse(request, startupBootstrapSchema).then((entry) => {
      if (!entry.authenticated) return null;
      shellBootstrap = Promise.resolve(entry.bootstrap);
      setCurrentWorkspaceId(entry.bootstrap.currentWorkspace.id);
      return entry.bootstrap;
    }).catch((error) => {
      startupBootstrap = null;
      throw error;
    });
  }
  return startupBootstrap;
}

export async function loadCoreSession(): Promise<CoreSession> {
  return coreResponse(coreApi.session.$get(), coreSessionSchema);
}

export async function loadCurrentImpersonation(): Promise<ImpersonationContext | null> {
  return (await coreResponse(coreApi.session.impersonation.$get(), impersonationResponseSchema)).impersonation;
}

export async function stopCurrentImpersonation(): Promise<{ restored: boolean; reauthenticationRequired: boolean }> {
  const response = await coreResponse(coreApi.session.impersonation.stop.$post({ json: {} }), stopImpersonationResponseSchema);
  invalidateApiCaches();
  return { restored: response.restored, reauthenticationRequired: response.reauthenticationRequired };
}

export async function loadOwnerSetup(token: string): Promise<{ setup: { workspaceId: string; ownerEmail: string; status: string; expiresAt: string } }> {
  return coreResponse(coreApi.setup.owner.$get({ query: { token } }), ownerSetupStatusSchema);
}

export async function consumeOwnerSetup(token: string): Promise<{ status: "consumed"; workspaceId: string }> {
  const result = await coreResponse(coreApi.setup.owner.consume.$post({ json: { token } }), ownerSetupConsumeResponseSchema);
  setCurrentWorkspaceId(result.workspaceId);
  invalidateApiCaches();
  return result;
}

export async function loadCurrentRbac(): Promise<RbacMe> {
  return coreResponse(coreApi.workspaces[":workspaceId"].rbac.me.$get({ param: { workspaceId: currentWorkspaceId() } }), rbacMeSchema);
}

export function runtimeSurfaceUrl(surfaceId: string): string {
  return `${coreUrl}/runtime/ui/surfaces/${encodeURIComponent(surfaceId)}?workspaceId=${encodeURIComponent(currentWorkspaceId())}`;
}

export async function saveLayout(state: ShellState): Promise<void> {
  await coreResponse(coreApi.layouts.$put({ json: { workspaceId: currentWorkspaceId(), layout: { zones: state.zones, placements: state.placements } } }), { parse: () => undefined });
  invalidateApiCaches();
}

export async function loadInterfaceContributions(): Promise<InterfaceContribution[]> {
  return (await coreResponse(
    coreApi.workspaces[":workspaceId"].interface.contributions.$get({ param: { workspaceId: currentWorkspaceId() } }),
    z.object({ contributions: z.array(interfaceContributionSchema) }),
  )).contributions;
}

export async function updateInterfaceContribution(contributionId: string, input: Record<string, unknown>): Promise<void> {
  await coreResponse(
    coreApi.workspaces[":workspaceId"].interface.contributions[":contributionId"].$put({ param: { workspaceId: currentWorkspaceId(), contributionId }, json: input }),
    { parse: () => undefined },
  );
  invalidateApiCaches();
}

export async function createManualInterfacePage(input: Record<string, unknown>): Promise<{ contributionId: string; path: string }> {
  const response = await coreResponse(
    coreApi.workspaces[":workspaceId"].interface.pages.$post({ param: { workspaceId: currentWorkspaceId() }, json: input }),
    z.object({ page: z.object({ contributionId: z.string(), path: z.string() }) }),
  );
  invalidateApiCaches();
  return response.page;
}

export async function deleteManualInterfacePage(contributionId: string): Promise<void> {
  await coreResponse(
    coreApi.workspaces[":workspaceId"].interface.pages[":contributionId"].$delete({ param: { workspaceId: currentWorkspaceId(), contributionId } }),
    { parse: () => undefined },
  );
  invalidateApiCaches();
}

export async function loadRuntimePage(contributionId: string): Promise<{ contribution: InterfaceContribution; page: DeclarativePageContribution }> {
  return coreResponse(
    coreApi.workspaces[":workspaceId"].interface.pages[":contributionId"].$get({ param: { workspaceId: currentWorkspaceId(), contributionId } }),
    z.object({ contribution: interfaceContributionSchema, page: z.any() as z.ZodType<DeclarativePageContribution> }),
  );
}

async function loadRuntimeUiBootstrap() {
  if (!runtimeUiBootstrap) {
    runtimeUiBootstrap = coreResponse(
      coreApi.runtime.ui.bootstrap.$get({ query: { workspaceId: currentWorkspaceId() } }),
      runtimeUiBootstrapSchema,
    ).catch((error) => {
      resetRuntimeUiBootstrap();
      throw error;
    });
  }
  return runtimeUiBootstrap;
}

export async function loadActivePlugins(): Promise<string[]> {
  return (await loadRuntimeUiBootstrap()).active;
}

export async function loadWorkspaceUiSurfaces(): Promise<SurfaceContribution[]> {
  return (await loadRuntimeUiBootstrap()).surfaces;
}

export async function loadSettingsTabs(): Promise<RuntimeSettingsTab[]> {
  return (await coreResponse(
    coreApi.workspaces[":workspaceId"].settings.tabs.$get({ param: { workspaceId: currentWorkspaceId() } }),
    z.object({ tabs: z.array(runtimeSettingsTabSchema) }),
  )).tabs;
}

export async function loadSettingsTab(tabId: string): Promise<RuntimeSettingsTabResolution> {
  return coreResponse(
    coreApi.workspaces[":workspaceId"].settings.tabs[":tabId"].$get({ param: { workspaceId: currentWorkspaceId(), tabId } }),
    runtimeSettingsTabResolutionSchema,
  );
}

export async function loadPublicPage(pathname: string): Promise<{ page: DeclarativePageContribution; routeParams: Record<string, string>; plugin: { id: string; name: string; version: string } | null }> {
  const headers = new Headers();
  stripJsonContentType(headers);
  const response = await fetch(pathname, { credentials: "include", headers });
  if (!response.ok) throw new CoreRequestError(response.status, undefined, `Public page request failed: ${response.status}`);
  return response.json() as Promise<{ page: DeclarativePageContribution; routeParams: Record<string, string>; plugin: { id: string; name: string; version: string } | null }>;
}

export async function loadRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> {
  if (isPlatformSettingsOperation(dataSourceId)) {
    return coreResponse(coreApi.workspaces[":workspaceId"].settings.runtime.data.$post({ param: { workspaceId: currentWorkspaceId() }, json: { workspaceId: currentWorkspaceId(), contributionId, dataSourceId, routeParams, queryParams: {} } }), runtimeResultEnvelopeSchema);
  }
  return invokePluginOperation(currentWorkspaceId(), dataSourceId, undefined, routeParams);
}

export async function executeRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> {
  if (isPlatformSettingsOperation(actionId)) {
    return coreResponse(coreApi.workspaces[":workspaceId"].settings.runtime.actions.$post({ param: { workspaceId: currentWorkspaceId() }, json: { workspaceId: currentWorkspaceId(), contributionId, actionId, input, routeParams } }), runtimeResultEnvelopeSchema);
  }
  return invokePluginOperation(currentWorkspaceId(), actionId, input, routeParams);
}

export async function loadPublicRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> {
  return coreResponse(coreApi.public[":workspaceId"].runtime.data.$post({ param: { workspaceId: publicWorkspaceId }, json: { workspaceId: publicWorkspaceId, contributionId, dataSourceId, routeParams, queryParams: {} } }), runtimeResultEnvelopeSchema);
}

export async function executePublicRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> {
  return coreResponse(coreApi.public[":workspaceId"].runtime.actions.$post({ param: { workspaceId: publicWorkspaceId }, json: { workspaceId: publicWorkspaceId, contributionId, actionId, input, routeParams } }), runtimeResultEnvelopeSchema);
}

export async function deactivatePlugin(pluginId: string): Promise<void> {
  await coreResponse(coreApi.plugins.deactivate.$post({ json: { workspaceId: currentWorkspaceId(), pluginId } }), { parse: () => undefined });
  invalidateApiCaches();
}

export async function executeTool(toolId: string, approvalId?: string): Promise<ToolExecutionResult> {
  return coreResponse(coreApi.tools.execute.$post({ json: { workspaceId: currentWorkspaceId(), toolId, ...(approvalId ? { approvalId } : {}) } }), { parse: (value) => value as ToolExecutionResult });
}

export async function decideToolApproval(approvalId: string, decision: "approved" | "denied"): Promise<ToolApproval> {
  return (await coreResponse(coreApi["tool-approvals"].decision.$post({ json: { workspaceId: currentWorkspaceId(), approvalId, decision } }), { parse: (value) => value as { approval: ToolApproval } })).approval;
}

export async function loadPendingToolApprovals(): Promise<ToolApproval[]> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"]["tool-approvals"].$get({ param: { workspaceId: currentWorkspaceId() } }), { parse: (value) => value as { approvals: ToolApproval[] } })).approvals;
}

export async function approveToolApproval(approvalId: string): Promise<ToolApproval> {
  return decideToolApproval(approvalId, "approved");
}

export async function denyToolApproval(approvalId: string): Promise<ToolApproval> {
  return decideToolApproval(approvalId, "denied");
}

export async function loadPendingApprovalRequests(): Promise<ApprovalRequest[]> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"]["approval-requests"].$get({ param: { workspaceId: currentWorkspaceId() } }), approvalRequestListSchema)).approvals;
}

export async function decideApprovalRequest(approvalId: string, decision: "approved" | "denied"): Promise<ApprovalRequest> {
  return (await coreResponse(coreApi["approval-requests"][":approvalId"].decision.$post({ param: { approvalId }, json: { workspaceId: currentWorkspaceId(), decision } }), z.object({ approval: approvalRequestSchema }))).approval;
}

export async function loadInstalledPlugins(): Promise<PluginManifest[]> {
  return (await loadRuntimeUiBootstrap()).plugins;
}

export async function loadMarketplacePlugins(): Promise<MarketplacePlugin[]> {
  return (await coreResponse(coreApi.marketplace.plugins.$get({ query: { workspaceId: currentWorkspaceId() } }), z.object({ plugins: z.array(marketplacePluginSchema) }))).plugins;
}

export async function installMarketplacePlugin(pluginId: string, approvalId?: string): Promise<PluginInstallResult> {
  const result = await coreResponse(coreApi.marketplace.plugins[":pluginId"].install.$post({ param: { pluginId }, query: { workspaceId: currentWorkspaceId() }, json: approvalId ? { approvalId } : {} }), pluginInstallResultSchema);
  invalidateApiCaches();
  return result;
}

export async function loadRuntimeTools(): Promise<ToolContribution[]> {
  return (await loadRuntimeUiBootstrap()).tools;
}

export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }> {
  const body = new FormData();
  body.append("file", file);
  const result = await coreResponse(coreApi.plugins.upload.$post({ query: { workspaceId: currentWorkspaceId() }, body }), { parse: (value) => value as { status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] } });
  invalidateApiCaches();
  return result;
}

export async function approveInstall(approvalId: string): Promise<PluginManifest> {
  const manifest = (await coreResponse(coreApi.plugins.install.$post({ json: { workspaceId: currentWorkspaceId(), approvalId } }), { parse: (value) => value as { status: string; manifest: PluginManifest } })).manifest;
  invalidateApiCaches();
  return manifest;
}
