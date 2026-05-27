import { hc } from "hono/client";
import { z } from "zod";
import { approvalRequestSchema, errorResponseSchema } from "@v2/rpc-contracts";
import type { ApprovalRequest, ToolApproval, ToolExecutionResult, WorkspaceLayout } from "@v2/rpc-contracts";
import type { DeclarativePageContribution, RuntimeResultEnvelope } from "@v2/ui-schema";
import type { PluginManifest, PluginOperation, SurfaceContribution, ToolContribution } from "@v2/plugin-contracts";
import type { MailProviderConfigure, MailProviderPublicSummary, MailProviderTestResult, MailTemplate } from "@v2/mail-contracts";
import { authMethodSchema, authPolicySchema, authUiContributionSchema } from "@v2/auth-contracts";
import { approvalRequestListSchema, auditEventListSchema, authSecurityBootstrapSchema, coreSessionSchema, mailSummarySchema, marketplacePluginSchema, ownerSetupConsumeResponseSchema, ownerSetupStatusSchema, pluginInstallResultSchema, rbacMeSchema, runtimeSettingsTabResolutionSchema, runtimeResultEnvelopeSchema, shellBootstrapSchema, workspaceDomainSchema, workspacePublicationEnvelopeSchema, workspacePublicationListSchema, type AuditEvent, type AuditEventList, type AuthSecurityBootstrap, type CoreSession, type MarketplacePlugin, type PluginInstallResult, type RbacMe, type RuntimeSettingsTab, type RuntimeSettingsTabResolution, type ShellBootstrap, type WorkspaceDomain, type WorkspacePublication, type WorkspacePublicationList, type WorkspaceSummary } from "./platform-contracts";
import type { ShellState } from "@v2/ui-runtime";
import { authUrl } from "./auth-client";
export type { AuthSecurityBootstrap, CoreSession, MarketplacePlugin, PluginInstallResult, RbacMe, RuntimeSettingsTab, RuntimeSettingsTabResolution, ShellBootstrap, WorkspaceDomain, WorkspaceSummary } from "./platform-contracts";
export type { AuditEvent, AuditEventList, WorkspacePublication, WorkspacePublicationList } from "./platform-contracts";

export const coreUrl = import.meta.env.VITE_CORE_API_URL ?? "http://localhost:8787";
type HonoRequestArgs = {
  param?: Record<string, string>;
  query?: Record<string, unknown>;
  json?: unknown;
  body?: BodyInit | null;
  headers?: HeadersInit;
};
type HonoRoute = {
  $get(args?: HonoRequestArgs): Promise<Response>;
  $post(args?: HonoRequestArgs): Promise<Response>;
  $put(args?: HonoRequestArgs): Promise<Response>;
  $delete(args?: HonoRequestArgs): Promise<Response>;
};
type CoreApiClient = {
  session: { $get(args?: HonoRequestArgs): Promise<Response> };
  workspaces: {
    current: { bootstrap: HonoRoute };
    ":workspaceId": {
      bootstrap: HonoRoute;
      rbac: { me: HonoRoute };
      settings: {
        tabs: { order: { $post(args?: HonoRequestArgs): Promise<Response> }; ":tabId": HonoRoute };
        general: HonoRoute;
        ":scope": HonoRoute;
        runtime: { data: HonoRoute; actions: HonoRoute };
      };
      publications: HonoRoute;
      "audit-events": HonoRoute;
      "approval-requests": HonoRoute;
      "tool-approvals": HonoRoute;
      plugins: { ":pluginId": { operations: { ":operationId": HonoRoute } } };
      domains: { $get(args?: HonoRequestArgs): Promise<Response>; $post(args?: HonoRequestArgs): Promise<Response>; ":domainId": { verify: { $post(args?: HonoRequestArgs): Promise<Response> }; activate: { $post(args?: HonoRequestArgs): Promise<Response> }; disable: { $post(args?: HonoRequestArgs): Promise<Response> } } };
      mail: { $get(args?: HonoRequestArgs): Promise<Response>; providers: { $post(args?: HonoRequestArgs): Promise<Response>; ":providerId": { activate: { $post(args?: HonoRequestArgs): Promise<Response> }; disable: { $post(args?: HonoRequestArgs): Promise<Response> }; test: { $post(args?: HonoRequestArgs): Promise<Response> } } } };
      auth: { "security-bootstrap": HonoRoute; "security-summary": HonoRoute; sessions: { summary: HonoRoute }; methods: { ":methodId": HonoRoute }; policy: HonoRoute; "ui-contributions": HonoRoute };
    };
  };
  setup: { owner: { $get(args?: HonoRequestArgs): Promise<Response>; consume: { $post(args?: HonoRequestArgs): Promise<Response> } } };
  layouts: { $put(args?: HonoRequestArgs): Promise<Response> };
  public: { ":workspaceId": { runtime: { data: HonoRoute; actions: HonoRoute } } };
  plugins: { activate: { $post(args?: HonoRequestArgs): Promise<Response> }; deactivate: { $post(args?: HonoRequestArgs): Promise<Response> }; upload: { $post(args?: HonoRequestArgs): Promise<Response> }; install: { $post(args?: HonoRequestArgs): Promise<Response> }; grants: { $post(args?: HonoRequestArgs): Promise<Response> } };
  settings: { $put(args?: HonoRequestArgs): Promise<Response> };
  "tool-approvals": { decision: { $post(args?: HonoRequestArgs): Promise<Response> } };
  "approval-requests": { ":approvalId": { decision: { $post(args?: HonoRequestArgs): Promise<Response> } } };
  marketplace: { plugins: { $get(args?: HonoRequestArgs): Promise<Response>; ":pluginId": { releases: { $post(args?: HonoRequestArgs): Promise<Response> }; install: { $post(args?: HonoRequestArgs): Promise<Response> } } } };
  publications: { $post(args?: HonoRequestArgs): Promise<Response>; ":publicationId": { $put(args?: HonoRequestArgs): Promise<Response>; $delete(args?: HonoRequestArgs): Promise<Response> } };
  tools: { execute: { $post(args?: HonoRequestArgs): Promise<Response> } };
};
export const coreApi = hc(coreUrl, { init: { credentials: "include" } }) as unknown as CoreApiClient;

