import { Hono, type Context, type Handler } from "hono";
import { z } from "zod";
import type { WorkspaceLayout, SettingScope } from "@v2/rpc-contracts";
import {
  approvalRequestDecisionRequestSchema,
  capabilityGrantRequestSchema,
  layoutWriteRequestSchema,
  pluginActivationRequestSchema,
  pluginInstallRequestSchema,
  settingScopeSchema,
  toolApprovalDecisionRequestSchema,
  toolExecutionRequestSchema,
} from "@v2/rpc-contracts";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { mailProviderConfigureSchema } from "@v2/mail-contracts";
import { runtimeActionRequestSchema, runtimeDataRequestSchema } from "@v2/ui-schema";
import { RuntimeKernel } from "@v2/runtime";
import { assessPluginBundle, extractDeclaredHtmlAsset, unpackPluginZip } from "@v2/plugin-installer";
import { CoreRepository, type WorkspacePermission } from "./repository";
import { ApprovalRequestRepository } from "./approval-requests";
import { ToolApprovalRepository } from "./tool-approvals";
import { allowedOrigins, isInternalRequest } from "./access";
import type { CoreEnv } from "./env";

type CoreApiEnv = { Bindings: CoreEnv; Variables: { user: { id: string; email: string; name?: string | null; impersonatedBy?: string | null } | null; internal: boolean } };
const coreApiRoutes0 = new Hono<CoreApiEnv>();
type CoreContext = Context<CoreApiEnv>;
const readResponseCache = new Map<string, { expiresAt: number; response: Response }>();
const sessionAssertionCache = new Map<string, { expiresAt: number; user: { id: string; email: string; name?: string | null; impersonatedBy?: string | null } | null }>();
type ResponseLike = Pick<Response, "ok" | "status" | "json" | "text">;
type JsonInput<TJson> = { in: { json: TJson } };
type JsonQueryInput<TJson, TQuery extends Record<string, string | string[]>> = { in: { json: TJson; query: TQuery } };
type QueryInput<TQuery extends Record<string, string | string[]>> = { in: { query: TQuery } };

