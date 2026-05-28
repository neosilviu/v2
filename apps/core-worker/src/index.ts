import { Hono, type Context } from "hono";
import { z } from "zod";
import type { WorkspaceLayout } from "@v2/rpc-contracts";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { mailProviderConfigureSchema } from "@v2/mail-contracts";
import { runtimeActionRequestSchema, runtimeDataRequestSchema } from "@v2/ui-schema";
import { CoreRepository, type WorkspacePermission } from "./repository";
import type { CoreEnv } from "./env";

const coreApiRoutes = new Hono<{ Bindings: CoreEnv; Variables: { user: { id: string; email: string; name?: string | null; impersonatedBy?: string | null } | null } }>();
type CoreContext = Context<{ Bindings: CoreEnv; Variables: { user: { id: string; email: string; name?: string | null; impersonatedBy?: string | null } | null } }>;
const readResponseCache = new Map<string, { expiresAt: number; response: Response }>();
const sessionAssertionCache = new Map<string, { expiresAt: number; user: { id: string; email: string; name?: string | null; impersonatedBy?: string | null } | null }>();

function isPlatformAdmin(env: CoreEnv, user: { email: string } | null | undefined) {
  const admins = new Set((env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  return Boolean(user && admins.has(user.email.toLowerCase()));
}

function requestCredentialKey(c: CoreContext) {
  return c.req.header("authorization") ?? c.req.header("cookie") ?? "";
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

coreApiRoutes.use("*", async (c, next) => {
  const user = await resolveSession(c);
  c.set("user", user);
  if (needsAuthentication(c.req.path) && !user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  await next();
});

function requireRead(c: CoreContext) {
  if (!c.get("user")) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  return null;
}

async function requirePermission(c: CoreContext, workspaceId: string, permission: WorkspacePermission) {
  const user = c.get("user");
  if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  if (isPlatformAdmin(c.env, user)) return null;
  if (!await new CoreRepository(c.env.CORE_DB).hasPermission(workspaceId, user, permission)) return c.json(errorResponse(failure("not_authorized", `${permission} permission is required.`)), 403);
  return null;
}

async function authAdminJson<T>(c: CoreContext, path: string, init?: { method?: string; body?: string }): Promise<T> {
  const headers = new Headers();
  const cookie = c.req.header("cookie");
  const authorization = c.req.header("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await c.env.AUTH.fetch(`https://auth.internal${path}`, { method: init?.method, body: init?.body, headers });
  if (!response.ok) throw new Error(`Auth administration failed: ${response.status}`);
  return response.json() as Promise<T>;
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
function pluginOperationEnvelope(status: "ok" | "denied" | "approval-required" | "unavailable", data: unknown = null, error: string | null = null, approvalId: string | null = null, auditEventId: string | null = null) {
  return { status, data, error, approvalId, auditEventId };
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
  const denied = await requirePermission(c, request.workspaceId, operation.permission as WorkspacePermission);
  if (denied) return denied;
  const active = await repo.activePluginRuntime(request.workspaceId, request.pluginId);
  if (!active) return c.json(pluginOperationEnvelope("unavailable", null, "Plugin runtime is not active."), 503);
  return c.json(pluginOperationEnvelope("unavailable", null, "Plugin runtime dispatch is unavailable."), 503);
}

coreApiRoutes.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));
coreApiRoutes.get("/session", (c) => { const user = c.get("user"); return c.json({ authenticated: Boolean(user), impersonated: Boolean(user?.impersonatedBy), isAdmin: isPlatformAdmin(c.env, user), user: user ? { id: user.id, email: user.email, name: user.name ?? null } : null }); });
coreApiRoutes.post("/workspaces/:workspaceId/settings/runtime/data", async (c) => { const workspaceId = c.req.param("workspaceId"); const parsed = runtimeDataRequestSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success || parsed.data.workspaceId !== workspaceId) return c.json(errorResponse(failure("validation_failed", "Valid settings runtime data input is required.")), 400); const result = await platformSettingsData(c, new CoreRepository(c.env.CORE_DB), workspaceId, parsed.data.dataSourceId); return result ?? c.json(errorResponse(failure("not_found", "Settings data source is not available.")), 404); });
coreApiRoutes.post("/workspaces/:workspaceId/settings/runtime/actions", async (c) => { const workspaceId = c.req.param("workspaceId"); const parsed = runtimeActionRequestSchema.safeParse(await c.req.json().catch(() => null)); if (!parsed.success || parsed.data.workspaceId !== workspaceId) return c.json(errorResponse(failure("validation_failed", "Valid settings runtime action input is required.")), 400); const result = await platformSettingsAction(c, new CoreRepository(c.env.CORE_DB), workspaceId, parsed.data.actionId, parsed.data.input); return result ?? c.json(errorResponse(failure("not_found", "Settings action is not available.")), 404); });

export type CoreApi = typeof coreApiRoutes;
export default coreApiRoutes;