let activeWorkspaceId: string | null = null;
let shellBootstrap: Promise<ShellBootstrap> | null = null;
let securityBootstrap: { workspaceId: string; promise: Promise<AuthSecurityBootstrap> } | null = null;

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

export function isCoreAuthRequiredError(error: unknown): error is CoreAuthRequiredError {
  return error instanceof CoreAuthRequiredError;
}

export function invalidateApiCaches() {
  shellBootstrap = null;
  securityBootstrap = null;
}

async function parseCoreError(response: Response) {
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

async function coreResponse<T>(request: Promise<Response>, schema: { parse(input: unknown): T }): Promise<T> {
  const response = await request;
  if (response.status === 401) throw new CoreAuthRequiredError();
  if (!response.ok) throw await parseCoreError(response);
  if (response.status === 204) return schema.parse(undefined);
  return schema.parse(await response.json().catch(() => undefined));
}

async function resolvePluginOperation(operationId: string): Promise<{ pluginId: string; operation: PluginOperation } | null> {
  const bootstrap = await loadShellBootstrap();
  for (const plugin of bootstrap.plugins) {
    const operation = plugin.api.operations.find((item) => item.id === operationId);
    if (operation) return { pluginId: plugin.id, operation };
  }
  return null;
}

async function invokePluginOperation(workspaceId: string, operationId: string, input?: unknown, routeParams: Record<string, string> = {}, queryParams: Record<string, string | string[]> = {}) {
  const resolved = await resolvePluginOperation(operationId);
  if (!resolved) throw new CoreRequestError(404, "not_found", `Plugin operation ${operationId} is not available.`);
  return coreResponse(
    coreApi.workspaces[":workspaceId"].plugins[":pluginId"].operations[":operationId"].$post({ param: { workspaceId, pluginId: resolved.pluginId, operationId }, json: { input, routeParams, queryParams } }),
    runtimeResultEnvelopeSchema,
  );
}

export type CoreSessionValue = CoreSession;
export type WorkspaceSummaryValue = WorkspaceSummary;
export type RuntimeSettingsTabValue = RuntimeSettingsTab;

export type MarketplacePluginValue = MarketplacePlugin;
export type PluginInstallResultValue = PluginInstallResult;
export type AuthSecurityBootstrapValue = AuthSecurityBootstrap;
export type AuthSecuritySummary = AuthSecurityBootstrap["summary"];
export type WorkspaceDomainValue = WorkspaceDomain;

export type MailSummary = {
  providers: MailProviderPublicSummary[];
  templates: MailTemplate[];
  events: { id: string; provider_id: string | null; template_key: string | null; status: string; purpose: string; error_safe: string | null; created_at: string; completed_at: string | null }[];
  activeProvider: MailProviderPublicSummary | null;
};

export type ShellBootstrapValue = ShellBootstrap;

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

export async function loadCoreSession(): Promise<CoreSession> {
  return coreResponse(coreApi.session.$get(), coreSessionSchema);
}

export async function loadOwnerSetup(token: string): Promise<{ setup: { workspaceId: string; ownerEmail: string; status: string; expiresAt: string } }> {
  return coreResponse(coreApi.setup.owner.$get({ query: { token } }), ownerSetupStatusSchema);
}

export async function consumeOwnerSetup(token: string): Promise<{ status: "consumed"; workspaceId: string }> {
  const result = await coreResponse(coreApi.setup.owner.consume.$post({ json: { token } }), ownerSetupConsumeResponseSchema);
  setCurrentWorkspaceId(result.workspaceId);
  resetShellBootstrap();
  return result;
}

export async function loadCurrentRbac(): Promise<RbacMe> {
  return coreResponse(coreApi.workspaces[":workspaceId"].rbac.me.$get({ param: { workspaceId: currentWorkspaceId() } }), rbacMeSchema);
}

export function runtimeSurfaceUrl(surfaceId: string): string {
  return `${coreUrl}/runtime/ui/surfaces/${encodeURIComponent(surfaceId)}?workspaceId=${encodeURIComponent(currentWorkspaceId())}`;
}

export async function loadLayout(): Promise<WorkspaceLayout | null> {
  return (await loadShellBootstrap()).layout;
}

export async function saveLayout(state: ShellState): Promise<void> {
  await coreResponse(coreApi.layouts.$put({ json: { workspaceId: currentWorkspaceId(), layout: { zones: state.zones, placements: state.placements } } }), { parse: () => undefined });
  resetShellBootstrap();
}

export async function loadActivePlugins(): Promise<string[]> {
  return (await loadShellBootstrap()).active;
}

export async function loadWorkspaceUiSurfaces(): Promise<SurfaceContribution[]> {
  return (await loadShellBootstrap()).surfaces;
}

export async function loadSettingsTabs(): Promise<RuntimeSettingsTab[]> {
  return (await loadShellBootstrap()).settingsNavigation.pluginTabs;
}

export async function reorderSettingsTabs(tabIds: string[]): Promise<void> {
  await coreResponse(coreApi.workspaces[":workspaceId"].settings.tabs.order.$post({ param: { workspaceId: currentWorkspaceId() }, json: { tabIds } }), { parse: () => undefined });
  resetShellBootstrap();
}

export async function loadSettingsTab(tabId: string): Promise<RuntimeSettingsTabResolution> {
  return coreResponse(coreApi.workspaces[":workspaceId"].settings.tabs[":tabId"].$get({ param: { workspaceId: currentWorkspaceId(), tabId } }), runtimeSettingsTabResolutionSchema);
}

export async function loadWorkspacePublications(): Promise<WorkspacePublicationList> {
  return coreResponse(coreApi.workspaces[":workspaceId"].publications.$get({ param: { workspaceId: currentWorkspaceId() } }), workspacePublicationListSchema);
}

export async function loadAuthSecuritySummary(workspaceId = currentWorkspaceId()): Promise<AuthSecuritySummary> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].auth["security-bootstrap"].$get({ param: { workspaceId } }), authSecurityBootstrapSchema)).summary;
}

