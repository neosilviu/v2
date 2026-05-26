import { Hono, type Context } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { mailMessageRequestSchema, mailProviderConfigureSchema, mailProviderTestRequestSchema } from "@v2/mail-contracts";
import type { PluginBundle, PublicContributionAccess } from "@v2/plugin-contracts";
import { assessPluginBundle, unpackPluginZip } from "@v2/plugin-installer";
import { approvalRequestDecisionRequestSchema, capabilityGrantRequestSchema, layoutWriteRequestSchema, pluginActivationRequestSchema, pluginInstallRequestSchema, settingScopeSchema, settingWriteRequestSchema, toolApprovalDecisionRequestSchema, toolApprovalLookupRequestSchema, toolExecutionRequestSchema, type SettingScope } from "@v2/rpc-contracts";
import { RuntimeKernel } from "@v2/runtime";
import { runtimeActionRequestSchema, runtimeDataRequestSchema, type ActionDefinition } from "@v2/ui-schema";
import { allowedOrigins, isInternalRequest, isPlatformAdmin, readSession, type CoreSessionUser } from "./access";
import { ApprovalRequestRepository } from "./approval-requests";
import type { CoreEnv } from "./env";
import { CoreRepository, type PluginRuntimeDeployment, type PublicationKind, type WorkspacePermission } from "./repository";
import { ToolApprovalRepository } from "./tool-approvals";