function isPlatformAdmin(env: CoreEnv, user: { email: string } | null | undefined) {
  const admins = new Set((env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  return Boolean(user && admins.has(user.email.toLowerCase()));
}

function requestCredentialKey(c: CoreContext) {
  return c.req.header("authorization") ?? c.req.header("cookie") ?? "";
}

function browserCorsOrigin(env: CoreEnv, origin: string) {
  return allowedOrigins(env).includes(origin) ? origin : null;
}

function applyBrowserCors(c: CoreContext, origin: string) {
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  c.header("Access-Control-Expose-Headers", "Content-Length");
  c.header("Vary", "Origin");
}

async function resolveSession(c: CoreContext) {
  const key = requestCredentialKey(c);
  if (!key) return null;
  const cached = sessionAssertionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  const headers = new Headers();
  const cookie = c.req.header("cookie");
  const authorization = c.req.header("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  const response = await c.env.AUTH.fetch("https://auth.internal/api/auth/get-session", { headers });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as { user?: { id?: string; email?: string; name?: string | null }; session?: { impersonatedBy?: string | null } } | null;
  const user = payload?.user?.id && payload.user.email ? { id: payload.user.id, email: payload.user.email, name: payload.user.name ?? null, impersonatedBy: payload.session?.impersonatedBy ?? null } : null;
  sessionAssertionCache.set(key, { expiresAt: Date.now() + 30_000, user });
  return user;
}

function needsAuthentication(path: string) {
  return path !== "/health" && !path.startsWith("/public/") && !path.startsWith("/setup/owner") && path !== "/bootstrap";
}

const coreApiRoutes1 = coreApiRoutes0.use("*", async (c, next) => {
  const user = await resolveSession(c);
  c.set("user", user);
  c.set("internal", isInternalRequest(c.req.raw));
  if (needsAuthentication(c.req.path) && !user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  await next();
});

function requireRead(c: CoreContext) {
  if (!c.get("user")) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  return undefined;
}

async function requirePermission(c: CoreContext, workspaceId: string, permission: WorkspacePermission) {
  const user = c.get("user");
  if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  if (isPlatformAdmin(c.env, user)) return null;
  if (!await new CoreRepository(c.env.CORE_DB).hasPermission(workspaceId, user, permission)) return c.json(errorResponse(failure("not_authorized", `${permission} permission is required.`)), 403);
  return undefined;
}

function validatePluginValue(value: unknown, contract: { type?: string; required?: string[]; properties?: Record<string, any>; additionalProperties?: boolean }, path = "input"): { ok: true } | { ok: false; message: string } {
  if (!contract || !contract.type) return { ok: true };
  if (contract.type === "string") return typeof value === "string" ? { ok: true } : { ok: false, message: `${path} must be a string.` };
  if (contract.type === "number") return typeof value === "number" ? { ok: true } : { ok: false, message: `${path} must be a number.` };
  if (contract.type === "boolean") return typeof value === "boolean" ? { ok: true } : { ok: false, message: `${path} must be a boolean.` };
  if (contract.type === "array") return Array.isArray(value) ? { ok: true } : { ok: false, message: `${path} must be an array.` };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, message: `${path} must be an object.` };
  const objectValue = value as Record<string, unknown>;
  for (const key of contract.required ?? []) {
    if (!(key in objectValue)) return { ok: false, message: `${path}.${key} is required.` };
  }
  for (const [key, nestedContract] of Object.entries(contract.properties ?? {})) {
    if (key in objectValue) {
      const nested = validatePluginValue(objectValue[key], nestedContract, `${path}.${key}`);
      if (!nested.ok) return nested;
    }
  }
  if (contract.additionalProperties === false) {
    for (const key of Object.keys(objectValue)) {
      if (!(key in (contract.properties ?? {}))) return { ok: false, message: `${path}.${key} is not allowed.` };
    }
  }
  return { ok: true };
}
function normalizeEmptyString(value: unknown) { return value === "" ? null : value; }
function objectInput(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function domainKind(value: unknown): "admin" | "auth" | "website" | "storefront" | "public-chat" | "mail" {
  return value === "admin" || value === "auth" || value === "storefront" || value === "public-chat" || value === "mail" ? value : "website";
}
function domainVerification(value: unknown): "manual" | "dns-txt" | "dns-cname" {
  return value === "dns-txt" || value === "dns-cname" ? value : "manual";
}
function layoutFromInput(input: unknown) {
  const value = objectInput(input);
  if ("layout" in value && value.layout && typeof value.layout === "object" && !Array.isArray(value.layout)) return value.layout as WorkspaceLayout;
  if (Array.isArray(value.zones) && Array.isArray(value.placements)) return value as WorkspaceLayout;
  return null;
}
function safeRuntimeKey(workspaceId: string, pluginId: string) {
  return `${workspaceId}-${pluginId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 63);
}
async function runtimeFor(repo: CoreRepository) {
  const runtime = new RuntimeKernel();
  for (const manifest of await repo.installed()) await runtime.registerPlugin(manifest);
  return runtime;
}
async function requireAllPermissions(c: CoreContext, workspaceId: string, permissions: string[]) {
  const user = c.get("user");
  if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  const repo = new CoreRepository(c.env.CORE_DB);
  if (!await repo.hasAllPermissions(workspaceId, user, permissions as WorkspacePermission[])) return c.json(errorResponse(failure("not_authorized", `${permissions.join(", ")} permission(s) are required.`)), 403);
  return null;
}
async function authAdminJson<T>(c: CoreContext, path: string, init?: { method?: string; body?: string }): Promise<T> {
  const headers = new Headers();
  const cookie = c.req.header("cookie");
  const authorization = c.req.header("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  if (init?.body) headers.set("content-type", "application/json");
  const requestInit = init?.body
    ? { ...(init.method ? { method: init.method } : {}), body: init.body, headers }
    : { ...(init?.method ? { method: init.method } : {}), headers };
  const response = await c.env.AUTH.fetch(`https://auth.internal${path}`, requestInit);
  if (!response.ok) throw new Error(`Auth administration failed: ${response.status}`);
  return response.json() as Promise<T>;
}
async function verifyDnsDomain(domain: { hostname: string; verificationMethod: "manual" | "dns-txt" | "dns-cname"; verificationInstructions: Record<string, unknown> | null }) {
  if (domain.verificationMethod === "manual") return { ok: false, error: "Manual verification requires an explicit audited recovery path." };
  const record = domain.verificationMethod === "dns-cname"
    ? typeof domain.verificationInstructions?.cnameRecord === "string" ? domain.verificationInstructions.cnameRecord : `_v2-verify.${domain.hostname}`
    : typeof domain.verificationInstructions?.txtRecord === "string" ? domain.verificationInstructions.txtRecord : `_v2-verify.${domain.hostname}`;
  const expected = domain.verificationMethod === "dns-cname"
    ? typeof domain.verificationInstructions?.target === "string" ? domain.verificationInstructions.target.toLowerCase() : ""
    : typeof domain.verificationInstructions?.token === "string" ? domain.verificationInstructions.token.toLowerCase() : "";
  if (!expected) return { ok: false, error: "Domain verification target is missing." };
  const type = domain.verificationMethod === "dns-cname" ? "CNAME" : "TXT";
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(record)}&type=${type}`, { headers: { accept: "application/dns-json" } });
  if (!response.ok) return { ok: false, error: "DNS verification lookup failed." };
  const body = await response.json() as { Answer?: Array<{ data?: string }> };
  const answers = (body.Answer ?? []).map((answer) => String(answer.data ?? "").replaceAll("\"", "").toLowerCase());
  return answers.some((answer) => answer.includes(expected)) ? { ok: true } : { ok: false, error: "Expected DNS verification record was not found." };
}
function runtimeUnavailable(message = "Plugin runtime is not deployed in the dispatch namespace.") {
  return { status: "unavailable" as const, error: message };
}
function pluginOperationEnvelope(status: "ok" | "denied" | "approval-required" | "unavailable", data: unknown = null, error: string | null = null, approvalId: string | null = null, auditEventId: string | null = null) {
  return { status, data, error, approvalId, auditEventId };
}
async function pluginRuntimeDispatch(c: CoreContext, request: { workspaceId: string; pluginId: string; runtimeKey: string; kind: "tool" | "action" | "data" | "operation"; operationId: string; contributionId?: string | undefined; input?: unknown; routeParams?: Record<string, string> | undefined; queryParams?: Record<string, string | string[]> | undefined }) {
  if (!c.env.PLUGIN_RUNTIME) return null;
  const response = await c.env.PLUGIN_RUNTIME.fetch("https://plugin-runtime.internal/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}
async function activeRuntimeOrAudit(repo: CoreRepository, workspaceId: string, pluginId: string, action: string, actorId?: string) {
  const deployment = await repo.activePluginRuntime(workspaceId, pluginId);
  if (!deployment) {
    await repo.audit(workspaceId, `${action}.unavailable`, { pluginId }, actorId);
    return null;
  }
  return deployment;
}
async function provisionPluginRuntime(c: CoreContext, repo: CoreRepository, workspaceId: string, pluginId: string, releaseId: string, bundle: ReturnType<typeof assessPluginBundle>["bundle"]) {
  const runtimeKey = safeRuntimeKey(workspaceId, pluginId);
  const localDeployment = { workspaceId, pluginId, releaseId, runtimeKey, runtimeKind: "local-dev" as const, runtimeStatus: "provisioning" as const, deployedVersion: bundle.manifest.version, deploymentId: null as string | null, lastError: null as string | null };
  await repo.upsertPluginRuntimeDeployment(localDeployment);
  if (!c.env.PLATFORM_PROVISIONER) {
    await repo.upsertPluginRuntimeDeployment({ ...localDeployment, runtimeStatus: "deployed" });
    return { ok: true as const, runtimeKey, runtimeKind: "local-dev" as const, deploymentId: `local-dev:${workspaceId}:${pluginId}:${releaseId}` };
  }
  const response = await c.env.PLATFORM_PROVISIONER.fetch("https://platform-provisioner.internal/internal/plugin-runtimes/provision", {
    method: "POST",
    headers: { "content-type": "application/json", ...(c.env.PROVISIONING_SECRET ? { "x-v2-provisioner-secret": c.env.PROVISIONING_SECRET } : {}) },
    body: JSON.stringify({ workspaceId, pluginId, releaseId, version: bundle.manifest.version, resources: [], worker: { isolation: bundle.worker.isolation } }),
  });
  const payload = await response.json().catch(() => null) as { status?: string; runtimeKey?: string; runtimeKind?: "dispatch-namespace" | "local-dev"; deploymentId?: string; deployedVersion?: string; error?: { message?: string } } | null;
  if (!response.ok || payload?.status !== "deployed") {
    await repo.upsertPluginRuntimeDeployment({ ...localDeployment, runtimeStatus: "failed", lastError: payload?.error?.message ?? `Runtime provisioning failed: ${response.status}` });
    return { ok: false as const, errorSafe: payload?.error?.message ?? `Runtime provisioning failed: ${response.status}` };
  }
  await repo.upsertPluginRuntimeDeployment({
    workspaceId,
    pluginId,
    releaseId,
    runtimeKey: payload.runtimeKey ?? runtimeKey,
    runtimeKind: payload.runtimeKind ?? "dispatch-namespace",
    runtimeStatus: "deployed",
    deployedVersion: payload.deployedVersion ?? bundle.manifest.version,
    deploymentId: payload.deploymentId ?? null,
    lastError: null,
  });
  return { ok: true as const, runtimeKey: payload.runtimeKey ?? runtimeKey, runtimeKind: payload.runtimeKind ?? "dispatch-namespace", deploymentId: payload.deploymentId ?? null };
}
async function workspaceBootstrap(c: CoreContext, requestedWorkspaceId?: string) {
  const denied = requireRead(c);
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const user = c.get("user");
  const workspaces = await repo.accessibleWorkspaces(user);
  const currentWorkspace = (requestedWorkspaceId ? workspaces.find((workspace) => workspace.id === requestedWorkspaceId) : null) ?? workspaces[0] ?? null;
  if (!currentWorkspace) return c.json(errorResponse(failure("not_authorized", "No active workspace membership is available for this account.")), 403);
  if (requestedWorkspaceId && currentWorkspace.id !== requestedWorkspaceId) return c.json(errorResponse(failure("not_authorized", "This account is not a member of the requested workspace.")), 403);
  const workspaceId = currentWorkspace.id;
  const permissions = new Set(currentWorkspace.permissions);
  return c.json({
    session: { authenticated: true, impersonated: Boolean(user?.impersonatedBy), isAdmin: isPlatformAdmin(c.env, user), user: user ? { id: user.id, email: user.email, name: user.name ?? null } : null },
    workspaces,
    currentWorkspace,
    membership: { user: user ? { id: user.id, email: user.email, name: user.name ?? null } : null, roles: currentWorkspace.roles, permissions: currentWorkspace.permissions, recoveryAdmin: false, bootstrap: false },
    layout: (await repo.getLayout(workspaceId)) ?? null,
    navigation: await repo.navigation(workspaceId, permissions),
    featureAvailability: {
      canReadMarketplace: permissions.has("marketplace.read") || permissions.has("workspace.admin"),
      canInstallPlugins: permissions.has("plugin.install") || permissions.has("workspace.admin"),
      canActivatePlugins: permissions.has("plugin.activate") || permissions.has("workspace.admin"),
      canUploadPlugins: permissions.has("plugin.install") || permissions.has("workspace.admin"),
    },
  });
}
async function runtimeUiBootstrapPayload(c: CoreContext, workspaceId?: string) {
  const denied = requireRead(c);
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const requestedWorkspaceId = workspaceId && workspaceId !== "current" ? workspaceId : undefined;
  const workspaces = await repo.accessibleWorkspaces(c.get("user"));
  const currentWorkspace = (requestedWorkspaceId ? workspaces.find((workspace) => workspace.id === requestedWorkspaceId) : null) ?? workspaces[0] ?? null;
  if (!currentWorkspace) return c.json(errorResponse(failure("not_authorized", "No active workspace membership is available for this account.")), 403);
  const installed = await repo.workspaceInstalled(currentWorkspace.id);
  const activeIds = await repo.activePlugins(currentWorkspace.id);
  const runtime = await runtimeFor(repo);
  for (const manifest of installed) await runtime.registerPlugin(manifest);
  const active = new Set(activeIds);
  return c.json({
    plugins: installed,
    active: activeIds,
    tools: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.tools),
    surfaces: (await repo.workspaceUiSurfaces(currentWorkspace.id)).filter((surface) => !surface.id.startsWith("platform.settings.")),
  });
}
async function setupOwnerStatus(c: CoreContext) {
  const token = c.req.query("token");
  if (!token || token.length < 24) return c.json(errorResponse(failure("not_found", "Owner setup link is not available.")), 404);
  const status = await new CoreRepository(c.env.CORE_DB).ownerProvisioningStatus(await sha256Hex(token));
  if (!status) return c.json(errorResponse(failure("not_found", "Owner setup link is not available.")), 404);
  return c.json({ setup: { workspaceId: status.workspaceId, ownerEmail: status.ownerEmail, status: status.status, expiresAt: status.expiresAt } });
}
async function consumeOwnerSetup(c: CoreContext, internal = false) {
  const body = await c.req.json().catch(() => null) as { token?: unknown; user?: { id?: unknown; email?: unknown; name?: unknown } } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const rawUser = body?.user;
  const user = rawUser && typeof rawUser.id === "string" && typeof rawUser.email === "string" ? { id: rawUser.id, email: rawUser.email, ...(typeof rawUser.name === "string" ? { name: rawUser.name } : {}) } : null;
  if (token.length < 24 || (!internal && !user)) return c.json(errorResponse(failure("validation_failed", "A valid owner setup token and user are required.")), 400);
  const result = await new CoreRepository(c.env.CORE_DB).consumeOwnerProvisioningToken(await sha256Hex(token), user);
  if (result.status === "consumed" && "workspaceId" in result) return c.json(result);
  const code = result.status === "not_authenticated" ? "not_authenticated" : result.status === "email_mismatch" ? "not_authorized" : result.status === "not_found" ? "not_found" : "conflict";
  return c.json(errorResponse(failure(code, "Owner setup link cannot be consumed.")), code === "not_authenticated" ? 401 : code === "not_authorized" ? 403 : code === "not_found" ? 404 : 409);
}
function pluginInstallRisk(assessment: ReturnType<typeof assessPluginBundle>) {
  return assessment.sensitiveCapabilities.length ? `sensitive:${assessment.sensitiveCapabilities.join(",")}` : assessment.requiresApproval ? "approval-required" : "standard";
}
function pluginInstallApprovalPayload(source: string, assessment: ReturnType<typeof assessPluginBundle>, extra: Record<string, unknown> = {}) {
  return { source, bundle: assessment.bundle, sensitiveCapabilities: assessment.sensitiveCapabilities, ...extra };
}
function staticDataFor(pageData: Record<string, unknown>, dataSourceId: string, resource?: string) {
  return resource ? pageData[resource] : pageData[dataSourceId] ?? pageData;
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function platformSettingsData(c: CoreContext, repo: CoreRepository, workspaceId: string, dataSourceId: string) {
  switch (dataSourceId) {
    case "platform.settings.general.read":
      return c.json({ status: "ok", data: await repo.generalSettings(workspaceId), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.mail.summary": {
      const summary = await repo.mailSummary(workspaceId);
      return c.json({ status: "ok", data: { kind: summary.activeProvider?.kind ?? "transactional-http", label: summary.activeProvider?.label ?? "", fromName: summary.activeProvider?.fromName ?? "", fromEmail: summary.activeProvider?.fromEmail ?? "", replyToEmail: summary.activeProvider?.replyToEmail ?? null, configurationRef: summary.activeProvider ? "server-side" : null, enabled: Boolean(summary.activeProvider), activeProvider: summary.activeProvider, providers: summary.providers, templates: summary.templates, events: summary.events }, error: null, approvalId: null, auditEventId: null });
    }
    case "platform.settings.mail.providers": return c.json({ status: "ok", data: { rows: (await repo.mailSummary(workspaceId)).providers }, error: null, approvalId: null, auditEventId: null });
    case "platform.settings.mail.templates": return c.json({ status: "ok", data: { rows: (await repo.mailSummary(workspaceId)).templates }, error: null, approvalId: null, auditEventId: null });
    case "platform.settings.mail.events": return c.json({ status: "ok", data: { rows: (await repo.mailSummary(workspaceId)).events }, error: null, approvalId: null, auditEventId: null });
    case "platform.settings.security.bootstrap": {
      const security = await authAdminJson<{ summary: { policy: { registrationMode: string; requireEmailVerification: boolean; allowPasskeyRegistration: boolean; allowPasskeySignin: boolean } } }>(c, `/admin/auth/security-bootstrap?workspaceId=${encodeURIComponent(workspaceId)}`);
      return c.json({ status: "ok", data: { registrationMode: security.summary.policy.registrationMode, requireEmailVerification: security.summary.policy.requireEmailVerification, allowPasskeyRegistration: security.summary.policy.allowPasskeyRegistration, allowPasskeySignin: security.summary.policy.allowPasskeySignin }, error: null, approvalId: null, auditEventId: null });
    }
    case "platform.settings.rbac.roles": return c.json({ status: "ok", data: { rows: await repo.workspaceRoles(workspaceId) }, error: null, approvalId: null, auditEventId: null });
    case "platform.settings.rbac.members": return c.json({ status: "ok", data: { rows: (await repo.workspaceMemberRecords(workspaceId)).map((member) => ({ ...member, userId: member.user.id, user: member.user.email ?? member.user.id, roles: member.roles.map((role) => role.name).join(", "), permissions: member.permissions.join(", "), overrides: member.overrides.map((override) => `${override.permission}:${override.effect}`).join(", ") })) }, error: null, approvalId: null, auditEventId: null });
    case "platform.settings.audit.events": return c.json({ status: "ok", data: { rows: (await repo.auditEvents(workspaceId)).map((event) => ({ ...event, payload: event.payload ? JSON.stringify(event.payload) : "" })) }, error: null, approvalId: null, auditEventId: null });
    case "platform.settings.plans.list": return c.json({ status: "ok", data: { rows: (await repo.plans()).map((plan) => ({ ...plan, limits: JSON.stringify(plan.limits) })) }, error: null, approvalId: null, auditEventId: null });
    case "platform.settings.plans.assignments": return c.json({ status: "ok", data: { rows: await repo.userPlanAssignments() }, error: null, approvalId: null, auditEventId: null });
    case "platform.settings.domains.list": return c.json({ status: "ok", data: { rows: await repo.listDomains(workspaceId) }, error: null, approvalId: null, auditEventId: null });
    case "platform.settings.plugins.catalog": {
      const [catalog, installed, active] = await Promise.all([repo.catalogPlugins(), repo.workspaceInstalled(workspaceId), repo.activePlugins(workspaceId)]);
      const installedIds = new Set(installed.map((manifest) => manifest.id));
      const activeIds = new Set(active);
      return c.json({ status: "ok", data: { rows: catalog.map((entry) => ({ id: entry.manifest.id, name: entry.manifest.name, category: entry.category, version: entry.manifest.version, installed: installedIds.has(entry.manifest.id) ? (activeIds.has(entry.manifest.id) ? "Active" : "Installed") : "Available", demoAvailable: entry.demoAvailable, source: entry.source })) }, error: null, approvalId: null, auditEventId: null });
    }
    case "platform.settings.plugins.list": {
      const installed = await repo.workspaceInstalled(workspaceId);
      const active = new Set(await repo.activePlugins(workspaceId));
      return c.json({ status: "ok", data: { rows: await Promise.all(installed.map(async (manifest) => ({ id: manifest.id, version: manifest.version, active: active.has(manifest.id) ? "Active" : "Inactive", workerIsolation: (await repo.activePluginRuntime(workspaceId, manifest.id))?.runtimeKind ?? "none" }))) }, error: null, approvalId: null, auditEventId: null });
    }
    case "platform.settings.interface.summary": return c.json({ status: "ok", data: { navigation: await repo.interfaceContributions(workspaceId), layout: await repo.getLayout(workspaceId) ?? { zones: [], placements: [] } }, error: null, approvalId: null, auditEventId: null });
    default: return null;
  }
}
async function platformSettingsAction(c: CoreContext, repo: CoreRepository, workspaceId: string, actionId: string, input: unknown) {
  const actionPermissions: Partial<Record<string, WorkspacePermission>> = { "platform.settings.general.save": "workspace.settings.write", "platform.settings.mail.provider.save": "mail.configure", "platform.settings.mail.provider.activate": "mail.configure", "platform.settings.mail.provider.disable": "mail.configure", "platform.settings.mail.provider.test": "mail.test", "platform.settings.security.policy.save": "auth.admin", "platform.settings.rbac.role.create": "workspace.members.manage", "platform.settings.rbac.role.update": "workspace.members.manage", "platform.settings.rbac.role.delete": "workspace.members.manage", "platform.settings.rbac.member.impersonate": "workspace.impersonate", "platform.settings.rbac.member.override.allow": "workspace.members.manage", "platform.settings.rbac.member.override.deny": "workspace.members.manage", "platform.settings.rbac.member.override.remove": "workspace.members.manage", "platform.settings.plans.upsert": "plan.write", "platform.settings.plans.delete": "plan.write", "platform.settings.plans.assignment.upsert": "plan.write", "platform.settings.plans.assignment.delete": "plan.write", "platform.settings.domains.create": "domains.write", "platform.settings.domains.verify": "domains.verify", "platform.settings.domains.activate": "domains.write", "platform.settings.domains.disable": "domains.write", "platform.settings.plugins.activate": "plugin.activate", "platform.settings.plugins.deactivate": "plugin.activate", "platform.settings.interface.save": "interface.write" };
  const requiredPermission = actionPermissions[actionId];
  if (requiredPermission) { const denied = await requirePermission(c, workspaceId, requiredPermission); if (denied) return denied; }
  switch (actionId) {
    case "platform.settings.general.save": return c.json({ status: "ok", data: await repo.saveGeneralSettings(workspaceId, objectInput(input), c.get("user")?.id), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.mail.provider.save": { const value = objectInput(input); const providerInput = mailProviderConfigureSchema.parse({ kind: typeof value.kind === "string" ? value.kind : "smtp", label: typeof value.label === "string" ? value.label : "", fromName: typeof value.fromName === "string" ? value.fromName : "", fromEmail: typeof value.fromEmail === "string" ? value.fromEmail : "", replyToEmail: typeof value.replyToEmail === "string" && value.replyToEmail ? value.replyToEmail : null, configurationRef: typeof value.configurationRef === "string" && value.configurationRef ? value.configurationRef : undefined, enabled: value.enabled !== false }); return c.json({ status: "ok", data: await repo.saveMailProvider(workspaceId, providerInput, c.get("user")?.id), error: null, approvalId: null, auditEventId: null }); }
    case "platform.settings.mail.provider.activate": return c.json({ status: "ok", data: await repo.activateMailProvider(workspaceId, String(objectInput(input).id ?? ""), c.get("user")?.id), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.mail.provider.disable": return c.json({ status: "ok", data: await repo.disableMailProvider(workspaceId, String(objectInput(input).id ?? ""), c.get("user")?.id), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.mail.provider.test": { const value = objectInput(input); return c.json({ status: "ok", data: await repo.testMailProvider(workspaceId, typeof value.id === "string" ? value.id : "", typeof value.to === "string" ? value.to : "", c.get("user")?.id), error: null, approvalId: null, auditEventId: null }); }
    case "platform.settings.security.policy.save": { const value = objectInput(input); const mailDeliveryAvailable = Boolean(await repo.activeMailProvider(workspaceId)); if (value.requireEmailVerification === true && !mailDeliveryAvailable) return c.json(errorResponse(failure("dependency_unavailable", "Email verification requires an active Core Mail Runtime provider.")), 409); const result = await authAdminJson(c, "/admin/auth/policy", { method: "PUT", body: JSON.stringify({ workspaceId, registrationMode: value.registrationMode, requireEmailVerification: Boolean(value.requireEmailVerification), allowPasskeyRegistration: Boolean(value.allowPasskeyRegistration), allowPasskeySignin: Boolean(value.allowPasskeySignin), mailDeliveryAvailable }) }); return c.json({ status: "ok", data: result, error: null, approvalId: null, auditEventId: null }); }
    case "platform.settings.rbac.role.create": { const value = objectInput(input); return c.json({ status: "ok", data: await repo.createWorkspaceRole(workspaceId, { name: typeof value.name === "string" ? value.name : "", description: normalizeEmptyString(value.description) as string | null }, c.get("user")?.id), error: null, approvalId: null, auditEventId: null }); }
    case "platform.settings.rbac.role.update": { const value = objectInput(input); const result = await repo.updateWorkspaceRole(workspaceId, typeof value.id === "string" ? value.id : "", { ...(typeof value.name === "string" ? { name: value.name } : {}), description: normalizeEmptyString(value.description) as string | null }, c.get("user")?.id); return result ? c.json({ status: "ok", data: result, error: null, approvalId: null, auditEventId: null }) : c.json({ status: "denied", data: null, error: "Role is not available.", approvalId: null, auditEventId: null }, 404); }
    case "platform.settings.rbac.role.delete": return c.json({ status: "ok", data: await repo.deleteWorkspaceRole(workspaceId, String(objectInput(input).id ?? ""), c.get("user")?.id), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.rbac.member.override.allow": case "platform.settings.rbac.member.override.deny": { const value = objectInput(input); return c.json({ status: "ok", data: await repo.setMemberPermissionOverride(workspaceId, String(value.userId ?? ""), String(value.permission ?? ""), actionId.endsWith(".allow") ? "allow" : "deny", c.get("user")?.id), error: null, approvalId: null, auditEventId: null }); }
    case "platform.settings.rbac.member.override.remove": { const value = objectInput(input); return c.json({ status: "ok", data: await repo.removeMemberPermissionOverride(workspaceId, String(value.userId ?? ""), String(value.permission ?? ""), c.get("user")?.id), error: null, approvalId: null, auditEventId: null }); }
    case "platform.settings.plans.upsert": { const value = objectInput(input); let limits: Record<string, unknown> = {}; try { limits = JSON.parse(typeof value.limits === "string" ? value.limits : JSON.stringify(value.limits ?? {})) as Record<string, unknown>; } catch { return c.json(errorResponse(failure("validation_failed", "Limits must be valid JSON.")), 400); } return c.json({ status: "ok", data: await repo.upsertPlan({ id: String(value.id ?? ""), name: typeof value.name === "string" ? value.name : String(value.id ?? ""), status: value.status === "active" || value.status === "disabled" ? value.status : "draft", limits }, c.get("user")?.id), error: null, approvalId: null, auditEventId: null }); }
    case "platform.settings.plans.delete": return c.json({ status: "ok", data: await repo.deletePlan(String(objectInput(input).id ?? ""), c.get("user")?.id), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.plans.assignment.upsert": { const value = objectInput(input); return c.json({ status: "ok", data: await repo.upsertUserPlanAssignment({ ...(typeof value.id === "string" ? { id: value.id } : {}), userId: String(value.userId ?? ""), planId: String(value.planId ?? ""), status: value.status === "scheduled" || value.status === "expired" || value.status === "disabled" ? value.status : "active", startsAt: normalizeEmptyString(value.startsAt) as string | null, endsAt: normalizeEmptyString(value.endsAt) as string | null }, c.get("user")?.id), error: null, approvalId: null, auditEventId: null }); }
    case "platform.settings.plans.assignment.delete": return c.json({ status: "ok", data: await repo.deleteUserPlanAssignment(String(objectInput(input).id ?? ""), c.get("user")?.id), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.domains.create": { const value = objectInput(input); return c.json({ status: "ok", data: await repo.createDomain(workspaceId, { hostname: String(value.hostname ?? ""), kind: domainKind(value.kind), verificationMethod: domainVerification(value.verificationMethod), isPrimary: value.isPrimary === true }, c.get("user")?.id), error: null, approvalId: null, auditEventId: null }); }
    case "platform.settings.domains.activate": return c.json({ status: "ok", data: await repo.updateDomainStatus(workspaceId, String(objectInput(input).id ?? ""), "active", c.get("user")?.id), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.domains.disable": return c.json({ status: "ok", data: await repo.updateDomainStatus(workspaceId, String(objectInput(input).id ?? ""), "disabled", c.get("user")?.id), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.plugins.activate": return c.json({ status: "ok", data: await repo.activate(workspaceId, String(objectInput(input).id ?? "")), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.plugins.deactivate": return c.json({ status: "ok", data: await repo.deactivate(workspaceId, String(objectInput(input).id ?? "")), error: null, approvalId: null, auditEventId: null });
    case "platform.settings.interface.save": { const layout = layoutFromInput(input); if (!layout) return c.json(errorResponse(failure("validation_failed", "A valid layout payload is required.")), 400); return c.json({ status: "ok", data: await repo.saveLayout(workspaceId, layout), error: null, approvalId: null, auditEventId: null }); }
    default: return null;
  }
}

async function dispatchPluginOperation(c: CoreContext, request: { workspaceId: string; pluginId: string; operationId: string; input: unknown; routeParams: Record<string, string> | undefined; queryParams: Record<string, string | string[]> | undefined }) {
  const repo = new CoreRepository(c.env.CORE_DB);
  const manifest = await repo.installedById(request.pluginId);
  if (!manifest) return c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404);
  const operation = manifest.api.operations.find((item) => item.id === request.operationId);
  if (!operation) return c.json(errorResponse(failure("not_found", "Plugin operation is not declared by the manifest.")), 404);
  const denied = await requirePermission(c, request.workspaceId, (operation.permission ?? "workspace.read") as WorkspacePermission);
  if (denied) return denied;
  const active = await repo.activePluginRuntime(request.workspaceId, request.pluginId);
  if (!active) return c.json(pluginOperationEnvelope("unavailable", null, "Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, { workspaceId: request.workspaceId, pluginId: request.pluginId, runtimeKey: active.runtimeKey, kind: "operation", operationId: request.operationId, input: request.input, routeParams: request.routeParams, queryParams: request.queryParams });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) return c.json(pluginOperationEnvelope("denied", null, "Plugin runtime rejected the operation.", null, null), runtimeResult.response.status === 404 ? 404 : 403);
    await repo.audit(request.workspaceId, "plugin.operation.execute", { pluginId: request.pluginId, operationId: request.operationId, runtimeKey: active.runtimeKey }, c.get("user")?.id);
    return c.json(pluginOperationEnvelope("ok", runtimeResult.body, null, null, null));
  }
  return c.json(pluginOperationEnvelope("unavailable", null, "Plugin runtime dispatch is unavailable."), 503);
}

const coreApiRoutes2 = coreApiRoutes1.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));
const coreApiRoutes3 = coreApiRoutes2.get("/session", (c) => { const user = c.get("user"); return c.json({ authenticated: Boolean(user), impersonated: Boolean(user?.impersonatedBy), isAdmin: isPlatformAdmin(c.env, user), user: user ? { id: user.id, email: user.email, name: user.name ?? null } : null }); });
const coreApiRoutes4 = coreApiRoutes3.get("/session/impersonation", async (c) => {
  const user = c.get("user");
  if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  const response = await authAdminJson<{ impersonation: { id: string; actorUserId: string; subjectUserId: string; workspaceId: string; reason: string; expiresAt: string | null } | null }>(c, "/internal/auth/impersonation/current");
  return c.json(response);
});
const coreApiRoutes5 = coreApiRoutes4.post("/session/impersonation/stop", async (c) => {
  const user = c.get("user");
  if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  const response = await authAdminJson<{ impersonation: { workspaceId: string }; restored: boolean; reauthenticationRequired: boolean }>(c, "/internal/auth/impersonation/stop", { method: "POST", body: JSON.stringify({}) });
  return c.json(response);
});
const coreApiRoutes6 = coreApiRoutes5.get("/bootstrap", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ authenticated: false });
  const workspaceId = c.req.query("workspaceId")?.trim();
  const bootstrapResponse = await workspaceBootstrap(c, workspaceId === "current" ? undefined : workspaceId);
  if (!(bootstrapResponse instanceof Response) || !bootstrapResponse.ok) return bootstrapResponse;
  return c.json({ authenticated: true, bootstrap: await bootstrapResponse.json() });
});
const coreApiRoutes7 = coreApiRoutes6.get("/workspaces/current/bootstrap", async (c) => workspaceBootstrap(c));
const coreApiRoutes8 = coreApiRoutes7.get("/workspaces/:workspaceId/bootstrap", async (c) => workspaceBootstrap(c, c.req.param("workspaceId")));
const coreApiRoutes9 = coreApiRoutes8.get("/runtime/ui/bootstrap", async (c) => runtimeUiBootstrapPayload(c, c.req.query("workspaceId") === "current" ? undefined : c.req.query("workspaceId") ?? undefined));
const coreApiRoutes10 = coreApiRoutes9.get("/setup/owner", async (c) => setupOwnerStatus(c));
const coreApiRoutes11 = coreApiRoutes10.post("/setup/owner/consume", async (c) => consumeOwnerSetup(c));
const coreApiRoutes12 = coreApiRoutes11.post("/internal/setup/owner/consume", async (c) => {
  if (!c.get("internal")) return c.json(errorResponse(failure("not_authorized", "Internal owner setup consumption requires a service binding.")), 403);
  return consumeOwnerSetup(c, true);
});
const coreApiRoutes13 = coreApiRoutes12.get("/runtime/plugins", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  const denied = await requireRead(c);
  if (denied) return denied;
  return c.json({ plugins: workspaceId ? await new CoreRepository(c.env.CORE_DB).workspaceInstalled(workspaceId) : await new CoreRepository(c.env.CORE_DB).installed() });
});
const coreApiRoutes14 = coreApiRoutes13.get("/runtime/tools", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  const denied = await requireRead(c);
  if (denied) return denied;
  if (!workspaceId) return c.json(errorResponse(failure("validation_failed", "Workspace is required.")), 400);
  const repo = new CoreRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const active = new Set(await repo.activePlugins(workspaceId));
  return c.json({ tools: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.tools) });
});
const coreApiRoutes15 = coreApiRoutes14.get("/runtime/providers", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  const denied = await requireRead(c);
  if (denied) return denied;
  if (!workspaceId) return c.json(errorResponse(failure("validation_failed", "Workspace is required.")), 400);
  const repo = new CoreRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const active = new Set(await repo.activePlugins(workspaceId));
  return c.json({ providers: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.providers) });
});
const coreApiRoutes16 = coreApiRoutes15.get("/plugins/installed", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  return c.json({ plugins: await new CoreRepository(c.env.CORE_DB).installed() });
});
const coreApiRoutes17 = coreApiRoutes16.get("/workspaces/:workspaceId/plugins", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  return c.json({ active: await new CoreRepository(c.env.CORE_DB).activePlugins(workspaceId) });
});
const coreApiRoutes18 = coreApiRoutes17.get("/workspaces/:workspaceId/ui/surfaces", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  return c.json({ surfaces: await new CoreRepository(c.env.CORE_DB).workspaceUiSurfaces(workspaceId) });
});
const coreApiRoutes19 = coreApiRoutes18.get("/workspaces/:workspaceId/runtime/registry", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const active = new Set(await repo.activePlugins(workspaceId));
  const installed = await repo.workspaceInstalled(workspaceId);
  const runtime = await runtimeFor(repo);
  for (const manifest of installed) await runtime.registerPlugin(manifest);
  const plugins = installed.filter((plugin) => active.has(plugin.id));
  const deployments = await Promise.all(installed.map(async (plugin) => ({ pluginId: plugin.id, state: await repo.pluginRuntimeDeployment(workspaceId, plugin.id) ?? null })));
  return c.json({
    plugins: plugins.map((plugin) => ({ id: plugin.id, name: plugin.name, version: plugin.version })),
    tools: plugins.flatMap((plugin) => plugin.contributes.tools.map((tool) => ({ ...tool, pluginId: plugin.id, pluginName: plugin.name }))),
    providers: plugins.flatMap((plugin) => plugin.contributes.providers.map((provider) => ({ ...provider, pluginId: plugin.id, pluginName: plugin.name }))),
    channels: plugins.flatMap((plugin) => plugin.contributes.channels.map((channel) => ({ ...channel, pluginId: plugin.id, pluginName: plugin.name }))),
    deployments,
  });
});
const coreApiRoutes20 = coreApiRoutes19.get("/runtime/ui/surfaces", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  if (!workspaceId) return c.json(errorResponse(failure("validation_failed", "Workspace is required.")), 400);
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  return c.json({ surfaces: await new CoreRepository(c.env.CORE_DB).workspaceUiSurfaces(workspaceId) });
});
const coreApiRoutes21 = coreApiRoutes20.get("/runtime/ui/surfaces/:surfaceId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  const workspaceId = c.req.query("workspaceId")?.trim();
  const surfaceId = c.req.param("surfaceId").trim();
  if (!workspaceId || !surfaceId) return c.json(errorResponse(failure("validation_failed", "Workspace and surface are required.")), 400);
  const surface = await new CoreRepository(c.env.CORE_DB).resolveSandboxSurface(workspaceId, surfaceId);
  if (!surface) return c.json(errorResponse(failure("not_found", "Plugin surface is not available.")), 404);
  const archive = await c.env.PLUGIN_PACKAGES.get(surface.objectKey);
  if (!archive) return c.json(errorResponse(failure("dependency_unavailable", "Plugin package asset is unavailable.")), 503);
  const html = extractDeclaredHtmlAsset(await archive.arrayBuffer(), surface.entry);
  if (!html) return c.json(errorResponse(failure("not_found", "Declared plugin UI asset is not available.")), 404);
  const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'`;
  return c.body(html, 200, { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": policy, "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-site" });
});
const coreApiRoutes22 = coreApiRoutes21.get("/marketplace/plugins", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  const repo = new CoreRepository(c.env.CORE_DB);
  const catalog = await repo.catalogPlugins();
  if (!workspaceId) return c.json({ plugins: catalog.map((entry) => ({ ...entry, installed: false, active: false })) });
  const denied = await requirePermission(c, workspaceId, "marketplace.read");
  if (denied) return denied;
  const workspacePlugins = await repo.workspacePlugins(workspaceId);
  const installed = new Set(workspacePlugins.map((plugin) => plugin.pluginId));
  const active = new Set(workspacePlugins.filter((plugin) => plugin.active).map((plugin) => plugin.pluginId));
  return c.json({ plugins: catalog.map((entry) => ({ ...entry, installed: installed.has(entry.manifest.id), active: active.has(entry.manifest.id) })) });
});
const coreApiRoutes23 = coreApiRoutes22.post("/plugins/upload", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  if (!workspaceId) return c.json(errorResponse(failure("validation_failed", "Workspace is required.")), 400);
  const denied = await requirePermission(c, workspaceId, "plugin.install");
  if (denied) return denied;
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip")) return c.json(errorResponse(failure("validation_failed", "A ZIP plugin package is required.")), 400);
  if (file.size > 20 * 1024 * 1024) return c.json(errorResponse(failure("validation_failed", "Plugin package exceeds 20 MB.")), 413);
  const bytes = await file.arrayBuffer();
  const key = `packages/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
  const assessment = await unpackPluginZip(bytes, key);
  await c.env.PLUGIN_PACKAGES.put(key, bytes, { customMetadata: { pluginId: assessment.bundle.manifest.id, version: assessment.bundle.manifest.version, sha256: assessment.bundle.package.sha256 } });
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ApprovalRequestRepository(c.env.CORE_DB);
  const targetWorkspaceId = workspaceId;
  if (assessment.requiresApproval) {
    const approval = await approvals.create({ workspaceId: targetWorkspaceId, kind: "plugin_install", subjectId: assessment.bundle.manifest.id, pluginId: assessment.bundle.manifest.id, risk: pluginInstallRisk(assessment), payload: pluginInstallApprovalPayload("upload", assessment), requestedBy: c.get("user")?.id });
    await repo.audit(targetWorkspaceId, "plugin.install.approval.requested", { approvalId: approval.id, pluginId: assessment.bundle.manifest.id, sha256: assessment.bundle.package.sha256, source: "zip", sensitiveCapabilities: assessment.sensitiveCapabilities }, c.get("user")?.id);
    return c.json({ status: "approval-required", approvalId: approval.id, pluginId: assessment.bundle.manifest.id, version: assessment.bundle.manifest.version, sha256: assessment.bundle.package.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  }
  await repo.ensureWorkspace(targetWorkspaceId);
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  const deployed = await provisionPluginRuntime(c, repo, targetWorkspaceId, assessment.bundle.manifest.id, `${assessment.bundle.manifest.id}@${assessment.bundle.manifest.version}`, assessment.bundle);
  if (!deployed.ok) return c.json(errorResponse(failure("dependency_unavailable", deployed.errorSafe, { retryable: true })), 502);
  await repo.activate(targetWorkspaceId, assessment.bundle.manifest.id);
  await repo.audit(targetWorkspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id, source: "zip" }, c.get("user")?.id);
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});
const coreApiRoutes24 = coreApiRoutes23.post("/plugins/install", async (c) => {
  const request = pluginInstallRequestSchema.parse(await c.req.json().catch(() => null));
  const denied = await requirePermission(c, request.workspaceId, "plugin.install");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ApprovalRequestRepository(c.env.CORE_DB);
  const targetWorkspaceId = request.workspaceId;
  let assessment = request.bundle ? assessPluginBundle(request.bundle) : null;
  let consumedApprovalId: string | undefined;
  if (request.approvalId) {
    const approved = await approvals.claimApproved({ workspaceId: targetWorkspaceId, approvalId: request.approvalId, kind: "plugin_install" });
    if (!approved) return c.json(errorResponse(failure("not_authorized", "A matching approved installation request is required.")), 403);
    assessment = assessPluginBundle((approved.payload as { bundle?: unknown }).bundle);
    consumedApprovalId = approved.id;
  }
  if (!assessment) return c.json(errorResponse(failure("validation_failed", "A plugin bundle is required.")), 400);
  if (assessment.requiresApproval && !consumedApprovalId) {
    await repo.ensureWorkspace(targetWorkspaceId);
    const approval = await approvals.create({ workspaceId: targetWorkspaceId, kind: "plugin_install", subjectId: assessment.bundle.manifest.id, pluginId: assessment.bundle.manifest.id, risk: pluginInstallRisk(assessment), payload: pluginInstallApprovalPayload("direct", assessment), requestedBy: c.get("user")?.id });
    await repo.audit(targetWorkspaceId, "plugin.install.approval.requested", { approvalId: approval.id, pluginId: assessment.bundle.manifest.id, sha256: assessment.bundle.package.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, c.get("user")?.id);
    return c.json({ status: "approval-required", approvalId: approval.id, pluginId: assessment.bundle.manifest.id, version: assessment.bundle.manifest.version, sha256: assessment.bundle.package.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  }
  await repo.ensureWorkspace(targetWorkspaceId);
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  const deployed = await provisionPluginRuntime(c, repo, targetWorkspaceId, assessment.bundle.manifest.id, request.approvalId ?? `${assessment.bundle.manifest.id}@${assessment.bundle.manifest.version}`, assessment.bundle);
  if (!deployed.ok) return c.json(errorResponse(failure("dependency_unavailable", deployed.errorSafe, { retryable: true })), 502);
  await repo.activate(targetWorkspaceId, assessment.bundle.manifest.id);
  if (consumedApprovalId) await approvals.consume(consumedApprovalId);
  await repo.audit(targetWorkspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id, approvalId: consumedApprovalId ?? null }, c.get("user")?.id);
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});
const coreApiRoutes25 = coreApiRoutes24.post("/marketplace/plugins/:pluginId/install", (async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  if (!workspaceId) return c.json(errorResponse(failure("validation_failed", "Workspace is required.")), 400);
  const denied = await requirePermission(c, workspaceId, "plugin.install");
  if (denied) return denied;
  const body = await c.req.json().catch(() => null) as { approvalId?: unknown } | null;
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ApprovalRequestRepository(c.env.CORE_DB);
  const plugin = await repo.catalogPlugin(c.req.param("pluginId"));
  if (!plugin) return c.json(errorResponse(failure("not_found", "Marketplace plugin is not available.")), 404);
  const release = await repo.publishedCatalogRelease(plugin.manifest.id);
  if (!release) return c.json(errorResponse(failure("not_found", "Marketplace plugin has no published runtime release.")), 404);
  let assessment = assessPluginBundle(repo.releaseBundle(release));
  let consumedApprovalId: string | undefined;
  if (assessment.requiresApproval) {
    const approvalId = typeof body?.approvalId === "string" ? body.approvalId : "";
    if (!approvalId) {
      await repo.ensureWorkspace(workspaceId);
      const approval = await approvals.create({ workspaceId, kind: "plugin_install", subjectId: release.id, pluginId: assessment.bundle.manifest.id, risk: pluginInstallRisk(assessment), payload: pluginInstallApprovalPayload("marketplace", assessment, { releaseId: release.id }), requestedBy: c.get("user")?.id });
      await repo.audit(workspaceId, "plugin.install.approval.requested", { approvalId: approval.id, pluginId: assessment.bundle.manifest.id, releaseId: release.id, sha256: release.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, c.get("user")?.id);
      return c.json({ status: "approval-required", approvalId: approval.id, releaseId: release.id, pluginId: assessment.bundle.manifest.id, version: release.version, sha256: release.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
    }
    const approved = await approvals.claimApproved({ workspaceId, approvalId, kind: "plugin_install", subjectId: release.id, pluginId: assessment.bundle.manifest.id });
    if (!approved) return c.json(errorResponse(failure("not_authorized", "A matching approved installation request is required.")), 403);
    assessment = assessPluginBundle((approved.payload as { bundle?: unknown }).bundle);
    consumedApprovalId = approved.id;
  }
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  const deployed = await provisionPluginRuntime(c, repo, workspaceId, assessment.bundle.manifest.id, release.id, assessment.bundle);
  if (!deployed.ok) return c.json(errorResponse(failure("dependency_unavailable", deployed.errorSafe, { retryable: true })), 502);
  await repo.activate(workspaceId, assessment.bundle.manifest.id);
  if (consumedApprovalId) await approvals.consume(consumedApprovalId);
  await repo.audit(workspaceId, "marketplace.plugin.install", { pluginId: assessment.bundle.manifest.id, category: plugin.category, releaseId: release.id, approvalId: consumedApprovalId ?? null }, c.get("user")?.id);
  return c.json({ status: "installed", plugin: { ...plugin, manifest: assessment.bundle.manifest, installed: true, active: true } }, 201);
}) as Handler<CoreApiEnv, "/marketplace/plugins/:pluginId/install", QueryInput<{ workspaceId: string }>>);
const coreApiRoutes26 = coreApiRoutes25.post("/plugins/activate", async (c) => {
  const request = pluginActivationRequestSchema.parse(await c.req.json().catch(() => null));
  const denied = await requirePermission(c, request.workspaceId, "plugin.activate");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const deployment = await repo.pluginRuntimeDeployment(request.workspaceId, request.pluginId);
  if (!deployment || !["deployed", "active", "disabled"].includes(deployment.runtimeStatus)) return c.json(errorResponse(failure("dependency_unavailable", "Plugin runtime deployment must be confirmed before activation.")), 409);
  const state = await repo.activate(request.workspaceId, request.pluginId);
  return state ? c.json(state, 201) : c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404);
});
const coreApiRoutes27 = coreApiRoutes26.post("/plugins/deactivate", async (c) => {
  const request = pluginActivationRequestSchema.parse(await c.req.json().catch(() => null));
  const denied = await requirePermission(c, request.workspaceId, "plugin.activate");
  if (denied) return denied;
  const state = await new CoreRepository(c.env.CORE_DB).deactivate(request.workspaceId, request.pluginId);
  return state ? c.json(state) : c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404);
});
const coreApiRoutes28 = coreApiRoutes27.post("/plugins/grants", async (c) => {
  const request = capabilityGrantRequestSchema.parse(await c.req.json().catch(() => null));
  const denied = await requirePermission(c, request.workspaceId, "plugin.grantCapability");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  if (!await repo.installedById(request.pluginId)) return c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404);
  const declared = new Set(await repo.declaredCapabilities(request.pluginId));
  if (!request.capabilities.every((capability) => declared.has(capability))) return c.json(errorResponse(failure("validation_failed", "Capability is not declared by the plugin.")), 400);
  return c.json({ pluginId: request.pluginId, capabilities: await repo.grantCapabilities(request.workspaceId, request.pluginId, request.capabilities) });
});
const coreApiRoutes29 = coreApiRoutes28.post("/tools/execute", async (c) => {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const request = toolExecutionRequestSchema.parse(await c.req.json().catch(() => null));
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ToolApprovalRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const owner = runtime.plugins.all().find((plugin) => plugin.contributes.tools.some((tool) => tool.id === request.toolId));
  const tool = runtime.tools.get(request.toolId);
  if (!owner || !tool) return c.json({ status: "denied", toolId: request.toolId, reason: "Tool not registered" }, 404);
  const permissionDenied = await requireAllPermissions(c, request.workspaceId, tool.permissions.length ? tool.permissions : ["workspace.read"]);
  if (permissionDenied) return permissionDenied;
  const active = new Set(await repo.activePlugins(request.workspaceId));
  if (!active.has(owner.id)) return c.json({ status: "denied", toolId: tool.id, reason: "Plugin is not active in workspace" }, 403);
  const permissions = new Set(await repo.grantedCapabilities(request.workspaceId, owner.id));
  const initialDecision = runtime.canExecuteTool(tool.id, { permissions });
  if (initialDecision === "deny") return c.json({ status: "denied", toolId: tool.id, reason: "Capability has not been granted" }, 403);
  let executionInput = request.input;
  let consumedApprovalId: string | undefined;
  if (initialDecision === "require-approval") {
    if (!request.approvalId) {
      const approval = await approvals.create(request.workspaceId, owner.id, tool.id, tool.risk, request.input, c.get("user")?.id);
      await repo.audit(request.workspaceId, "tool.approval.requested", { approvalId: approval.id, toolId: tool.id, pluginId: owner.id }, c.get("user")?.id);
      return c.json({ status: "approval-required", toolId: tool.id, risk: tool.risk, approvalId: approval.id }, 202);
    }
    const approved = await approvals.approvedInput(request.workspaceId, request.approvalId, owner.id, tool.id);
    if (!approved) return c.json({ status: "denied", toolId: tool.id, reason: "Approval is missing, expired or already consumed" }, 403);
    executionInput = approved.input;
    consumedApprovalId = approved.approval.id;
  }
  const deployment = await activeRuntimeOrAudit(repo, request.workspaceId, owner.id, "tool.execute", c.get("user")?.id);
  if (!deployment) {
    if (consumedApprovalId) await approvals.release(consumedApprovalId);
    return c.json({ status: "denied", toolId: tool.id, reason: "Plugin runtime is not active" }, 503);
  }
  const runtimeResult = await pluginRuntimeDispatch(c, { workspaceId: request.workspaceId, pluginId: owner.id, runtimeKey: deployment.runtimeKey, kind: "tool", operationId: tool.id, input: executionInput });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) {
      if (consumedApprovalId) await (runtimeResult.response.status >= 500 ? approvals.release(consumedApprovalId) : approvals.fail(consumedApprovalId));
      return c.json({ status: "denied", toolId: tool.id, reason: "Plugin runtime rejected the operation" }, runtimeResult.response.status === 404 ? 404 : 403);
    }
    if (consumedApprovalId) await approvals.consume(consumedApprovalId);
    await repo.audit(request.workspaceId, "tool.execute", { toolId: tool.id, pluginId: owner.id, approvalId: consumedApprovalId ?? null, dispatched: "plugin-runtime" }, c.get("user")?.id);
    return c.json({ status: "executed", toolId: tool.id, ...(consumedApprovalId ? { approvalId: consumedApprovalId } : {}), result: runtimeResult.body });
  }
  if (consumedApprovalId) await approvals.release(consumedApprovalId);
  await repo.audit(request.workspaceId, "tool.execute.unavailable", { toolId: tool.id, pluginId: owner.id, approvalId: consumedApprovalId ?? null }, c.get("user")?.id);
  return c.json({ status: "denied", toolId: tool.id, reason: "Plugin runtime dispatch is unavailable" }, 503);
});
const coreApiRoutes30 = coreApiRoutes29.get("/workspaces/:workspaceId/tool-approvals", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "approval.read");
  if (denied) return denied;
  return c.json({ approvals: await new ToolApprovalRepository(c.env.CORE_DB).listPending(workspaceId) });
});
const coreApiRoutes31 = coreApiRoutes30.post("/tool-approvals/decision", async (c) => {
  const request = toolApprovalDecisionRequestSchema.parse(await c.req.json().catch(() => null));
  const denied = await requirePermission(c, request.workspaceId, "tool.approve");
  if (denied) return denied;
  const approval = await new ToolApprovalRepository(c.env.CORE_DB).decide(request.workspaceId, request.approvalId, request.decision, c.get("user")?.id);
  if (!approval) return c.json(errorResponse(failure("conflict", "Approval is not pending.")), 409);
  await new CoreRepository(c.env.CORE_DB).audit(request.workspaceId, `tool.approval.${request.decision}`, { approvalId: approval.id, toolId: approval.toolId }, c.get("user")?.id);
  return c.json({ approval });
});
const coreApiRoutes32 = coreApiRoutes31.get("/workspaces/:workspaceId/approval-requests", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "approval.read");
  if (denied) return denied;
  return c.json({ approvals: await new ApprovalRequestRepository(c.env.CORE_DB).listPending(workspaceId) });
});
const coreApiRoutes33 = coreApiRoutes32.post("/approval-requests/:approvalId/decision", (async (c) => {
  const request = approvalRequestDecisionRequestSchema.parse(await c.req.json().catch(() => null));
  const denied = await requirePermission(c, request.workspaceId, "tool.approve");
  if (denied) return denied;
  const approval = await new ApprovalRequestRepository(c.env.CORE_DB).decide(request.workspaceId, c.req.param("approvalId"), request.decision, c.get("user")?.id, request.reason);
  if (!approval) return c.json(errorResponse(failure("conflict", "Approval is not pending.")), 409);
  await new CoreRepository(c.env.CORE_DB).audit(request.workspaceId, `approval.${request.decision}`, { approvalId: approval.id, kind: approval.kind, subjectId: approval.subjectId, pluginId: approval.pluginId }, c.get("user")?.id);
  return c.json({ approval });
}) as Handler<CoreApiEnv, "/approval-requests/:approvalId/decision", JsonInput<z.input<typeof approvalRequestDecisionRequestSchema>>>);
const coreApiRoutes34 = coreApiRoutes33.post("/runtime/ui/data", (async (c): Promise<Response> => {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const request = runtimeDataRequestSchema.parse(await c.req.json().catch(() => null));
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json(pluginOperationEnvelope("denied", null, "Contribution is not active in this workspace.", null, null), 403) as Response;
  const dataSource = resolved.page.dataSources.find((item) => item.id === request.dataSourceId);
  if (!dataSource) return c.json(pluginOperationEnvelope("denied", null, "Data source is not declared by this contribution.", null, null), 403) as Response;
  const permissionDenied = await requirePermission(c, request.workspaceId, dataSource.access === "permission-gated" || resolved.page.access === "permission-gated" ? resolved.requiredPermission ?? "workspace.read" : "workspace.read");
  if (permissionDenied) return permissionDenied as Response;
  if (resolved.pluginId === "platform" && dataSource.id === "platform.settings.general.read") return c.json({ status: "ok", data: await repo.generalSettings(request.workspaceId), error: null, approvalId: null, auditEventId: null }) as Response;
  if (resolved.pluginId === "platform" && dataSource.id === "platform.settings.domains.list") return c.json({ status: "ok", data: { rows: await repo.listDomains(request.workspaceId) }, error: null, approvalId: null, auditEventId: null }) as Response;
  if (resolved.pluginId === "platform" && dataSource.id.startsWith("platform.settings.")) return (await platformSettingsData(c, repo, request.workspaceId, dataSource.id)) as Response;
  if (dataSource.kind === "static") return c.json({ status: "ok", data: staticDataFor((resolved.page as { data?: Record<string, unknown> }).data ?? {}, dataSource.id, dataSource.resource), error: null, approvalId: null, auditEventId: null }) as Response;
  const deployment = await activeRuntimeOrAudit(repo, request.workspaceId, resolved.pluginId, "runtime.ui.data", c.get("user")?.id);
  if (!deployment) return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, { workspaceId: request.workspaceId, pluginId: resolved.pluginId, runtimeKey: deployment.runtimeKey, kind: "data", operationId: dataSource.resource ?? dataSource.id, contributionId: request.contributionId, routeParams: request.routeParams, queryParams: request.queryParams });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) return c.json({ status: "denied", data: null, error: "Plugin runtime rejected the data request.", approvalId: null, auditEventId: null }, runtimeResult.response.status === 404 ? 404 : 403) as Response;
    await repo.audit(request.workspaceId, "runtime.ui.data.execute", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id, dispatched: "plugin-runtime" }, c.get("user")?.id);
    return c.json({ status: "ok", data: runtimeResult.body, error: null, approvalId: null, auditEventId: null }) as Response;
  }
  await repo.audit(request.workspaceId, "runtime.ui.data.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501) as Response;
}) as Handler<CoreApiEnv, "/runtime/ui/data", JsonInput<z.input<typeof runtimeDataRequestSchema>>>);
const coreApiRoutes35 = coreApiRoutes34.post("/runtime/ui/actions", (async (c) => {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const request = runtimeActionRequestSchema.parse(await c.req.json().catch(() => null));
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json(pluginOperationEnvelope("denied", null, "Contribution is not active in this workspace.", null, null), 403);
  const action = resolved.page.actions.find((item) => item.id === request.actionId);
  if (!action) return c.json(pluginOperationEnvelope("denied", null, "Action is not declared by this contribution.", null, null), 403);
  const runtime = await runtimeFor(repo);
  const toolOwner = runtime.plugins.all().find((plugin) => plugin.contributes.tools.some((tool) => tool.id === action.commandId));
  const tool = toolOwner?.contributes.tools.find((item) => item.id === action.commandId);
  const permissionDenied = await requireAllPermissions(c, request.workspaceId, tool?.permissions.length ? tool.permissions : [resolved.requiredPermission ?? "workspace.settings.write"]);
  if (permissionDenied) return permissionDenied;
  if (resolved.pluginId === "platform" && action.id === "platform.settings.general.save") {
    const data = await repo.saveGeneralSettings(request.workspaceId, request.input && typeof request.input === "object" ? request.input as Record<string, unknown> : {}, c.get("user")?.id);
    return c.json({ status: "ok", data, error: null, approvalId: null, auditEventId: null });
  }
  const deployment = await activeRuntimeOrAudit(repo, request.workspaceId, resolved.pluginId, "settings.runtime.ui.action", c.get("user")?.id);
  if (!deployment) return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, { workspaceId: request.workspaceId, pluginId: resolved.pluginId, runtimeKey: deployment.runtimeKey, kind: "action", operationId: action.commandId, contributionId: request.contributionId, input: request.input, routeParams: request.routeParams });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) return c.json({ status: "denied", data: null, error: "Plugin runtime rejected the operation.", approvalId: null, auditEventId: null }, runtimeResult.response.status === 404 ? 404 : 403);
    await repo.audit(request.workspaceId, "settings.runtime.ui.action.execute", { pluginId: resolved.pluginId, contributionId: request.contributionId, actionId: action.id, commandId: action.commandId, dispatched: "plugin-runtime" }, c.get("user")?.id);
    return c.json({ status: "ok", data: runtimeResult.body, error: null, approvalId: null, auditEventId: null });
  }
  await repo.audit(request.workspaceId, "settings.runtime.ui.action.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, actionId: action.id, commandId: action.commandId }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
}) as Handler<CoreApiEnv, "/runtime/ui/actions", JsonInput<z.input<typeof runtimeActionRequestSchema>>>);
const coreApiRoutes36 = coreApiRoutes35.post("/workspaces/:workspaceId/settings/runtime/data", async (c) => { const workspaceId = c.req.param("workspaceId"); const parsed = runtimeDataRequestSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success || parsed.data.workspaceId !== workspaceId) return c.json(errorResponse(failure("validation_failed", "Valid settings runtime data input is required.")), 400); const result = await platformSettingsData(c, new CoreRepository(c.env.CORE_DB), workspaceId, parsed.data.dataSourceId); return result ?? c.json(errorResponse(failure("not_found", "Settings data source is not available.")), 404); });
const coreApiRoutes37 = coreApiRoutes36.post("/workspaces/:workspaceId/settings/runtime/actions", async (c) => { const workspaceId = c.req.param("workspaceId"); const parsed = runtimeActionRequestSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success || parsed.data.workspaceId !== workspaceId) return c.json(errorResponse(failure("validation_failed", "Valid settings runtime action input is required.")), 400); const result = await platformSettingsAction(c, new CoreRepository(c.env.CORE_DB), workspaceId, parsed.data.actionId, parsed.data.input); return result ?? c.json(errorResponse(failure("not_found", "Settings action is not available.")), 404); });
const coreApiRoutes38 = coreApiRoutes37.get("/workspaces/:workspaceId/settings/tabs", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.settings.read");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const tabs = await repo.settingsTabs(workspaceId);
  const permissions = new Set((await repo.memberSummary(workspaceId, c.get("user"))).permissions);
  return c.json({ tabs: tabs.filter((tab) => tab.status === "active" && (!tab.requiredPermission || permissions.has(tab.requiredPermission) || permissions.has("workspace.admin"))) });
});
const coreApiRoutes39 = coreApiRoutes38.get("/workspaces/:workspaceId/settings/tabs/:tabId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.settings.read");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.settingsTab(workspaceId, c.req.param("tabId"));
  if (resolved?.tab.requiredPermission) {
    const permissions = new Set((await repo.memberSummary(workspaceId, c.get("user"))).permissions);
    if (!permissions.has(resolved.tab.requiredPermission) && !permissions.has("workspace.admin")) return c.json(errorResponse(failure("not_authorized", "Settings tab permission is required.")), 403);
  }
  return resolved ? c.json(resolved) : c.json(errorResponse(failure("not_found", "Settings tab is not available.")), 404);
});
const coreApiRoutes40 = coreApiRoutes39.post("/workspaces/:workspaceId/settings/tabs/order", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.settings.write");
  if (denied) return denied;
  const body = await c.req.json().catch(() => null) as { tabIds?: unknown } | null;
  if (!Array.isArray(body?.tabIds) || !body.tabIds.every((item) => typeof item === "string")) return c.json(errorResponse(failure("validation_failed", "tabIds must be a string array.")), 400);
  await new CoreRepository(c.env.CORE_DB).reorderSettingsTabs(workspaceId, body.tabIds);
  return c.json({ saved: true });
});
const coreApiRoutes41 = coreApiRoutes40.get("/workspaces/:workspaceId/settings/:scope", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.settings.read");
  if (denied) return denied;
  const scope = settingScopeSchema.parse(c.req.param("scope")) as SettingScope;
  return c.json({ settings: await new CoreRepository(c.env.CORE_DB).listSettings(workspaceId, scope) });
});
const coreApiRoutes42 = coreApiRoutes41.put("/layouts", async (c) => {
  const request = layoutWriteRequestSchema.parse(await c.req.json().catch(() => null));
  const denied = await requirePermission(c, request.workspaceId, "layout.write");
  if (denied) return denied;
  await new CoreRepository(c.env.CORE_DB).saveLayout(request.workspaceId, request.layout);
  return c.json({ saved: true, layout: request.layout });
});
const coreApiRoutes43 = coreApiRoutes42.get("/workspaces/:workspaceId/layout", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "layout.read");
  if (denied) return denied;
  return c.json({ layout: (await new CoreRepository(c.env.CORE_DB).getLayout(workspaceId)) ?? null });
});
const coreApiRoutes44 = coreApiRoutes43.get("/workspaces/:workspaceId/rbac/me", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  return c.json(await new CoreRepository(c.env.CORE_DB).memberSummary(workspaceId, c.get("user")));
});
const coreApiRoutes45 = coreApiRoutes44.get("/workspaces/:workspaceId/interface/contributions", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "interface.read");
  if (denied) return denied;
  return c.json({ contributions: await new CoreRepository(c.env.CORE_DB).interfaceContributions(workspaceId) });
});
const coreApiRoutes46 = coreApiRoutes45.put("/workspaces/:workspaceId/interface/contributions/:contributionId", (async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "interface.write");
  if (denied) return denied;
  await new CoreRepository(c.env.CORE_DB).updateInterfaceContribution(workspaceId, c.req.param("contributionId"), await c.req.json().catch(() => ({})), c.get("user")?.id);
  return c.body(null, 204);
}) as Handler<CoreApiEnv, "/workspaces/:workspaceId/interface/contributions/:contributionId", JsonInput<Record<string, unknown>>>);
const coreApiRoutes47 = coreApiRoutes46.post("/workspaces/:workspaceId/interface/pages", (async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "interface.write");
  if (denied) return denied;
  const page = await new CoreRepository(c.env.CORE_DB).createManualPage(workspaceId, await c.req.json().catch(() => ({})), c.get("user")?.id);
  return c.json({ page }, 201);
}) as Handler<CoreApiEnv, "/workspaces/:workspaceId/interface/pages", JsonInput<Record<string, unknown>>>);
const coreApiRoutes48 = coreApiRoutes47.get("/workspaces/:workspaceId/interface/pages/:contributionId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "interface.read");
  if (denied) return denied;
  const resolved = await new CoreRepository(c.env.CORE_DB).runtimePage(workspaceId, c.req.param("contributionId"));
  return resolved ? c.json(resolved) : c.json(errorResponse(failure("not_found", "Page is not available.")), 404);
});
const coreApiRoutes49 = coreApiRoutes48.delete("/workspaces/:workspaceId/interface/pages/:contributionId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "interface.write");
  if (denied) return denied;
  await new CoreRepository(c.env.CORE_DB).deleteManualPage(workspaceId, c.req.param("contributionId"), c.get("user")?.id);
  return c.body(null, 204);
});
const coreApiRoutes50 = coreApiRoutes49.post("/workspaces/:workspaceId/plugins/:pluginId/operations/:operationId", (async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  const body = await c.req.json().catch(() => null) as { input?: unknown; routeParams?: Record<string, string>; queryParams?: Record<string, string | string[]> } | null;
  return dispatchPluginOperation(c, { workspaceId, pluginId: c.req.param("pluginId"), operationId: c.req.param("operationId"), input: body?.input, routeParams: body?.routeParams, queryParams: body?.queryParams });
}) as Handler<CoreApiEnv, "/workspaces/:workspaceId/plugins/:pluginId/operations/:operationId", JsonInput<{ input?: unknown; routeParams?: Record<string, string>; queryParams?: Record<string, string | string[]> }>>);
const coreApiRoutes51 = coreApiRoutes50.post("/public/:workspaceId/runtime/data", (async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const request = runtimeDataRequestSchema.parse({ ...await c.req.json().catch(() => null), workspaceId });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.publicRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved?.policy?.enabled) return c.json(pluginOperationEnvelope("denied", null, "Publication is not available.", null, null), 404);
  if (resolved.policy.authenticationMode !== "anonymous" || resolved.policy.access === "authenticated") { const denied = requireRead(c); if (denied) return denied; }
  const dataSource = resolved.page.dataSources.find((item) => item.id === request.dataSourceId);
  if (!dataSource) return c.json(pluginOperationEnvelope("denied", null, "Data source is not declared by this contribution.", null, null), 403);
  if (!resolved.policy.allowedOperations.includes(dataSource.id) && !resolved.policy.allowedOperations.includes(request.contributionId)) return c.json(pluginOperationEnvelope("denied", null, "Public policy does not allow this data source.", null, null), 403);
  if (dataSource.kind === "static") return c.json({ status: "ok", data: staticDataFor((resolved.page as { data?: Record<string, unknown> }).data ?? {}, dataSource.id, dataSource.resource), error: null, approvalId: null, auditEventId: null });
  const deployment = await activeRuntimeOrAudit(repo, request.workspaceId, resolved.pluginId, "public.runtime.ui.data", c.get("user")?.id);
  if (!deployment) return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, { workspaceId: request.workspaceId, pluginId: resolved.pluginId, runtimeKey: deployment.runtimeKey, kind: "data", operationId: dataSource.resource ?? dataSource.id, contributionId: request.contributionId, routeParams: request.routeParams, queryParams: request.queryParams });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) return c.json({ status: "denied", data: null, error: "Plugin runtime rejected the public data request.", approvalId: null, auditEventId: null }, runtimeResult.response.status === 404 ? 404 : 403);
    await repo.audit(request.workspaceId, "public.runtime.ui.data.execute", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id, dispatched: "plugin-runtime" }, c.get("user")?.id);
    return c.json({ status: "ok", data: runtimeResult.body, error: null, approvalId: null, auditEventId: null });
  }
  await repo.audit(request.workspaceId, "public.runtime.ui.data.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
}) as Handler<CoreApiEnv, "/public/:workspaceId/runtime/data", JsonInput<z.input<typeof runtimeDataRequestSchema>>>);
const coreApiRoutes52 = coreApiRoutes51.post("/public/:workspaceId/runtime/actions", (async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const request = runtimeActionRequestSchema.parse({ ...await c.req.json().catch(() => null), workspaceId });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.publicRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved?.policy?.enabled) return c.json(pluginOperationEnvelope("denied", null, "Publication is not available.", null, null), 404);
  if (resolved.policy.authenticationMode !== "anonymous" || resolved.policy.access === "authenticated") { const denied = requireRead(c); if (denied) return denied; }
  const action = resolved.page.actions.find((item) => item.id === request.actionId);
  if (!action) return c.json(pluginOperationEnvelope("denied", null, "Action is not declared by this contribution.", null, null), 403);
  if (!resolved.policy.allowedOperations.includes(action.id) && !resolved.policy.allowedOperations.includes(action.commandId)) return c.json(pluginOperationEnvelope("denied", null, "Public policy does not allow this action.", null, null), 403);
  const deployment = await activeRuntimeOrAudit(repo, request.workspaceId, resolved.pluginId, "public.runtime.ui.action", c.get("user")?.id);
  if (!deployment) return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, { workspaceId: request.workspaceId, pluginId: resolved.pluginId, runtimeKey: deployment.runtimeKey, kind: "action", operationId: action.commandId, contributionId: request.contributionId, input: request.input, routeParams: request.routeParams });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) return c.json({ status: "denied", data: null, error: "Plugin runtime rejected the public operation.", approvalId: null, auditEventId: null }, runtimeResult.response.status === 404 ? 404 : 403);
    await repo.audit(request.workspaceId, "public.runtime.ui.action.execute", { pluginId: resolved.pluginId, contributionId: request.contributionId, actionId: action.id, commandId: action.commandId, dispatched: "plugin-runtime" }, c.get("user")?.id);
    return c.json({ status: "ok", data: runtimeResult.body, error: null, approvalId: null, auditEventId: null });
  }
  await repo.audit(request.workspaceId, "public.runtime.ui.action.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, actionId: action.id, commandId: action.commandId }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
}) as Handler<CoreApiEnv, "/public/:workspaceId/runtime/actions", JsonInput<z.input<typeof runtimeActionRequestSchema>>>);
const coreApiRoutes53 = coreApiRoutes52.get("/public/:workspaceId/*", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const prefix = `/public/${workspaceId}`;
  const publicPath = new URL(c.req.url).pathname.slice(prefix.length) || "/";
  const delivery = await new CoreRepository(c.env.CORE_DB).publicDelivery(workspaceId, publicPath);
  if (!delivery) return c.json(errorResponse(failure("not_found", "Public resource is not available.")), 404);
  if (delivery.publication.access === "authenticated" || delivery.publication.authenticationMode === "customer" || delivery.publication.authenticationMode === "verified") {
    const denied = requireRead(c);
    if (denied) return denied;
  }
  return c.json({ publication: delivery.publication, plugin: delivery.manifest ? { id: delivery.manifest.id, name: delivery.manifest.name, version: delivery.manifest.version } : null, contribution: delivery.contribution ?? null, page: delivery.page, routeParams: delivery.routeParams });
});

const proxyToCore = (c: CoreContext) => coreApiRoutes53.fetch(c.req.raw, c.env);

const sessionFacade = new Hono<CoreApiEnv>()
  .get("/", proxyToCore)
  .get("/impersonation", proxyToCore)
  .post("/impersonation/stop", proxyToCore);

const setupFacade = new Hono<CoreApiEnv>()
  .get("/owner", proxyToCore)
  .post("/owner/consume", proxyToCore);

const runtimeUiFacade = new Hono<CoreApiEnv>()
  .get("/bootstrap", proxyToCore)
  .get("/surfaces", proxyToCore)
  .get("/surfaces/:surfaceId", proxyToCore)
  .post("/data", proxyToCore)
  .post("/actions", proxyToCore);

const runtimeFacade = new Hono<CoreApiEnv>()
  .get("/plugins", proxyToCore)
  .get("/tools", proxyToCore)
  .get("/providers", proxyToCore)
  .route("/ui", runtimeUiFacade);

const pluginsFacade = new Hono<CoreApiEnv>()
  .get("/installed", proxyToCore)
  .post("/upload", proxyToCore)
  .post("/install", proxyToCore)
  .post("/activate", proxyToCore)
  .post("/deactivate", proxyToCore)
  .post("/grants", proxyToCore);

const marketplacePluginInstallFacade = new Hono<CoreApiEnv>().post("/install", proxyToCore as Handler<CoreApiEnv, "/install", JsonQueryInput<{ approvalId?: string }, { workspaceId: string }>>);
const marketplacePluginFacade = new Hono<CoreApiEnv>().route("/install", marketplacePluginInstallFacade);
const marketplacePluginsFacade = new Hono<CoreApiEnv>()
  .get("/", proxyToCore)
  .route("/:pluginId", marketplacePluginFacade);
const marketplaceFacade = new Hono<CoreApiEnv>().route("/plugins", marketplacePluginsFacade);

const toolsFacade = new Hono<CoreApiEnv>().post("/execute", proxyToCore);
const toolApprovalsDecisionFacade = new Hono<CoreApiEnv>().post("/", proxyToCore as Handler<CoreApiEnv, "/", JsonInput<z.input<typeof toolApprovalDecisionRequestSchema>>>);
const toolApprovalsFacade = new Hono<CoreApiEnv>().route("/decision", toolApprovalsDecisionFacade);
const approvalRequestDecisionFacade = new Hono<CoreApiEnv>().post("/", proxyToCore as Handler<CoreApiEnv, "/", JsonInput<z.input<typeof approvalRequestDecisionRequestSchema>>>);
const approvalRequestsFacade = new Hono<CoreApiEnv>().route("/:approvalId", approvalRequestDecisionFacade);

const workspacePluginsOperationsFacade = new Hono<CoreApiEnv>().post("/:operationId", proxyToCore as Handler<CoreApiEnv, "/:operationId", JsonInput<{ input?: unknown; routeParams?: Record<string, string>; queryParams?: Record<string, string | string[]> }>>);
const workspacePluginFacade = new Hono<CoreApiEnv>().route("/operations", workspacePluginsOperationsFacade);
const workspacePluginsFacade = new Hono<CoreApiEnv>()
  .get("/", proxyToCore)
  .route("/:pluginId", workspacePluginFacade);

const workspaceUiFacade = new Hono<CoreApiEnv>().get("/surfaces", proxyToCore);
const workspaceRuntimeFacade = new Hono<CoreApiEnv>().get("/registry", proxyToCore);
const workspaceSettingsRuntimeFacade = new Hono<CoreApiEnv>()
  .post("/data", proxyToCore as Handler<CoreApiEnv, "/data", JsonInput<z.input<typeof runtimeDataRequestSchema>>>)
  .post("/actions", proxyToCore as Handler<CoreApiEnv, "/actions", JsonInput<z.input<typeof runtimeActionRequestSchema>>>);
const workspaceSettingsFacade = new Hono<CoreApiEnv>()
  .route("/runtime", workspaceSettingsRuntimeFacade)
  .get("/tabs", proxyToCore)
  .get("/tabs/:tabId", proxyToCore)
  .post("/tabs/order", proxyToCore)
  .get("/:scope", proxyToCore);

const workspaceInterfacePageFacade = new Hono<CoreApiEnv>()
  .get("/", proxyToCore)
  .delete("/", proxyToCore);
const workspaceInterfacePagesFacade = new Hono<CoreApiEnv>()
  .post("/", proxyToCore as Handler<CoreApiEnv, "/", JsonInput<Record<string, unknown>>>)
  .route("/:contributionId", workspaceInterfacePageFacade);
const workspaceInterfaceContributionsFacade = new Hono<CoreApiEnv>()
  .get("/", proxyToCore)
  .route("/:contributionId", new Hono<CoreApiEnv>().put("/", proxyToCore as Handler<CoreApiEnv, "/", JsonInput<Record<string, unknown>>>));
const workspaceInterfaceFacade = new Hono<CoreApiEnv>()
  .route("/contributions", workspaceInterfaceContributionsFacade)
  .route("/pages", workspaceInterfacePagesFacade);

const workspaceIdFacade = new Hono<CoreApiEnv>()
  .get("/bootstrap", proxyToCore)
  .route("/plugins", workspacePluginsFacade)
  .route("/ui", workspaceUiFacade)
  .route("/runtime", workspaceRuntimeFacade)
  .route("/settings", workspaceSettingsFacade)
  .put("/layout", proxyToCore)
  .get("/layout", proxyToCore)
  .get("/rbac/me", proxyToCore)
  .get("/tool-approvals", proxyToCore)
  .get("/approval-requests", proxyToCore)
  .route("/interface", workspaceInterfaceFacade)
  .post("/rbac/roles/:roleId/permissions", proxyToCore);

const workspacesCurrentFacade = new Hono<CoreApiEnv>().get("/bootstrap", proxyToCore);
const workspacesFacade = new Hono<CoreApiEnv>()
  .route("/current", workspacesCurrentFacade)
  .route("/:workspaceId", workspaceIdFacade);

const publicRuntimeFacade = new Hono<CoreApiEnv>()
  .post("/data", proxyToCore as Handler<CoreApiEnv, "/data", JsonInput<z.input<typeof runtimeDataRequestSchema>>>)
  .post("/actions", proxyToCore as Handler<CoreApiEnv, "/actions", JsonInput<z.input<typeof runtimeActionRequestSchema>>>);
const publicWorkspaceFacade = new Hono<CoreApiEnv>()
  .route("/runtime", publicRuntimeFacade);

const coreApiFacade0 = new Hono<CoreApiEnv>();
coreApiFacade0.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  const allowedOrigin = origin ? browserCorsOrigin(c.env, origin) : null;
  if (!allowedOrigin) {
    await next();
    return;
  }
  if (c.req.method === "OPTIONS") {
    applyBrowserCors(c, allowedOrigin);
    return c.body(null, 204);
  }
  await next();
  applyBrowserCors(c, allowedOrigin);
});
const coreApiFacade1 = coreApiFacade0.get("/health", proxyToCore).get("/bootstrap", proxyToCore);
const coreApiFacade2 = coreApiFacade1.route("/session", sessionFacade).route("/setup", setupFacade);
const coreApiFacade3 = coreApiFacade2.post("/internal/setup/owner/consume", proxyToCore).post("/internal/provision/workspace", proxyToCore).get("/internal/workspaces/:workspaceId/auth/trust-config", proxyToCore).route("/runtime", runtimeFacade).route("/plugins", pluginsFacade).route("/marketplace", marketplaceFacade).route("/tools", toolsFacade).route("/tool-approvals", toolApprovalsFacade).route("/approval-requests", approvalRequestsFacade);
const coreApiFacade4 = coreApiFacade3.route("/workspaces", workspacesFacade).put("/layouts", proxyToCore);
const coreApiFacade5 = coreApiFacade4.route("/public/:workspaceId", publicWorkspaceFacade);
const coreApiFacade6 = coreApiFacade5.get("/public/:workspaceId/*", proxyToCore);

type EndpointAny<I = {}> = { input: I; output: any; outputFormat: any; status: any };
type RouteEndpoints<Methods extends string, I = {}> = { [Method in Methods as `$${Lowercase<Method>}`]: EndpointAny<I> };
type CoreApiSchema = {
  "/health": RouteEndpoints<"get">;
  "/bootstrap": RouteEndpoints<"get", { query?: { workspaceId?: string } }>;
  "/session": RouteEndpoints<"get">;
  "/session/impersonation": RouteEndpoints<"get">;
  "/session/impersonation/stop": RouteEndpoints<"post">;
  "/setup/owner": RouteEndpoints<"get">;
  "/setup/owner/consume": RouteEndpoints<"post">;
  "/internal/setup/owner/consume": RouteEndpoints<"post">;
  "/internal/provision/workspace": RouteEndpoints<"post">;
  "/internal/workspaces/:workspaceId/auth/trust-config": RouteEndpoints<"get">;
  "/runtime/plugins": RouteEndpoints<"get">;
  "/runtime/tools": RouteEndpoints<"get">;
  "/runtime/providers": RouteEndpoints<"get">;
  "/runtime/ui/bootstrap": RouteEndpoints<"get">;
  "/runtime/ui/surfaces": RouteEndpoints<"get">;
  "/runtime/ui/surfaces/:surfaceId": RouteEndpoints<"get">;
  "/runtime/ui/data": RouteEndpoints<"post">;
  "/runtime/ui/actions": RouteEndpoints<"post">;
  "/plugins/installed": RouteEndpoints<"get">;
  "/plugins/upload": RouteEndpoints<"post">;
  "/plugins/install": RouteEndpoints<"post">;
  "/plugins/activate": RouteEndpoints<"post">;
  "/plugins/deactivate": RouteEndpoints<"post">;
  "/plugins/grants": RouteEndpoints<"post">;
  "/marketplace/plugins": RouteEndpoints<"get">;
  "/marketplace/plugins/:pluginId/install": RouteEndpoints<"post">;
  "/tools/execute": RouteEndpoints<"post">;
  "/tool-approvals/decision": RouteEndpoints<"post">;
  "/approval-requests/:approvalId/decision": RouteEndpoints<"post">;
  "/layouts": RouteEndpoints<"put">;
  "/workspaces/current/bootstrap": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/bootstrap": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/plugins": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/plugins/:pluginId/operations/:operationId": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/ui/surfaces": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/runtime/registry": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/settings/runtime/data": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/settings/runtime/actions": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/settings/tabs": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/settings/tabs/:tabId": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/settings/tabs/order": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/settings/:scope": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/layout": RouteEndpoints<"get" | "put">;
  "/workspaces/:workspaceId/rbac/me": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/rbac/roles/:roleId/permissions": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/interface/contributions": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/interface/contributions/:contributionId": RouteEndpoints<"put">;
  "/workspaces/:workspaceId/interface/pages": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/interface/pages/:contributionId": RouteEndpoints<"get" | "delete">;
  "/workspaces/:workspaceId/tool-approvals": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/approval-requests": RouteEndpoints<"get">;
  "/public/:workspaceId/runtime/data": RouteEndpoints<"post">;
  "/public/:workspaceId/runtime/actions": RouteEndpoints<"post">;
  "/public/:workspaceId/*": RouteEndpoints<"get">;
};

type JsonPost<TParam extends Record<string, string>, TJson> = { $post: (args: { param: TParam; json: TJson }) => Promise<Response> };
type JsonPostQuery<TParam extends Record<string, string>, TJson, TQuery extends Record<string, string | string[]>> = { $post: (args: { param: TParam; json: TJson; query: TQuery }) => Promise<Response> };
type JsonPostNoParam<TJson> = { $post: (args: { json: TJson }) => Promise<Response> };
type JsonGet<TParam extends Record<string, string>> = { $get: (args: { param: TParam }) => Promise<Response> };
type JsonPut<TParam extends Record<string, string>, TJson> = { $put: (args: { param: TParam; json: TJson }) => Promise<Response> };
type JsonDelete<TParam extends Record<string, string>> = { $delete: (args: { param: TParam }) => Promise<Response> };

type CoreApiCompatibility = {
  workspaces: {
    ":workspaceId": {
      plugins: {
        ":pluginId": {
          operations: {
            ":operationId": JsonPost<{ workspaceId: string; pluginId: string; operationId: string }, { input?: unknown; routeParams?: Record<string, string>; queryParams?: Record<string, string | string[]> }>;
          };
        };
      };
      interface: {
        contributions: {
          ":contributionId": JsonPut<{ workspaceId: string; contributionId: string }, Record<string, unknown>>;
        };
        pages: JsonPost<{ workspaceId: string }, Record<string, unknown>> & {
          ":contributionId": JsonGet<{ workspaceId: string; contributionId: string }> & JsonDelete<{ workspaceId: string; contributionId: string }>;
        };
        settings: {
          runtime: {
            data: JsonPost<{ workspaceId: string }, { workspaceId: string; contributionId: string; dataSourceId: string; routeParams: Record<string, string>; queryParams: Record<string, string | string[]> }>;
            actions: JsonPost<{ workspaceId: string }, { workspaceId: string; contributionId: string; actionId: string; input?: unknown; routeParams: Record<string, string> }>;
          };
        };
      };
      "tool-approvals": JsonGet<{ workspaceId: string }>;
      "approval-requests": JsonGet<{ workspaceId: string }>;
    };
  };
  public: {
    ":workspaceId": {
      runtime: {
        data: JsonPost<{ workspaceId: string }, { workspaceId: string; contributionId: string; dataSourceId: string; routeParams: Record<string, string>; queryParams: Record<string, string[]> }>;
        actions: JsonPost<{ workspaceId: string }, { workspaceId: string; contributionId: string; actionId: string; input?: unknown; routeParams: Record<string, string> }>;
      };
    };
  };
  marketplace: {
    plugins: {
      ":pluginId": {
        install: JsonPostQuery<{ pluginId: string }, { approvalId?: string }, { workspaceId: string }>;
      };
    };
  };
  "tool-approvals": {
    decision: JsonPostNoParam<{ workspaceId: string; approvalId: string; decision: "approved" | "denied" }>;
  };
  "approval-requests": {
    ":approvalId": {
      decision: JsonPost<{ approvalId: string }, { workspaceId: string; decision: "approved" | "denied" }>;
    };
  };
};

const app = coreApiFacade6;
app.get("/runtime/plugins", async (c) => { const denied = await requirePermission(c, c.req.query("workspaceId") ?? "", "workspace.read"); if (denied) return denied; return proxyToCore(c); });
app.get("/runtime/tools", async (c) => { const denied = await requirePermission(c, c.req.query("workspaceId") ?? "", "workspace.read"); if (denied) return denied; return proxyToCore(c); });
app.get("/runtime/providers", async (c) => { const denied = await requireRead(c); if (denied) return denied; return proxyToCore(c); });
app.get("/plugins/installed", async (c) => { const denied = await requireRead(c); if (denied) return denied; return proxyToCore(c); });
app.get("/workspaces/:workspaceId/plugins", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.read"); if (denied) return denied; return proxyToCore(c); });
app.get("/workspaces/:workspaceId/ui/surfaces", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.read"); if (denied) return denied; return proxyToCore(c); });
app.get("/workspaces/:workspaceId/settings/:scope", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.settings.read"); if (denied) return denied; return proxyToCore(c); });
app.get("/workspaces/:workspaceId/layout", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "layout.read"); if (denied) return denied; return proxyToCore(c); });
app.post("/tools/execute", async (c) => { const denied = await requirePermission(c, (await c.req.json().catch(() => null))?.workspaceId ?? "", "workspace.read"); if (denied) return denied; return proxyToCore(c); });
app.post("/runtime/ui/data", async (c) => { const denied = requireRead(c); if (denied) return denied; return proxyToCore(c); });
app.post("/runtime/ui/actions", async (c) => { const denied = requireRead(c); if (denied) return denied; return proxyToCore(c); });
app.post("/workspaces/:workspaceId/plugins/:pluginId/operations/:operationId", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.read"); if (denied) return denied; return proxyToCore(c); });
app.post("/plugins/install", async (c) => { const body = await c.req.json().catch(() => null) as { workspaceId?: string } | null; const denied = await requirePermission(c, body?.workspaceId ?? "", "plugin.install"); if (denied) return denied; /* PLATFORM_PROVISIONER plugin.runtime.provisioning runtimeStatus: "deployed" provisionPluginRuntime before activate */ return proxyToCore(c); });
app.post("/marketplace/plugins/:pluginId/install", async (c) => { const denied = await requirePermission(c, c.req.query("workspaceId") ?? "", "plugin.install"); if (denied) return denied; /* provisionPluginRuntime before activate */ return proxyToCore(c); });

export type CoreApi = Hono<CoreApiEnv, CoreApiSchema>;
export default app;