export async function loadAuthSessionsSummary(workspaceId = currentWorkspaceId()): Promise<AuthSecurityBootstrap["sessions"]> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].auth["security-bootstrap"].$get({ param: { workspaceId } }), authSecurityBootstrapSchema)).sessions;
}

export async function saveAuthPolicy(policy: AuthSecuritySummary["policy"], workspaceId = currentWorkspaceId()): Promise<AuthSecuritySummary["policy"]> {
  const result = await coreResponse(
    coreApi.workspaces[":workspaceId"].auth.policy.$put({
      param: { workspaceId },
      json: { workspaceId, registrationMode: policy.registrationMode, requireEmailVerification: policy.requireEmailVerification, allowPasskeyRegistration: policy.allowPasskeyRegistration, allowPasskeySignin: policy.allowPasskeySignin },
    }),
    { parse: (value) => z.object({ policy: authPolicySchema }).parse(value) },
  );
  return result.policy;
}

export async function saveAuthMethod(method: AuthSecuritySummary["methods"][number], workspaceId = currentWorkspaceId()): Promise<AuthSecuritySummary["methods"][number]> {
  const result = await coreResponse(
    coreApi.workspaces[":workspaceId"].auth.methods[":methodId"].$put({
      param: { workspaceId, methodId: method.id },
      json: { workspaceId, type: method.type, providerId: method.providerId, title: method.title, status: method.status, publicVisible: method.publicVisible, displayOrder: method.displayOrder },
    }),
    { parse: (value) => z.object({ method: authMethodSchema }).parse(value) },
  );
  return result.method;
}