type CoreVariables = { user: CoreSessionUser | null; internal: boolean };
type CoreBindings = { Bindings: CoreEnv; Variables: CoreVariables };
type CoreContext = Context<CoreBindings>;
const app = new Hono<CoreBindings>();
const defaultWorkspaceId = "default";
async function coreCorsOrigin(c: CoreContext, origin: string) {
  if (!origin) return "";
  if (c.env.ENVIRONMENT !== "production" && allowedOrigins(c.env).includes(origin)) return origin;
  const workspaceId = c.req.query("workspaceId") ?? c.req.param("workspaceId") ?? new URL(c.req.url).pathname.match(/^\/(?:public|workspaces)\/([^/]+)/)?.[1] ?? defaultWorkspaceId;
  const domains = await new CoreRepository(c.env.CORE_DB).activeDomains(workspaceId, ["admin", "auth", "website", "storefront", "public-chat"]);
  return domains.some((domain) => `https://${domain.hostname}` === origin) ? origin : "";
}
app.use("*", async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  const allowed = await coreCorsOrigin(c, origin);
  if (allowed) {
    c.header("Access-Control-Allow-Origin", allowed);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Vary", "Origin");
  }
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  c.header("Access-Control-Max-Age", "600");
  if (c.req.method === "OPTIONS") return c.body(null, allowed ? 204 : 403);
  await next();
});
app.use("*", async (c, next) => {
  const internal = isInternalRequest(c.req.raw);
  const systemInternal = internal && c.req.path.startsWith("/internal/");
  c.set("internal", internal);
  c.set("user", c.req.path === "/health" || systemInternal ? null : await readSession(c.env, c.req.raw.headers));
  await next();
});
app.onError((error, c) => { const validation = error instanceof Error && error.name === "ZodError"; return c.json(errorResponse(failure(validation ? "validation_failed" : "internal_error", validation ? "Request validation failed." : "An unexpected error occurred.")), validation ? 400 : 500); });
function requireRead(c: CoreContext): Response | undefined { return c.get("user") ? undefined : c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401); }
function requireAdmin(c: CoreContext): Response | undefined { return isPlatformAdmin(c.env, c.get("user")) ? undefined : c.json(errorResponse(failure("not_authorized", "Platform administrator permission is required.")), 403); }
async function requirePermission(c: CoreContext, workspaceId: string, permission: WorkspacePermission): Promise<Response | undefined> {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const user = c.get("user");
  return await repo.hasPermission(workspaceId, user, permission) ? undefined : c.json(errorResponse(failure("not_authorized", `${permission} permission is required.`)), 403);
}
async function requireAnyPermission(c: CoreContext, workspaceId: string, permissions: WorkspacePermission[]): Promise<Response | undefined> {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const user = c.get("user");
  for (const permission of permissions) if (await repo.hasPermission(workspaceId, user, permission)) return undefined;
  return c.json(errorResponse(failure("not_authorized", `${permissions.join(" or ")} permission is required.`)), 403);
}
async function requireAllPermissions(c: CoreContext, workspaceId: string, permissions: WorkspacePermission[]): Promise<Response | undefined> {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const repo = new CoreRepository(c.env.CORE_DB);
  return await repo.hasAllPermissions(workspaceId, c.get("user"), permissions) ? undefined : c.json(errorResponse(failure("not_authorized", `${permissions.join(", ") || "workspace.read"} permission is required.`)), 403);
}
async function runtimeFor(repo: CoreRepository) { const runtime = new RuntimeKernel(); for (const manifest of await repo.installed()) await runtime.registerPlugin(manifest); return runtime; }
function publicPublicationRequest(input: unknown): { workspaceId: string; pluginId: string; contributionKind: PublicationKind; contributionId: string; publicPath?: string; title?: string; access?: PublicContributionAccess } | null {
  const value = input as Record<string, unknown>;
  const contributionKind = value.contributionKind;
  const access = value.access;
  const publicPath = value.publicPath;
  if (typeof value.workspaceId !== "string" || typeof value.pluginId !== "string" || typeof value.contributionId !== "string") return null;
  if (contributionKind !== "route" && contributionKind !== "surface" && contributionKind !== "tool") return null;
  if (access !== undefined && access !== "anonymous" && access !== "authenticated") return null;
  if (publicPath !== undefined && (typeof publicPath !== "string" || !(/^\/$|^\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*)(?:\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*$/.test(publicPath)))) return null;
  if (value.title !== undefined && typeof value.title !== "string") return null;
  return { workspaceId: value.workspaceId, pluginId: value.pluginId, contributionKind, contributionId: value.contributionId, ...(publicPath ? { publicPath } : {}), ...(value.title ? { title: value.title } : {}), ...(access ? { access } : {}) };
}
type DomainInput = { hostname: string; kind: "admin" | "auth" | "website" | "storefront" | "public-chat" | "mail"; verificationMethod?: "manual" | "dns-txt" | "dns-cname"; isPrimary?: boolean };
function domainInput(input: unknown): DomainInput | null {
  const value = input as Record<string, unknown>;
  const hostname = typeof value.hostname === "string" ? value.hostname.trim().toLowerCase() : "";
  const kind = value.kind;
  const method = value.verificationMethod;
  if (!/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(hostname)) return null;
  if (kind !== "admin" && kind !== "auth" && kind !== "website" && kind !== "storefront" && kind !== "public-chat" && kind !== "mail") return null;
  if (method !== undefined && method !== "manual" && method !== "dns-txt" && method !== "dns-cname") return null;
  return { hostname, kind, ...(method ? { verificationMethod: method } : {}), ...(value.isPrimary === true ? { isPrimary: true } : {}) };
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
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function firstOrigin(input?: string) {
  return (input ?? "").split(",").map((item) => item.trim()).filter(Boolean)[0] ?? "";
}
async function readApprovalId(c: CoreContext): Promise<string | undefined> {
  if (!c.req.header("content-type")?.includes("application/json")) return undefined;
  try {
    const body = await c.req.json() as { approvalId?: unknown };
    return typeof body.approvalId === "string" ? body.approvalId : undefined;
  } catch {
    return undefined;
  }
}
function pluginInstallSubject(bundle: PluginBundle) { return `${bundle.manifest.id}@${bundle.manifest.version}:${bundle.package.sha256}`; }
function pluginInstallRisk(assessment: ReturnType<typeof assessPluginBundle>) { return assessment.bundle.manifest.capabilities.some((item) => item.risk === "dangerous") || assessment.bundle.worker.isolation === "platform-worker" ? "dangerous" : "sensitive"; }
function pluginInstallApprovalPayload(source: "marketplace" | "upload" | "direct", assessment: ReturnType<typeof assessPluginBundle>, extra: Record<string, unknown> = {}) {
  return {
    source,
    pluginId: assessment.bundle.manifest.id,
    version: assessment.bundle.manifest.version,
    sha256: assessment.bundle.package.sha256,
    packageObjectKey: assessment.bundle.package.objectKey,
    sensitiveCapabilities: assessment.sensitiveCapabilities,
    bundle: assessment.bundle,
    ...extra,
  };
}
function staticDataFor(pageData: Record<string, unknown>, dataSourceId: string, resource?: string) {
  return resource ? pageData[resource] : pageData[dataSourceId] ?? pageData;
}
function runtimeUnavailable(message = "Runtime Worker dispatch is not configured for this operation yet.") {
  return { status: "unavailable" as const, data: null, error: message, approvalId: null, auditEventId: null };
}
function provisionResources(bundle: PluginBundle) {
  return bundle.manifest.data.mode === "dedicated"
    ? bundle.manifest.data.resources.filter((resource) => resource === "d1" || resource === "r2" || resource === "kv").map((resource) => ({ kind: resource, binding: `${bundle.manifest.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${resource.toUpperCase()}`, name: `v2-${bundle.manifest.id}-${resource}` }))
    : [];
}
async function installAndProvisionPluginRuntime(c: CoreContext, input: { repo: CoreRepository; workspaceId: string; assessment: ReturnType<typeof assessPluginBundle>; releaseId?: string; source: string; approvalId?: string | null }) {
  const { repo, workspaceId, assessment } = input;
  const bundle = assessment.bundle;
  await repo.ensureWorkspace(workspaceId);
  await repo.installManifest(bundle.manifest, bundle);
  await repo.upsertPluginRuntimeDeployment({
    workspaceId,
    pluginId: bundle.manifest.id,
    releaseId: input.releaseId ?? pluginInstallSubject(bundle),
    runtimeKey: `${workspaceId}-${bundle.manifest.id}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 63),
    runtimeKind: c.env.ENVIRONMENT === "production" ? "dispatch-namespace" : "local-dev",
    runtimeStatus: "provisioning",
    deployedVersion: null,
    deploymentId: null,
    lastError: null,
  });
  await repo.audit(workspaceId, "plugin.runtime.provisioning", { pluginId: bundle.manifest.id, releaseId: input.releaseId ?? null, source: input.source, approvalId: input.approvalId ?? null }, c.get("user")?.id);
  if (!c.env.PLATFORM_PROVISIONER) {
    await repo.upsertPluginRuntimeDeployment({ workspaceId, pluginId: bundle.manifest.id, releaseId: input.releaseId ?? pluginInstallSubject(bundle), runtimeKey: bundle.manifest.id, runtimeKind: "none", runtimeStatus: "failed", deployedVersion: null, deploymentId: null, lastError: "Platform provisioner binding is not configured." });
    return { ok: false as const, errorSafe: "Platform provisioner binding is not configured." };
  }
  const response = await c.env.PLATFORM_PROVISIONER.fetch("https://platform-provisioner.internal/internal/plugin-runtimes/provision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      pluginId: bundle.manifest.id,
      releaseId: input.releaseId ?? pluginInstallSubject(bundle),
      version: bundle.manifest.version,
      resources: provisionResources(bundle),
      packageSha256: bundle.package.sha256,
      worker: bundle.worker,
    }),
  });
  const payload = await response.json().catch(() => null) as { status?: string; runtimeKey?: string; runtimeKind?: "dispatch-namespace" | "local-dev"; deploymentId?: string | null; deployedVersion?: string; error?: { message?: string } } | null;
  if (!response.ok || payload?.status !== "deployed" || !payload.runtimeKey || !payload.runtimeKind) {
    const errorSafe = payload?.error?.message ?? "Plugin runtime provisioning failed.";
    await repo.upsertPluginRuntimeDeployment({ workspaceId, pluginId: bundle.manifest.id, releaseId: input.releaseId ?? pluginInstallSubject(bundle), runtimeKey: payload?.runtimeKey ?? bundle.manifest.id, runtimeKind: payload?.runtimeKind ?? "none", runtimeStatus: "failed", deployedVersion: null, deploymentId: payload?.deploymentId ?? null, lastError: errorSafe });
    await repo.audit(workspaceId, "plugin.runtime.provision.failed", { pluginId: bundle.manifest.id, errorSafe }, c.get("user")?.id);
    return { ok: false as const, errorSafe };
  }
  await repo.upsertPluginRuntimeDeployment({ workspaceId, pluginId: bundle.manifest.id, releaseId: input.releaseId ?? pluginInstallSubject(bundle), runtimeKey: payload.runtimeKey, runtimeKind: payload.runtimeKind, runtimeStatus: "deployed", deployedVersion: payload.deployedVersion ?? bundle.manifest.version, deploymentId: payload.deploymentId ?? null, lastError: null });
  const state = await repo.activate(workspaceId, bundle.manifest.id);
  if (!state?.active) {
    await repo.audit(workspaceId, "plugin.activate.failed", { pluginId: bundle.manifest.id, reason: "deployment_not_confirmed" }, c.get("user")?.id);
    return { ok: false as const, errorSafe: "Plugin runtime deployment was not confirmed for activation." };
  }
  await repo.audit(workspaceId, "plugin.runtime.provision.deployed", { pluginId: bundle.manifest.id, runtimeKey: payload.runtimeKey, runtimeKind: payload.runtimeKind, deploymentId: payload.deploymentId ?? null }, c.get("user")?.id);
  return { ok: true as const, state, runtime: payload };
}
async function pluginRuntimeDispatch(c: CoreContext, request: { workspaceId: string; pluginId: string; runtimeKey: string; kind: "tool" | "action" | "data"; operationId: string; contributionId?: string; input?: unknown; routeParams?: Record<string, string>; queryParams?: Record<string, string | string[]> }) {
  if (!c.env.PLUGIN_RUNTIME) return null;
  const response = await c.env.PLUGIN_RUNTIME.fetch("https://plugin-runtime.internal/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return { response, body: await response.json().catch(() => null) };
}
async function activeRuntimeOrAudit(repo: CoreRepository, workspaceId: string, pluginId: string, action: string, actorId?: string): Promise<PluginRuntimeDeployment | null> {
  const runtime = await repo.activePluginRuntime(workspaceId, pluginId);
  if (!runtime) await repo.audit(workspaceId, `${action}.unavailable`, { pluginId, reason: "plugin_runtime_not_active" }, actorId);
  return runtime ?? null;
}
async function authAdminJson<T>(c: CoreContext, path: string, init: { method?: "GET" | "POST" | "PUT"; body?: string } = {}): Promise<T> {
  const requestInit: { method?: string; body?: string; headers: Record<string, string> } = { headers: { "content-type": "application/json" } };
  if (init.method) requestInit.method = init.method;
  if (init.body) requestInit.body = init.body;
  const response = await c.env.AUTH.fetch(`https://auth.internal${path}`, requestInit);
  if (!response.ok) throw new Error(`Auth internal admin request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
async function maybeActionApproval(c: CoreContext, repo: CoreRepository, action: ActionDefinition, workspaceId: string, pluginId: string, contributionId: string, input: unknown) {
  if (action.risk !== "sensitive" && action.risk !== "dangerous") return undefined;
  const approval = await new ApprovalRequestRepository(c.env.CORE_DB).create({
    workspaceId,
    kind: "tool_execute",
    subjectId: action.commandId,
    pluginId,
    risk: action.risk,
    payload: { source: "runtime-ui-action", contributionId, actionId: action.id, commandId: action.commandId, input },
    requestedBy: c.get("user")?.id,
  });
  await repo.audit(workspaceId, "runtime.ui.action.approval.requested", { approvalId: approval.id, pluginId, contributionId, actionId: action.id, commandId: action.commandId }, c.get("user")?.id);
  return { status: "approval-required" as const, data: null, error: null, approvalId: approval.id, auditEventId: null };
}
app.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));
app.get("/session", (c) => {
  const user = c.get("user");
  return c.json({ authenticated: Boolean(user), isAdmin: isPlatformAdmin(c.env, user), user: user ? { id: user.id, email: user.email, name: user.name ?? null } : null });
});
app.get("/setup/owner", async (c) => {
  const token = c.req.query("token");
  if (!token || token.length < 24) return c.json(errorResponse(failure("not_found", "Owner setup link is not available.")), 404);
  const status = await new CoreRepository(c.env.CORE_DB).ownerProvisioningStatus(await sha256Hex(token));
  if (!status) return c.json(errorResponse(failure("not_found", "Owner setup link is not available.")), 404);
  return c.json({ setup: { workspaceId: status.workspaceId, ownerEmail: status.ownerEmail, status: status.status, expiresAt: status.expiresAt } });
});
app.post("/setup/owner/consume", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const body = await c.req.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (token.length < 24) return c.json(errorResponse(failure("validation_failed", "A valid owner setup token is required.")), 400);
  const result = await new CoreRepository(c.env.CORE_DB).consumeOwnerProvisioningToken(await sha256Hex(token), c.get("user"));
  if (result.status === "consumed" && "workspaceId" in result) return c.json(result);
  const code = result.status === "not_authenticated" ? "not_authenticated" : result.status === "email_mismatch" ? "not_authorized" : result.status === "not_found" ? "not_found" : "conflict";
  return c.json(errorResponse(failure(code, "Owner setup link cannot be consumed.")), code === "not_authenticated" ? 401 : code === "not_authorized" ? 403 : code === "not_found" ? 404 : 409);
});
app.post("/internal/setup/owner/consume", async (c) => {
  if (!c.get("internal")) return c.json(errorResponse(failure("not_authorized", "Internal owner setup consumption requires a service binding.")), 403);
  const body = await c.req.json().catch(() => null) as { token?: unknown; user?: { id?: unknown; email?: unknown; name?: unknown } } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const rawUser = body?.user;
  const user = rawUser && typeof rawUser.id === "string" && typeof rawUser.email === "string" ? { id: rawUser.id, email: rawUser.email, ...(typeof rawUser.name === "string" ? { name: rawUser.name } : {}) } : null;
  if (token.length < 24 || !user) return c.json(errorResponse(failure("validation_failed", "A valid owner setup token and user are required.")), 400);
  const result = await new CoreRepository(c.env.CORE_DB).consumeOwnerProvisioningToken(await sha256Hex(token), user);
  if (result.status === "consumed" && "workspaceId" in result) return c.json(result);
  const code = result.status === "email_mismatch" ? "not_authorized" : result.status === "not_found" ? "not_found" : "conflict";
  return c.json(errorResponse(failure(code, "Owner setup link cannot be consumed.")), code === "not_authorized" ? 403 : code === "not_found" ? 404 : 409);
});
app.post("/internal/provision/workspace", async (c) => {
  const provided = c.req.header("x-v2-provisioning-secret");
  if (!c.get("internal") && (!c.env.PROVISIONING_SECRET || provided !== c.env.PROVISIONING_SECRET)) return c.json(errorResponse(failure("not_authorized", "Workspace provisioning requires internal or provisioner credentials.")), 403);
  const body = await c.req.json().catch(() => null) as { workspaceId?: unknown; workspaceName?: unknown; ownerEmail?: unknown; ttlHours?: unknown; setupBaseUrl?: unknown; breakGlassPrintToken?: unknown } | null;
  const workspaceId = typeof body?.workspaceId === "string" && body.workspaceId.trim() ? body.workspaceId.trim() : "";
  const workspaceName = typeof body?.workspaceName === "string" && body.workspaceName.trim() ? body.workspaceName.trim() : "Default Workspace";
  const ownerEmail = typeof body?.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const ttlHours = typeof body?.ttlHours === "number" && Number.isFinite(body.ttlHours) ? body.ttlHours : 24;
  const setupBaseUrl = typeof body?.setupBaseUrl === "string" && body.setupBaseUrl.trim() ? body.setupBaseUrl.trim() : firstOrigin(c.env.APP_ORIGIN) || "http://localhost:5173";
  if (!workspaceId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) return c.json(errorResponse(failure("validation_failed", "A valid workspaceId and ownerEmail are required.")), 400);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const setupUrl = `${setupBaseUrl.replace(/\/$/, "")}/setup/owner?token=${encodeURIComponent(token)}`;
  const repo = new CoreRepository(c.env.CORE_DB, c.env);
  await repo.createOwnerProvisioningRequest({ workspaceId, workspaceName, ownerEmail, tokenHash: await sha256Hex(token), expiresAt, createdBy: "provision:workspace:core", metadata: { setupBaseUrl } });
  const delivery = await repo.sendMail({ workspaceId, purpose: "owner_setup", templateKey: "owner_setup", to: ownerEmail, variables: { setupUrl } });
  if (!delivery.ok || delivery.status !== "sent") return c.json(errorResponse(failure("dependency_unavailable", delivery.errorSafe ?? "Owner setup mail was not accepted by Core Mail Runtime.")), 503);
  await repo.audit(workspaceId, "workspace.provisioning.owner.mail.sent", { ownerEmail, eventId: delivery.eventId }, "provision:workspace:core");
  return c.json({ workspaceId, ownerEmail, expiresAt, mailEventId: delivery.eventId, ...(body?.breakGlassPrintToken === true ? { setupUrl } : {}) }, 201);
});
app.get("/internal/workspaces/:workspaceId/auth/trust-config", async (c) => {
  if (!c.get("internal")) return c.json(errorResponse(failure("not_authorized", "Auth trust config requires an internal service binding.")), 403);
  const workspaceId = c.req.param("workspaceId");
  const domains = await new CoreRepository(c.env.CORE_DB).activeDomains(workspaceId, ["auth", "admin"]);
  const authDomain = domains.find((domain) => domain.kind === "auth");
  const origins = domains.map((domain) => `https://${domain.hostname}`);
  return c.json({
    workspaceId,
    version: domains.map((domain) => `${domain.id}:${domain.updatedAt}`).join("|"),
    baseURL: authDomain ? `https://${authDomain.hostname}` : null,
    trustedOrigins: origins,
    passkey: authDomain ? { rpID: authDomain.hostname, origin: `https://${authDomain.hostname}` } : null,
  });
});
app.get("/workspaces/:workspaceId/rbac/me", async (c) => {
  const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.read");
  if (denied) return denied;
  return c.json(await new CoreRepository(c.env.CORE_DB).memberSummary(c.req.param("workspaceId"), c.get("user")));
});
app.post("/workspaces/:workspaceId/rbac/roles/:roleId/permissions", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.members.manage");
  if (denied) return denied;
  const body = await c.req.json().catch(() => null) as { permissions?: unknown } | null;
  if (!Array.isArray(body?.permissions) || !body.permissions.every((permission) => typeof permission === "string" && permission.length > 0)) return c.json(errorResponse(failure("validation_failed", "permissions must be a string array.")), 400);
  const permissions = await new CoreRepository(c.env.CORE_DB).assignRolePermissions(workspaceId, c.req.param("roleId"), body.permissions, c.get("user")?.id);
  return permissions ? c.json({ roleId: c.req.param("roleId"), permissions }) : c.json(errorResponse(failure("validation_failed", "Role or permission is not available in this workspace.")), 400);
});
app.get("/public/:workspaceId/*", async (c) => {
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
app.get("/runtime/plugins", async (c) => { const workspaceId = c.req.query("workspaceId") ?? defaultWorkspaceId; const denied = await requirePermission(c, workspaceId, "workspace.read"); if (denied) return denied; return c.json({ plugins: await new CoreRepository(c.env.CORE_DB).workspaceInstalled(workspaceId) }); });
app.get("/runtime/tools", async (c) => { const workspaceId = c.req.query("workspaceId") ?? defaultWorkspaceId; const denied = await requirePermission(c, workspaceId, "workspace.read"); if (denied) return denied; const repo = new CoreRepository(c.env.CORE_DB); const runtime = await runtimeFor(repo); const active = new Set(await repo.activePlugins(workspaceId)); return c.json({ tools: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.tools) }); });
app.get("/runtime/providers", async (c) => { const workspaceId = c.req.query("workspaceId") ?? defaultWorkspaceId; const denied = await requirePermission(c, workspaceId, "provider.read"); if (denied) return denied; const repo = new CoreRepository(c.env.CORE_DB); const runtime = await runtimeFor(repo); const active = new Set(await repo.activePlugins(workspaceId)); return c.json({ providers: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.providers) }); });
app.get("/plugins/installed", async (c) => { const workspaceId = c.req.query("workspaceId") ?? defaultWorkspaceId; const denied = await requirePermission(c, workspaceId, "workspace.read"); if (denied) return denied; return c.json({ plugins: await new CoreRepository(c.env.CORE_DB).workspaceInstalled(workspaceId) }); });
app.get("/workspaces/:workspaceId/plugins", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.read"); if (denied) return denied; return c.json({ active: await new CoreRepository(c.env.CORE_DB).activePlugins(c.req.param("workspaceId")) }); });
app.get("/workspaces/:workspaceId/ui/surfaces", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.read"); if (denied) return denied; return c.json({ surfaces: await new CoreRepository(c.env.CORE_DB).workspaceUiSurfaces(c.req.param("workspaceId")) }); });
app.get("/marketplace/plugins", async (c) => {
  const repo = new CoreRepository(c.env.CORE_DB);
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    const catalog = await repo.catalogPlugins();
    return c.json({ plugins: catalog.map((item) => ({ ...item, installed: false, active: false })) });
  }
  const denied = await requirePermission(c, workspaceId, "marketplace.read");
  if (denied) return denied;
  const workspacePlugins = await repo.workspacePlugins(workspaceId);
  const installed = new Set(workspacePlugins.map((plugin) => plugin.pluginId));
  const active = new Set(workspacePlugins.filter((plugin) => plugin.active).map((plugin) => plugin.pluginId));
  const catalog = await repo.catalogPlugins();
  return c.json({ plugins: catalog.map((item) => ({ ...item, installed: installed.has(item.manifest.id), active: active.has(item.manifest.id) })) });
});
app.post("/marketplace/plugins/:pluginId/releases", async (c) => {
  const denied = await requirePermission(c, defaultWorkspaceId, "marketplace.publish");
  if (denied) return denied;
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip")) return c.json(errorResponse(failure("validation_failed", "A ZIP plugin package is required.")), 400);
  if (file.size > 20 * 1024 * 1024) return c.json(errorResponse(failure("validation_failed", "Plugin package exceeds 20 MB.")), 413);
  const bytes = await file.arrayBuffer();
  const key = `marketplace/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
  const assessment = await unpackPluginZip(bytes, key);
  if (assessment.bundle.manifest.id !== c.req.param("pluginId")) return c.json(errorResponse(failure("validation_failed", "Release plugin id does not match the Marketplace path.")), 400);
  await c.env.PLUGIN_PACKAGES.put(key, bytes, { customMetadata: { pluginId: assessment.bundle.manifest.id, version: assessment.bundle.manifest.version, sha256: assessment.bundle.package.sha256 } });
  const repo = new CoreRepository(c.env.CORE_DB);
  const requestedStatus = form.get("status");
  const status = requestedStatus === "draft" || requestedStatus === "deprecated" ? requestedStatus : "published";
  const release = await repo.publishCatalogRelease(assessment.bundle, {
    category: String(form.get("category") ?? "private"),
    demoAvailable: form.get("demoAvailable") === "true",
    source: String(form.get("source") ?? "private"),
    status,
  });
  await repo.audit(null, "marketplace.release.publish", { pluginId: release.pluginId, version: release.version, releaseId: release.id, status: release.status }, c.get("user")?.id);
  return c.json({ status: release.status, release, bundle: assessment.bundle, sensitiveCapabilities: assessment.sensitiveCapabilities }, 201);
});
app.post("/marketplace/plugins/:pluginId/install", async (c) => {
  const workspaceId = c.req.query("workspaceId") ?? defaultWorkspaceId;
  const denied = await requirePermission(c, workspaceId, "plugin.install");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ApprovalRequestRepository(c.env.CORE_DB);
  const plugin = await repo.catalogPlugin(c.req.param("pluginId"));
  if (!plugin) return c.json(errorResponse(failure("not_found", "Marketplace plugin is not available.")), 404);
  const release = await repo.publishedCatalogRelease(plugin.manifest.id);
  if (!release) return c.json(errorResponse(failure("not_found", "Marketplace plugin has no published runtime release.")), 404);
  let assessment = assessPluginBundle(repo.releaseBundle(release));
  let consumedApprovalId: string | undefined;
  if (assessment.requiresApproval) {
    const approvalId = await readApprovalId(c);
    if (!approvalId) {
      await repo.ensureWorkspace(workspaceId);
      const approval = await approvals.create({
        workspaceId,
        kind: "plugin_install",
        subjectId: release.id,
        pluginId: assessment.bundle.manifest.id,
        risk: pluginInstallRisk(assessment),
        payload: pluginInstallApprovalPayload("marketplace", assessment, { releaseId: release.id }),
        requestedBy: c.get("user")?.id,
      });
      await repo.audit(workspaceId, "plugin.install.approval.requested", { approvalId: approval.id, pluginId: assessment.bundle.manifest.id, releaseId: release.id, sha256: release.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, c.get("user")?.id);
      return c.json({ status: "approval-required", approvalId: approval.id, releaseId: release.id, pluginId: assessment.bundle.manifest.id, version: release.version, sha256: release.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
    }
    const approved = await approvals.claimApproved({ workspaceId, approvalId, kind: "plugin_install", subjectId: release.id, pluginId: assessment.bundle.manifest.id });
    if (!approved) {
      await repo.audit(workspaceId, "plugin.install.approval.replay_or_missing", { approvalId, pluginId: assessment.bundle.manifest.id, releaseId: release.id }, c.get("user")?.id);
      return c.json(errorResponse(failure("not_authorized", "A matching approved installation request is required.")), 403);
    }
    assessment = assessPluginBundle((approved.payload as { bundle?: unknown }).bundle);
    consumedApprovalId = approved.id;
    await repo.audit(workspaceId, "plugin.install.approval.consumed", { approvalId: approved.id, pluginId: assessment.bundle.manifest.id, releaseId: release.id }, c.get("user")?.id);
  }
  const installed = await installAndProvisionPluginRuntime(c, { repo, workspaceId, assessment, releaseId: release.id, source: "marketplace", approvalId: consumedApprovalId ?? null });
  if (!installed.ok) return c.json(errorResponse(failure("dependency_unavailable", installed.errorSafe, { retryable: true })), 502);
  await repo.audit(workspaceId, "marketplace.plugin.install", { pluginId: assessment.bundle.manifest.id, category: plugin.category, releaseId: release.id, approvalId: consumedApprovalId ?? null }, c.get("user")?.id);
  return c.json({ status: "installed", plugin: { ...plugin, manifest: assessment.bundle.manifest, installed: true, active: true } }, 201);
});
app.post("/plugins/upload", async (c) => {
  const denied = await requirePermission(c, defaultWorkspaceId, "plugin.install");
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
  await repo.ensureWorkspace(defaultWorkspaceId);
  if (assessment.requiresApproval) {
    const approval = await new ApprovalRequestRepository(c.env.CORE_DB).create({
      workspaceId: defaultWorkspaceId,
      kind: "plugin_install",
      subjectId: pluginInstallSubject(assessment.bundle),
      pluginId: assessment.bundle.manifest.id,
      risk: pluginInstallRisk(assessment),
      payload: pluginInstallApprovalPayload("upload", assessment),
      requestedBy: c.get("user")?.id,
    });
    await repo.audit(defaultWorkspaceId, "plugin.install.approval.requested", { approvalId: approval.id, pluginId: assessment.bundle.manifest.id, sha256: assessment.bundle.package.sha256, source: "zip", sensitiveCapabilities: assessment.sensitiveCapabilities }, c.get("user")?.id);
    return c.json({ status: "approval-required", approvalId: approval.id, pluginId: assessment.bundle.manifest.id, version: assessment.bundle.manifest.version, sha256: assessment.bundle.package.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  }
  const installed = await installAndProvisionPluginRuntime(c, { repo, workspaceId: defaultWorkspaceId, assessment, source: "zip", approvalId: null });
  if (!installed.ok) return c.json(errorResponse(failure("dependency_unavailable", installed.errorSafe, { retryable: true })), 502);
  await repo.audit(defaultWorkspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id, source: "zip", approvalId: null }, c.get("user")?.id);
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});
app.post("/plugins/install", async (c) => {
  const request = pluginInstallRequestSchema.parse(await c.req.json());
  const denied = await requirePermission(c, request.workspaceId, "plugin.install");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ApprovalRequestRepository(c.env.CORE_DB);
  let assessment: ReturnType<typeof assessPluginBundle>;
  let consumedApprovalId: string | undefined;
  if (request.approvalId) {
    const approved = await approvals.claimApproved({ workspaceId: request.workspaceId, approvalId: request.approvalId, kind: "plugin_install" });
    if (!approved) {
      await repo.audit(request.workspaceId, "plugin.install.approval.replay_or_missing", { approvalId: request.approvalId }, c.get("user")?.id);
      return c.json(errorResponse(failure("not_authorized", "A matching approved installation request is required.")), 403);
    }
    assessment = assessPluginBundle((approved.payload as { bundle?: unknown }).bundle);
    consumedApprovalId = approved.id;
    await repo.audit(request.workspaceId, "plugin.install.approval.consumed", { approvalId: approved.id, pluginId: assessment.bundle.manifest.id, sha256: assessment.bundle.package.sha256 }, c.get("user")?.id);
  } else {
    assessment = assessPluginBundle(request.bundle);
    if (assessment.requiresApproval) {
      await repo.ensureWorkspace(request.workspaceId);
      const approval = await approvals.create({
        workspaceId: request.workspaceId,
        kind: "plugin_install",
        subjectId: pluginInstallSubject(assessment.bundle),
        pluginId: assessment.bundle.manifest.id,
        risk: pluginInstallRisk(assessment),
        payload: pluginInstallApprovalPayload("direct", assessment),
        requestedBy: c.get("user")?.id,
      });
      await repo.audit(request.workspaceId, "plugin.install.approval.requested", { approvalId: approval.id, pluginId: assessment.bundle.manifest.id, sha256: assessment.bundle.package.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, c.get("user")?.id);
      return c.json({ status: "approval-required", approvalId: approval.id, pluginId: assessment.bundle.manifest.id, version: assessment.bundle.manifest.version, sha256: assessment.bundle.package.sha256, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
    }
  }
  const installed = await installAndProvisionPluginRuntime(c, { repo, workspaceId: request.workspaceId, assessment, source: "direct", approvalId: consumedApprovalId ?? null });
  if (!installed.ok) return c.json(errorResponse(failure("dependency_unavailable", installed.errorSafe, { retryable: true })), 502);
  await repo.audit(request.workspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id, approvalId: consumedApprovalId ?? null }, c.get("user")?.id);
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});
app.post("/plugins/activate", async (c) => { const request = pluginActivationRequestSchema.parse(await c.req.json()); const denied = await requirePermission(c, request.workspaceId, "plugin.activate"); if (denied) return denied; const repo = new CoreRepository(c.env.CORE_DB); if (!await repo.installedById(request.pluginId)) return c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404); const deployment = await repo.pluginRuntimeDeployment(request.workspaceId, request.pluginId); if (!deployment || !["deployed", "active", "disabled"].includes(deployment.runtimeStatus)) return c.json(errorResponse(failure("dependency_unavailable", "Plugin runtime deployment must be confirmed before activation.", { retryable: true })), 409); const state = await repo.activate(request.workspaceId, request.pluginId); return state ? c.json(state, 201) : c.json(errorResponse(failure("dependency_unavailable", "Plugin runtime deployment must be confirmed before activation.", { retryable: true })), 409); });
app.post("/plugins/deactivate", async (c) => { const request = pluginActivationRequestSchema.parse(await c.req.json()); const denied = await requirePermission(c, request.workspaceId, "plugin.activate"); if (denied) return denied; const state = await new CoreRepository(c.env.CORE_DB).deactivate(request.workspaceId, request.pluginId); return state ? c.json(state) : c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404); });
app.post("/plugins/grants", async (c) => { const request = capabilityGrantRequestSchema.parse(await c.req.json()); const denied = await requirePermission(c, request.workspaceId, "plugin.grantCapability"); if (denied) return denied; const repo = new CoreRepository(c.env.CORE_DB); if (!await repo.installedById(request.pluginId)) return c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404); const declared = new Set(await repo.declaredCapabilities(request.pluginId)); if (!request.capabilities.every((capability) => declared.has(capability))) return c.json(errorResponse(failure("validation_failed", "Capability is not declared by the plugin.")), 400); return c.json({ pluginId: request.pluginId, capabilities: await repo.grantCapabilities(request.workspaceId, request.pluginId, request.capabilities) }); });
app.post("/publications", async (c) => { const request = publicPublicationRequest(await c.req.json()); if (!request) return c.json(errorResponse(failure("validation_failed", "A valid public publication request is required.")), 400); const denied = await requirePermission(c, request.workspaceId, "publication.publish"); if (denied) return denied; const publication = await new CoreRepository(c.env.CORE_DB).publishWorkspaceContribution(request); return publication ? c.json({ publication }, 201) : c.json(errorResponse(failure("validation_failed", "The public contribution must be declared by an active installed plugin.")), 400); });
app.get("/workspaces/:workspaceId/tool-approvals", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "approval.read"); if (denied) return denied; return c.json({ approvals: await new ToolApprovalRepository(c.env.CORE_DB).listPending(c.req.param("workspaceId")) }); });
app.get("/workspaces/:workspaceId/approval-requests", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "approval.read"); if (denied) return denied; return c.json({ approvals: await new ApprovalRequestRepository(c.env.CORE_DB).listPending(c.req.param("workspaceId")) }); });
app.post("/approval-requests/:approvalId/decision", async (c) => {
  const request = approvalRequestDecisionRequestSchema.parse(await c.req.json());
  const denied = await requirePermission(c, request.workspaceId, "tool.approve");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const approval = await new ApprovalRequestRepository(c.env.CORE_DB).decide(request.workspaceId, c.req.param("approvalId"), request.decision, c.get("user")?.id, request.reason);
  if (!approval) return c.json(errorResponse(failure("conflict", "Approval is not pending.")), 409);
  await repo.audit(request.workspaceId, `approval.${request.decision}`, { approvalId: approval.id, kind: approval.kind, subjectId: approval.subjectId, pluginId: approval.pluginId }, c.get("user")?.id);
  return c.json({ approval });
});
app.get("/tool-approvals/:approvalId", async (c) => { const request = toolApprovalLookupRequestSchema.parse({ workspaceId: c.req.query("workspaceId"), approvalId: c.req.param("approvalId") }); const denied = await requirePermission(c, request.workspaceId, "approval.read"); if (denied) return denied; const approval = await new ToolApprovalRepository(c.env.CORE_DB).getForWorkspace(request.workspaceId, request.approvalId); return approval ? c.json({ approval }) : c.json(errorResponse(failure("not_found", "Approval is not available.")), 404); });
app.post("/tool-approvals/decision", async (c) => { const request = toolApprovalDecisionRequestSchema.parse(await c.req.json()); const denied = await requirePermission(c, request.workspaceId, "tool.approve"); if (denied) return denied; const approval = await new ToolApprovalRepository(c.env.CORE_DB).decide(request.workspaceId, request.approvalId, request.decision, c.get("user")?.id); if (!approval) return c.json(errorResponse(failure("conflict", "Approval is not pending.")), 409); await new CoreRepository(c.env.CORE_DB).audit(request.workspaceId, `tool.approval.${request.decision}`, { approvalId: approval.id, toolId: approval.toolId }, c.get("user")?.id); return c.json({ approval }); });
app.post("/tools/execute", async (c) => {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const request = toolExecutionRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ToolApprovalRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const owner = runtime.plugins.all().find((plugin) => plugin.contributes.tools.some((tool) => tool.id === request.toolId));
  const tool = runtime.tools.get(request.toolId);
  if (!owner || !tool) return c.json({ status: "denied", toolId: request.toolId, reason: "Tool not registered" }, 404);
  const membershipDenied = await requireAllPermissions(c, request.workspaceId, tool.permissions.length ? tool.permissions : ["tool.execute"]);
  if (membershipDenied) return membershipDenied;
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
  await runtime.events.emit("tool.executed", { workspaceId: request.workspaceId, toolId: tool.id, input: executionInput });
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
app.post("/runtime/ui/data", async (c) => {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const request = runtimeDataRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json({ status: "denied", data: null, error: "Contribution is not active in this workspace.", approvalId: null, auditEventId: null }, 403);
  const dataSource = resolved.page.dataSources.find((item) => item.id === request.dataSourceId);
  if (!dataSource) return c.json({ status: "denied", data: null, error: "Data source is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  const dataPermission = dataSource.access === "permission-gated" || resolved.page.access === "permission-gated" ? resolved.requiredPermission ?? "workspace.read" : "workspace.read";
  const denied = await requirePermission(c, request.workspaceId, dataPermission);
  if (denied) return denied;
  if (resolved.pluginId === "platform" && dataSource.id === "platform.settings.general.read") return c.json({ status: "ok", data: await repo.generalSettings(request.workspaceId), error: null, approvalId: null, auditEventId: null });
  if (resolved.pluginId === "platform" && dataSource.id === "platform.settings.domains.list") return c.json({ status: "ok", data: { rows: await repo.listDomains(request.workspaceId) }, error: null, approvalId: null, auditEventId: null });
  if (dataSource.kind === "static") return c.json({ status: "ok", data: staticDataFor(resolved.page.data, dataSource.id, dataSource.resource), error: null, approvalId: null, auditEventId: null });
  const deployment = await activeRuntimeOrAudit(repo, request.workspaceId, resolved.pluginId, "runtime.ui.data", c.get("user")?.id);
  if (!deployment) return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, { workspaceId: request.workspaceId, pluginId: resolved.pluginId, runtimeKey: deployment.runtimeKey, kind: "data", operationId: dataSource.resource ?? dataSource.id, contributionId: request.contributionId, routeParams: request.routeParams, queryParams: request.queryParams });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) return c.json({ status: "denied", data: null, error: "Plugin runtime rejected the data request.", approvalId: null, auditEventId: null }, runtimeResult.response.status === 404 ? 404 : 403);
    await repo.audit(request.workspaceId, "runtime.ui.data.execute", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id, dispatched: "plugin-runtime" }, c.get("user")?.id);
    return c.json({ status: "ok", data: runtimeResult.body, error: null, approvalId: null, auditEventId: null });
  }
  await repo.audit(request.workspaceId, "runtime.ui.data.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
});
app.post("/runtime/ui/actions", async (c) => {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const request = runtimeActionRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json({ status: "denied", data: null, error: "Contribution is not active in this workspace.", approvalId: null, auditEventId: null }, 403);
  const action = resolved.page.actions.find((item) => item.id === request.actionId);
  if (!action) return c.json({ status: "denied", data: null, error: "Action is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  const toolOwner = (await runtimeFor(repo)).plugins.all().find((plugin) => plugin.contributes.tools.some((tool) => tool.id === action.commandId));
  const tool = toolOwner?.contributes.tools.find((item) => item.id === action.commandId);
  const denied = await requireAllPermissions(c, request.workspaceId, tool?.permissions.length ? tool.permissions : ["workspace.read"]);
  if (denied) return denied;
  if (resolved.pluginId === "platform" && action.id === "platform.settings.general.save") {
    const data = await repo.saveGeneralSettings(request.workspaceId, request.input && typeof request.input === "object" ? request.input as Record<string, unknown> : {}, c.get("user")?.id);
    return c.json({ status: "ok", data, error: null, approvalId: null, auditEventId: null });
  }
  const approval = await maybeActionApproval(c, repo, action, request.workspaceId, resolved.pluginId, request.contributionId, request.input);
  if (approval) return c.json(approval, 202);
  const deployment = await activeRuntimeOrAudit(repo, request.workspaceId, resolved.pluginId, "runtime.ui.action", c.get("user")?.id);
  if (!deployment) return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, { workspaceId: request.workspaceId, pluginId: resolved.pluginId, runtimeKey: deployment.runtimeKey, kind: "action", operationId: action.commandId, contributionId: request.contributionId, input: request.input, routeParams: request.routeParams });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) return c.json({ status: "denied", data: null, error: "Plugin runtime rejected the operation.", approvalId: null, auditEventId: null }, runtimeResult.response.status === 404 ? 404 : 403);
    await repo.audit(request.workspaceId, "runtime.ui.action.execute", { pluginId: resolved.pluginId, contributionId: request.contributionId, actionId: action.id, commandId: action.commandId, dispatched: "plugin-runtime" }, c.get("user")?.id);
    return c.json({ status: "ok", data: runtimeResult.body, error: null, approvalId: null, auditEventId: null });
  }
  await repo.audit(request.workspaceId, "runtime.ui.action.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, actionId: action.id, commandId: action.commandId }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
});
app.post("/public/:workspaceId/runtime/data", async (c) => {
  const request = runtimeDataRequestSchema.parse({ ...await c.req.json(), workspaceId: c.req.param("workspaceId") });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.publicRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved?.policy?.enabled) return c.json({ status: "denied", data: null, error: "Publication is not available.", approvalId: null, auditEventId: null }, 404);
  if (resolved.policy.authenticationMode !== "anonymous" || resolved.policy.access === "authenticated") { const denied = requireRead(c); if (denied) return denied; }
  const dataSource = resolved.page.dataSources.find((item) => item.id === request.dataSourceId);
  if (!dataSource) return c.json({ status: "denied", data: null, error: "Data source is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  if (!resolved.policy.allowedOperations.includes(dataSource.id) && !resolved.policy.allowedOperations.includes(request.contributionId)) return c.json({ status: "denied", data: null, error: "Public policy does not allow this data source.", approvalId: null, auditEventId: null }, 403);
  if (dataSource.kind === "static") return c.json({ status: "ok", data: staticDataFor(resolved.page.data, dataSource.id, dataSource.resource), error: null, approvalId: null, auditEventId: null });
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
});
app.post("/public/:workspaceId/runtime/actions", async (c) => {
  const request = runtimeActionRequestSchema.parse({ ...await c.req.json(), workspaceId: c.req.param("workspaceId") });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.publicRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved?.policy?.enabled) return c.json({ status: "denied", data: null, error: "Publication is not available.", approvalId: null, auditEventId: null }, 404);
  if (resolved.policy.authenticationMode !== "anonymous" || resolved.policy.access === "authenticated") { const denied = requireRead(c); if (denied) return denied; }
  const action = resolved.page.actions.find((item) => item.id === request.actionId);
  if (!action) return c.json({ status: "denied", data: null, error: "Action is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  if (!resolved.policy.allowedOperations.includes(action.id) && !resolved.policy.allowedOperations.includes(action.commandId)) return c.json({ status: "denied", data: null, error: "Public policy does not allow this action.", approvalId: null, auditEventId: null }, 403);
  const approval = await maybeActionApproval(c, repo, action, request.workspaceId, resolved.pluginId, request.contributionId, request.input);
  if (approval) return c.json(approval, 202);
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
});
app.get("/workspaces/:workspaceId/settings/tabs", async (c) => {
  const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.settings.read");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const tabs = await repo.settingsTabs(c.req.param("workspaceId"));
  const permissions = new Set((await repo.memberSummary(c.req.param("workspaceId"), c.get("user"))).permissions);
  return c.json({ tabs: tabs.filter((tab) => tab.status === "active" && (!tab.requiredPermission || permissions.has(tab.requiredPermission) || permissions.has("workspace.admin"))) });
});
app.get("/workspaces/:workspaceId/settings/tabs/:tabId", async (c) => {
  const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.settings.read");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.settingsTab(c.req.param("workspaceId"), c.req.param("tabId"));
  if (resolved?.tab.requiredPermission) {
    const permissions = new Set((await repo.memberSummary(c.req.param("workspaceId"), c.get("user"))).permissions);
    if (!permissions.has(resolved.tab.requiredPermission) && !permissions.has("workspace.admin")) return c.json(errorResponse(failure("not_authorized", "Settings tab permission is required.")), 403);
  }
  return resolved ? c.json(resolved) : c.json(errorResponse(failure("not_found", "Settings tab is not available.")), 404);
});
app.post("/workspaces/:workspaceId/settings/tabs/order", async (c) => {
  const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.settings.write");
  if (denied) return denied;
  const body = await c.req.json() as { tabIds?: unknown };
  if (!Array.isArray(body.tabIds) || !body.tabIds.every((item) => typeof item === "string")) return c.json(errorResponse(failure("validation_failed", "tabIds must be a string array.")), 400);
  await new CoreRepository(c.env.CORE_DB).reorderSettingsTabs(c.req.param("workspaceId"), body.tabIds);
  return c.json({ saved: true });
});
app.post("/workspaces/:workspaceId/settings/runtime/data", async (c) => {
  const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.settings.read");
  if (denied) return denied;
  const request = runtimeDataRequestSchema.parse({ ...await c.req.json(), workspaceId: c.req.param("workspaceId") });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json({ status: "denied", data: null, error: "Contribution is not active in this workspace.", approvalId: null, auditEventId: null }, 403);
  const dataSource = resolved.page.dataSources.find((item) => item.id === request.dataSourceId);
  if (!dataSource) return c.json({ status: "denied", data: null, error: "Data source is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  const permissionDenied = await requirePermission(c, request.workspaceId, dataSource.access === "permission-gated" || resolved.page.access === "permission-gated" ? resolved.requiredPermission ?? "workspace.settings.read" : "workspace.settings.read");
  if (permissionDenied) return permissionDenied;
  if (dataSource.kind === "static") return c.json({ status: "ok", data: staticDataFor(resolved.page.data, dataSource.id, dataSource.resource), error: null, approvalId: null, auditEventId: null });
  const deployment = await activeRuntimeOrAudit(repo, request.workspaceId, resolved.pluginId, "settings.runtime.ui.data", c.get("user")?.id);
  if (!deployment) return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, { workspaceId: request.workspaceId, pluginId: resolved.pluginId, runtimeKey: deployment.runtimeKey, kind: "data", operationId: dataSource.resource ?? dataSource.id, contributionId: request.contributionId, routeParams: request.routeParams, queryParams: request.queryParams });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) return c.json({ status: "denied", data: null, error: "Plugin runtime rejected the data request.", approvalId: null, auditEventId: null }, runtimeResult.response.status === 404 ? 404 : 403);
    await repo.audit(request.workspaceId, "settings.runtime.ui.data.execute", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id, dispatched: "plugin-runtime" }, c.get("user")?.id);
    return c.json({ status: "ok", data: runtimeResult.body, error: null, approvalId: null, auditEventId: null });
  }
  await repo.audit(request.workspaceId, "settings.runtime.ui.data.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
});
app.post("/workspaces/:workspaceId/settings/runtime/actions", async (c) => {
  const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.settings.read");
  if (denied) return denied;
  const request = runtimeActionRequestSchema.parse({ ...await c.req.json(), workspaceId: c.req.param("workspaceId") });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json({ status: "denied", data: null, error: "Contribution is not active in this workspace.", approvalId: null, auditEventId: null }, 403);
  const action = resolved.page.actions.find((item) => item.id === request.actionId);
  if (!action) return c.json({ status: "denied", data: null, error: "Action is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  const runtime = await runtimeFor(repo);
  const toolOwner = runtime.plugins.all().find((plugin) => plugin.contributes.tools.some((tool) => tool.id === action.commandId));
  const tool = toolOwner?.contributes.tools.find((item) => item.id === action.commandId);
  const permissionDenied = await requireAllPermissions(c, request.workspaceId, tool?.permissions.length ? tool.permissions : [resolved.requiredPermission ?? "workspace.settings.write"]);
  if (permissionDenied) return permissionDenied;
  const approval = await maybeActionApproval(c, repo, action, request.workspaceId, resolved.pluginId, request.contributionId, request.input);
  if (approval) return c.json(approval, 202);
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
});
app.get("/workspaces/:workspaceId/settings/:scope", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "workspace.settings.read"); if (denied) return denied; const scope = settingScopeSchema.parse(c.req.param("scope")) as SettingScope; return c.json({ settings: await new CoreRepository(c.env.CORE_DB).listSettings(c.req.param("workspaceId"), scope) }); });
app.put("/settings", async (c) => { const request = settingWriteRequestSchema.parse(await c.req.json()); const denied = await requirePermission(c, request.workspaceId, "workspace.settings.write"); if (denied) return denied; await new CoreRepository(c.env.CORE_DB).setSetting(request.workspaceId, request.scope as SettingScope, request.key, request.value); return c.json({ saved: true }); });
app.get("/workspaces/:workspaceId/domains", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "domains.read"); if (denied) return denied; return c.json({ domains: await new CoreRepository(c.env.CORE_DB).listDomains(c.req.param("workspaceId")) }); });
app.post("/workspaces/:workspaceId/domains", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "domains.write"); if (denied) return denied; const input = domainInput(await c.req.json()); if (!input) return c.json(errorResponse(failure("validation_failed", "A valid hostname, kind and verification method are required.")), 400); return c.json({ domains: await new CoreRepository(c.env.CORE_DB).createDomain(c.req.param("workspaceId"), input, c.get("user")?.id) }, 201); });
app.put("/workspaces/:workspaceId/domains/:domainId", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "domains.write"); if (denied) return denied; const input = await c.req.json() as { status?: string; recoveryReason?: string }; if (input.status !== "draft" && input.status !== "verifying" && input.status !== "disabled") return c.json(errorResponse(failure("validation_failed", "Domains can only be moved to verified/active through verification endpoints.")), 400); return c.json({ domains: await new CoreRepository(c.env.CORE_DB).updateDomainStatus(c.req.param("workspaceId"), c.req.param("domainId"), input.status, c.get("user")?.id) }); });
app.post("/workspaces/:workspaceId/domains/:domainId/verify", async (c) => { const workspaceId = c.req.param("workspaceId"); const denied = await requirePermission(c, workspaceId, "domains.verify"); if (denied) return denied; const repo = new CoreRepository(c.env.CORE_DB); const domain = await repo.domain(workspaceId, c.req.param("domainId")); if (!domain) return c.json(errorResponse(failure("not_found", "Domain is not available.")), 404); const verified = await verifyDnsDomain(domain); if (!verified.ok) return c.json(errorResponse(failure("validation_failed", verified.error ?? "Domain verification failed.")), 400); await repo.audit(workspaceId, "domain.verify.dns", { domainId: domain.id, hostname: domain.hostname, method: domain.verificationMethod }, c.get("user")?.id); return c.json({ domains: await repo.updateDomainStatus(workspaceId, domain.id, "verified", c.get("user")?.id) }); });
app.post("/workspaces/:workspaceId/domains/:domainId/activate", async (c) => { const workspaceId = c.req.param("workspaceId"); const denied = await requirePermission(c, workspaceId, "domains.write"); if (denied) return denied; const repo = new CoreRepository(c.env.CORE_DB); const domain = await repo.domain(workspaceId, c.req.param("domainId")); if (!domain) return c.json(errorResponse(failure("not_found", "Domain is not available.")), 404); if (domain.status !== "verified" && domain.status !== "active") return c.json(errorResponse(failure("validation_failed", "Only verified domains can be activated.")), 400); return c.json({ domains: await repo.updateDomainStatus(workspaceId, domain.id, "active", c.get("user")?.id) }); });
app.post("/workspaces/:workspaceId/domains/:domainId/disable", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "domains.write"); if (denied) return denied; return c.json({ domains: await new CoreRepository(c.env.CORE_DB).updateDomainStatus(c.req.param("workspaceId"), c.req.param("domainId"), "disabled", c.get("user")?.id) }); });
app.get("/workspaces/:workspaceId/mail", async (c) => {
  const denied = await requirePermission(c, c.req.param("workspaceId"), "mail.read");
  if (denied) return denied;
  return c.json(await new CoreRepository(c.env.CORE_DB).mailSummary(c.req.param("workspaceId")));
});
app.post("/workspaces/:workspaceId/mail/providers", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "mail.configure");
  if (denied) return denied;
  const input = mailProviderConfigureSchema.parse(await c.req.json());
  if (input.kind === "mock-development-only" && c.env.ENVIRONMENT === "production") return c.json(errorResponse(failure("validation_failed", "Development-only mail providers are not available in production.")), 400);
  return c.json(await new CoreRepository(c.env.CORE_DB).configureMailProvider(workspaceId, input, c.get("user")?.id), 201);
});
app.post("/workspaces/:workspaceId/mail/providers/:providerId/activate", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "mail.configure");
  if (denied) return denied;
  return c.json(await new CoreRepository(c.env.CORE_DB).activateMailProvider(workspaceId, c.req.param("providerId"), c.get("user")?.id));
});
app.post("/workspaces/:workspaceId/mail/providers/:providerId/disable", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "mail.configure");
  if (denied) return denied;
  return c.json(await new CoreRepository(c.env.CORE_DB).disableMailProvider(workspaceId, c.req.param("providerId"), c.get("user")?.id));
});
app.post("/workspaces/:workspaceId/mail/providers/:providerId/test", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "mail.test");
  if (denied) return denied;
  const input = mailProviderTestRequestSchema.parse(await c.req.json());
  return c.json(await new CoreRepository(c.env.CORE_DB, c.env).testMailProvider(workspaceId, c.req.param("providerId"), input.to, c.get("user")?.id));
});
app.post("/internal/workspaces/:workspaceId/mail/send", async (c) => {
  if (!c.get("internal")) return c.json(errorResponse(failure("not_authorized", "Internal mail delivery requires a service binding.")), 403);
  const request = mailMessageRequestSchema.parse({ ...await c.req.json(), workspaceId: c.req.param("workspaceId") });
  return c.json(await new CoreRepository(c.env.CORE_DB, c.env).sendMail(request));
});
app.get("/workspaces/:workspaceId/auth/security-summary", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.read");
  if (denied) return denied;
  return c.json(await authAdminJson(c, `/admin/auth/security-summary?workspaceId=${encodeURIComponent(workspaceId)}`));
});
app.get("/workspaces/:workspaceId/auth/sessions/summary", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.session.read");
  if (denied) return denied;
  return c.json(await authAdminJson(c, `/admin/auth/sessions/summary?workspaceId=${encodeURIComponent(workspaceId)}`));
});
app.get("/workspaces/:workspaceId/auth/methods", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.read");
  if (denied) return denied;
  return c.json(await authAdminJson(c, `/admin/auth/methods?workspaceId=${encodeURIComponent(workspaceId)}`));
});
app.put("/workspaces/:workspaceId/auth/methods/:methodId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.method.publish");
  if (denied) return denied;
  const body = await c.req.json();
  const result = await authAdminJson(c, `/admin/auth/methods/${encodeURIComponent(c.req.param("methodId"))}`, { method: "PUT", body: JSON.stringify({ ...(body as Record<string, unknown>), workspaceId }) });
  await new CoreRepository(c.env.CORE_DB).audit(workspaceId, "auth.method.update", { methodId: c.req.param("methodId") }, c.get("user")?.id);
  return c.json(result);
});
app.get("/workspaces/:workspaceId/auth/policy", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.read");
  if (denied) return denied;
  return c.json(await authAdminJson(c, `/admin/auth/policy?workspaceId=${encodeURIComponent(workspaceId)}`));
});
app.put("/workspaces/:workspaceId/auth/policy", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.policy.write");
  if (denied) return denied;
  const body = await c.req.json();
  const repo = new CoreRepository(c.env.CORE_DB);
  if ((body as Record<string, unknown>).requireEmailVerification === true && !await repo.activeMailProvider(workspaceId)) return c.json(errorResponse(failure("dependency_unavailable", "Email verification requires an active Core Mail Runtime provider.")), 409);
  const result = await authAdminJson(c, "/admin/auth/policy", { method: "PUT", body: JSON.stringify({ ...(body as Record<string, unknown>), workspaceId, mailDeliveryAvailable: true }) });
  await repo.audit(workspaceId, "auth.policy.update", {}, c.get("user")?.id);
  return c.json(result);
});
app.get("/workspaces/:workspaceId/auth/ui-contributions", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.read");
  if (denied) return denied;
  return c.json(await authAdminJson(c, `/admin/auth/ui-contributions?workspaceId=${encodeURIComponent(workspaceId)}`));
});
app.put("/workspaces/:workspaceId/auth/ui-contributions/:contributionId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.ui.publish");
  if (denied) return denied;
  const body = await c.req.json();
  const result = await authAdminJson(c, `/admin/auth/ui-contributions/${encodeURIComponent(c.req.param("contributionId"))}`, { method: "PUT", body: JSON.stringify({ ...(body as Record<string, unknown>), workspaceId }) });
  await new CoreRepository(c.env.CORE_DB).audit(workspaceId, "auth.ui.update", { contributionId: c.req.param("contributionId") }, c.get("user")?.id);
  return c.json(result);
});
app.get("/workspaces/:workspaceId/layout", async (c) => { const denied = await requirePermission(c, c.req.param("workspaceId"), "layout.read"); if (denied) return denied; return c.json({ layout: (await new CoreRepository(c.env.CORE_DB).getLayout(c.req.param("workspaceId"))) ?? null }); });
app.put("/layouts", async (c) => { const request = layoutWriteRequestSchema.parse(await c.req.json()); const denied = await requirePermission(c, request.workspaceId, "layout.write"); if (denied) return denied; await new CoreRepository(c.env.CORE_DB).saveLayout(request.workspaceId, request.layout); return c.json({ saved: true, layout: request.layout }); });
export default app;
export type CoreApp = typeof app;