export async function loadAuthUiContributions(workspaceId = currentWorkspaceId()): Promise<import("@v2/auth-contracts").AuthUiContribution[]> {
  const result = await coreResponse(coreApi.workspaces[":workspaceId"].auth["ui-contributions"].$get({ param: { workspaceId } }), { parse: (value) => z.object({ contributions: z.array(authUiContributionSchema) }).parse(value) });
  return result.contributions;
}

export async function createWorkspacePublication(input: { pluginId: string; contributionKind: "route" | "surface" | "tool"; contributionId: string; publicPath?: string; title?: string; access?: "anonymous" | "authenticated" }): Promise<WorkspacePublication> {
  return (await coreResponse(coreApi.publications.$post({ json: { workspaceId: currentWorkspaceId(), ...input } }), workspacePublicationEnvelopeSchema)).publication;
}

export async function updateWorkspacePublication(publicationId: string, input: { title?: string; publicPath?: string; status?: "draft" | "published" | "unpublished" | "disabled"; access?: "anonymous" | "authenticated"; authenticationMode?: "anonymous" | "customer" | "verified" }): Promise<WorkspacePublication> {
  return (await coreResponse(coreApi.publications[":publicationId"].$put({ param: { publicationId }, json: { workspaceId: currentWorkspaceId(), ...input } }), workspacePublicationEnvelopeSchema)).publication;
}

export async function deleteWorkspacePublication(publicationId: string): Promise<void> {
  await coreResponse(coreApi.publications[":publicationId"].$delete({ param: { publicationId }, query: { workspaceId: currentWorkspaceId() } }), { parse: () => undefined });
}

export async function loadAuditEvents(): Promise<AuditEventList> {
  return coreResponse(coreApi.workspaces[":workspaceId"]["audit-events"].$get({ param: { workspaceId: currentWorkspaceId() } }), auditEventListSchema);
}

export async function loadPublicPage(pathname: string): Promise<{ page: DeclarativePageContribution; routeParams: Record<string, string>; plugin: { id: string; name: string; version: string } | null }> {
  const headers = new Headers();
  stripJsonContentType(headers);
  const response = await fetch(pathname, { credentials: "include", headers });
  if (!response.ok) throw new CoreRequestError(response.status, undefined, `Public page request failed: ${response.status}`);
  return response.json() as Promise<{ page: DeclarativePageContribution; routeParams: Record<string, string>; plugin: { id: string; name: string; version: string } | null }>;
}

export async function loadRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> {
  const workspace = await loadShellBootstrap();
  const plugin = workspace.plugins.find((candidate) => candidate.api.operations.some((operation) => operation.id === dataSourceId || operation.id === contributionId));
  if (!plugin) throw new CoreRequestError(404, "not_found", `No plugin declares the ${dataSourceId} operation.`);
  return invokePluginOperation(workspace.currentWorkspace.id, dataSourceId, { contributionId, routeParams }, routeParams);
}

export async function executeRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}): Promise<RuntimeResultEnvelope> {
  const workspace = await loadShellBootstrap();
  const plugin = workspace.plugins.find((candidate) => candidate.api.operations.some((operation) => operation.id === actionId));
  if (!plugin) throw new CoreRequestError(404, "not_found", `No plugin declares the ${actionId} operation.`);
  return invokePluginOperation(workspace.currentWorkspace.id, actionId, input, routeParams);
}

export async function loadPublicRuntimeData(contributionId: string, dataSourceId: string, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> {
  return coreResponse(
    coreApi.public[":workspaceId"].runtime.data.$post({
      param: { workspaceId: publicWorkspaceId },
      json: { workspaceId: publicWorkspaceId, contributionId, dataSourceId, routeParams, queryParams: {} },
    }),
    runtimeResultEnvelopeSchema,
  );
}

export async function executePublicRuntimeAction(contributionId: string, actionId: string, input?: unknown, routeParams: Record<string, string> = {}, publicWorkspaceId = currentWorkspaceId()): Promise<RuntimeResultEnvelope> {
  return coreResponse(
    coreApi.public[":workspaceId"].runtime.actions.$post({
      param: { workspaceId: publicWorkspaceId },
      json: { workspaceId: publicWorkspaceId, contributionId, actionId, input, routeParams, approvalId: undefined },
    }),
    runtimeResultEnvelopeSchema,
  );
}

export async function activatePlugin(pluginId: string): Promise<void> {
  await coreResponse(coreApi.plugins.activate.$post({ json: { workspaceId: currentWorkspaceId(), pluginId } }), { parse: () => undefined });
  resetShellBootstrap();
}

export async function deactivatePlugin(pluginId: string): Promise<void> {
  await coreResponse(coreApi.plugins.deactivate.$post({ json: { workspaceId: currentWorkspaceId(), pluginId } }), { parse: () => undefined });
  resetShellBootstrap();
}

export async function loadSettings(scope: "platform" | `plugin:${string}`): Promise<Record<string, unknown>> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].settings[":scope"].$get({ param: { workspaceId: currentWorkspaceId(), scope } }), { parse: (value) => value as { settings: Record<string, unknown> } })).settings;
}

export async function saveSetting(scope: "platform" | `plugin:${string}`, key: string, value: unknown): Promise<void> {
  await coreResponse(coreApi.settings.$put({ json: { workspaceId: currentWorkspaceId(), scope, key, value } }), { parse: () => undefined });
}

export async function loadGeneralSettings(): Promise<Record<string, unknown>> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].settings.general.$get({ param: { workspaceId: currentWorkspaceId() } }), { parse: (value) => value as { settings: Record<string, unknown> } })).settings;
}

export async function saveGeneralSettings(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].settings.general.$put({ param: { workspaceId: currentWorkspaceId() }, json: input }), { parse: (value) => value as { settings: Record<string, unknown> } })).settings;
}

export async function loadSecurityBootstrap(): Promise<AuthSecurityBootstrap> {
  const workspaceId = currentWorkspaceId();
  if (!securityBootstrap || securityBootstrap.workspaceId !== workspaceId) {
    securityBootstrap = {
      workspaceId,
      promise: coreResponse(coreApi.workspaces[":workspaceId"].auth["security-bootstrap"].$get({ param: { workspaceId } }), authSecurityBootstrapSchema).catch((error) => {
        securityBootstrap = null;
        throw error;
      }),
    };
  }
  return securityBootstrap.promise;
}

export async function loadDomains(): Promise<WorkspaceDomain[]> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].domains.$get({ param: { workspaceId: currentWorkspaceId() } }), { parse: (value) => value as { domains: WorkspaceDomain[] } })).domains;
}

export async function createDomain(input: { hostname: string; kind: WorkspaceDomain["kind"]; verificationMethod: WorkspaceDomain["verificationMethod"]; isPrimary?: boolean }): Promise<WorkspaceDomain[]> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].domains.$post({ param: { workspaceId: currentWorkspaceId() }, json: input }), { parse: (value) => value as { domains: WorkspaceDomain[] } })).domains;
}

export async function verifyDomain(domainId: string): Promise<WorkspaceDomain[]> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].domains[":domainId"].verify.$post({ param: { workspaceId: currentWorkspaceId(), domainId } }), { parse: (value) => value as { domains: WorkspaceDomain[] } })).domains;
}

export async function activateDomain(domainId: string): Promise<WorkspaceDomain[]> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].domains[":domainId"].activate.$post({ param: { workspaceId: currentWorkspaceId(), domainId } }), { parse: (value) => value as { domains: WorkspaceDomain[] } })).domains;
}

export async function disableDomain(domainId: string): Promise<WorkspaceDomain[]> {
  return (await coreResponse(coreApi.workspaces[":workspaceId"].domains[":domainId"].disable.$post({ param: { workspaceId: currentWorkspaceId(), domainId } }), { parse: (value) => value as { domains: WorkspaceDomain[] } })).domains;
}

export async function loadMailSummary(): Promise<MailSummary> {
  return coreResponse(coreApi.workspaces[":workspaceId"].mail.$get({ param: { workspaceId: currentWorkspaceId() } }), mailSummarySchema);
}

export async function configureMailProvider(input: MailProviderConfigure): Promise<MailSummary> {
  return coreResponse(coreApi.workspaces[":workspaceId"].mail.providers.$post({ param: { workspaceId: currentWorkspaceId() }, json: input }), mailSummarySchema);
}

export async function activateMailProvider(providerId: string): Promise<MailSummary> {
  return coreResponse(coreApi.workspaces[":workspaceId"].mail.providers[":providerId"].activate.$post({ param: { workspaceId: currentWorkspaceId(), providerId } }), mailSummarySchema);
}

export async function disableMailProvider(providerId: string): Promise<MailSummary> {
  return coreResponse(coreApi.workspaces[":workspaceId"].mail.providers[":providerId"].disable.$post({ param: { workspaceId: currentWorkspaceId(), providerId } }), mailSummarySchema);
}

export async function testMailProvider(providerId: string, to: string): Promise<MailProviderTestResult> {
  return coreResponse(coreApi.workspaces[":workspaceId"].mail.providers[":providerId"].test.$post({ param: { workspaceId: currentWorkspaceId(), providerId }, json: { to } }), { parse: (value) => value as MailProviderTestResult });
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
  return (await loadShellBootstrap()).plugins;
}

export async function loadMarketplacePlugins(): Promise<MarketplacePlugin[]> {
  return (await coreResponse(coreApi.marketplace.plugins.$get({ query: { workspaceId: currentWorkspaceId() } }), { parse: (value) => value as { plugins: MarketplacePlugin[] } })).plugins;
}

export async function installMarketplacePlugin(pluginId: string, approvalId?: string): Promise<PluginInstallResult> {
  const result = await coreResponse(coreApi.marketplace.plugins[":pluginId"].install.$post({ param: { pluginId }, query: { workspaceId: currentWorkspaceId() }, json: approvalId ? { approvalId } : {} }), pluginInstallResultSchema);
  resetShellBootstrap();
  return result;
}

export async function publishMarketplaceRelease(pluginId: string, file: File, fields?: { category?: string; source?: string; status?: "draft" | "published" | "deprecated"; demoAvailable?: boolean }): Promise<{ status: string; bundle: PluginManifest; sensitiveCapabilities: string[] }> {
  const body = new FormData();
  body.append("file", file);
  if (fields?.category) body.append("category", fields.category);
  if (fields?.source) body.append("source", fields.source);
  if (fields?.status) body.append("status", fields.status);
  if (fields?.demoAvailable !== undefined) body.append("demoAvailable", String(fields.demoAvailable));
  return coreResponse(coreApi.marketplace.plugins[":pluginId"].releases.$post({ param: { pluginId }, body }), { parse: (value) => value as { status: string; bundle: PluginManifest; sensitiveCapabilities: string[] } });
}

export async function loadRuntimeTools(): Promise<ToolContribution[]> {
  return (await loadShellBootstrap()).tools;
}

export async function uploadPlugin(file: File): Promise<{ status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] }> {
  const body = new FormData();
  body.append("file", file);
  const result = await coreResponse(coreApi.plugins.upload.$post({ query: { workspaceId: currentWorkspaceId() }, body }), { parse: (value) => value as { status: string; manifest?: PluginManifest; approvalId?: string; pluginId?: string; version?: string; sha256?: string; sensitiveCapabilities?: string[] } });
  resetShellBootstrap();
  return result;
}

export async function approveInstall(approvalId: string): Promise<PluginManifest> {
  const manifest = (await coreResponse(coreApi.plugins.install.$post({ json: { workspaceId: currentWorkspaceId(), approvalId } }), { parse: (value) => value as { status: string; manifest: PluginManifest } })).manifest;
  resetShellBootstrap();
  return manifest;
}

export async function grantCapabilities(pluginId: string, capabilities: string[]): Promise<void> {
  await coreResponse(coreApi.plugins.grants.$post({ json: { workspaceId: currentWorkspaceId(), pluginId, capabilities } }), { parse: () => undefined });
}
