import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { PluginBundle, PublicContributionAccess } from "@v2/plugin-contracts";
import { assessPluginBundle, unpackPluginZip } from "@v2/plugin-installer";
import { approvalRequestDecisionRequestSchema, capabilityGrantRequestSchema, layoutWriteRequestSchema, pluginActivationRequestSchema, pluginInstallRequestSchema, settingScopeSchema, settingWriteRequestSchema, toolApprovalDecisionRequestSchema, toolApprovalLookupRequestSchema, toolExecutionRequestSchema, type SettingScope } from "@v2/rpc-contracts";
import { RuntimeKernel } from "@v2/runtime";
import { runtimeActionRequestSchema, runtimeDataRequestSchema, type ActionDefinition } from "@v2/ui-schema";
import { allowedOrigins, isInternalRequest, isPlatformAdmin, readSession, type CoreSessionUser } from "./access";
import { ApprovalRequestRepository } from "./approval-requests";
import type { CoreEnv } from "./env";
import { CoreRepository, type PublicationKind } from "./repository";
import { ToolApprovalRepository } from "./tool-approvals";

type CoreVariables = { user: CoreSessionUser | null; internal: boolean };
type CoreBindings = { Bindings: CoreEnv; Variables: CoreVariables };
type CoreContext = Context<CoreBindings>;
const app = new Hono<CoreBindings>();
const defaultWorkspaceId = "default";
app.use("*", cors({ origin: (origin, c) => allowedOrigins(c.env).includes(origin) ? origin : "", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "OPTIONS"], credentials: true, maxAge: 600 }));
app.use("*", async (c, next) => { const internal = isInternalRequest(c.req.raw); c.set("internal", internal); c.set("user", internal || c.req.path === "/health" ? null : await readSession(c.env, c.req.raw.headers)); await next(); });
app.onError((error, c) => { const validation = error instanceof Error && error.name === "ZodError"; return c.json(errorResponse(failure(validation ? "validation_failed" : "internal_error", validation ? "Request validation failed." : "An unexpected error occurred.")), validation ? 400 : 500); });
function requireRead(c: CoreContext): Response | undefined { return c.get("internal") || c.get("user") ? undefined : c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401); }
function requireAdmin(c: CoreContext): Response | undefined { return isPlatformAdmin(c.env, c.get("user")) ? undefined : c.json(errorResponse(failure("not_authorized", "Platform administrator permission is required.")), 403); }
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
app.get("/runtime/plugins", async (c) => { const denied = requireRead(c); if (denied) return denied; return c.json({ plugins: await new CoreRepository(c.env.CORE_DB).installed() }); });
app.get("/runtime/tools", async (c) => { const denied = requireRead(c); if (denied) return denied; const repo = new CoreRepository(c.env.CORE_DB); const runtime = await runtimeFor(repo); const active = new Set(await repo.activePlugins(c.req.query("workspaceId") ?? defaultWorkspaceId)); return c.json({ tools: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.tools) }); });
app.get("/runtime/providers", async (c) => { const denied = requireRead(c); if (denied) return denied; const repo = new CoreRepository(c.env.CORE_DB); const runtime = await runtimeFor(repo); const active = new Set(await repo.activePlugins(c.req.query("workspaceId") ?? defaultWorkspaceId)); return c.json({ providers: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.providers) }); });
app.get("/plugins/installed", async (c) => { const denied = requireRead(c); if (denied) return denied; return c.json({ plugins: await new CoreRepository(c.env.CORE_DB).installed() }); });
app.get("/workspaces/:workspaceId/plugins", async (c) => { const denied = requireRead(c); if (denied) return denied; return c.json({ active: await new CoreRepository(c.env.CORE_DB).activePlugins(c.req.param("workspaceId")) }); });
app.get("/workspaces/:workspaceId/ui/surfaces", async (c) => { const denied = requireRead(c); if (denied) return denied; return c.json({ surfaces: await new CoreRepository(c.env.CORE_DB).workspaceUiSurfaces(c.req.param("workspaceId")) }); });
app.get("/marketplace/plugins", async (c) => {
  const repo = new CoreRepository(c.env.CORE_DB);
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    const catalog = await repo.catalogPlugins();
    return c.json({ plugins: catalog.map((item) => ({ ...item, installed: false, active: false })) });
  }
  const denied = requireRead(c);
  if (denied) return denied;
  const workspacePlugins = await repo.workspacePlugins(workspaceId);
  const installed = new Set(workspacePlugins.map((plugin) => plugin.pluginId));
  const active = new Set(workspacePlugins.filter((plugin) => plugin.active).map((plugin) => plugin.pluginId));
  const catalog = await repo.catalogPlugins();
  return c.json({ plugins: catalog.map((item) => ({ ...item, installed: installed.has(item.manifest.id), active: active.has(item.manifest.id) })) });
});
app.post("/marketplace/plugins/:pluginId/releases", async (c) => {
  const denied = requireAdmin(c);
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
  const denied = requireAdmin(c);
  if (denied) return denied;
  const workspaceId = c.req.query("workspaceId") ?? defaultWorkspaceId;
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
  await repo.ensureWorkspace(workspaceId);
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.activate(workspaceId, assessment.bundle.manifest.id);
  await repo.audit(workspaceId, "marketplace.plugin.install", { pluginId: assessment.bundle.manifest.id, category: plugin.category, releaseId: release.id, approvalId: consumedApprovalId ?? null }, c.get("user")?.id);
  return c.json({ status: "installed", plugin: { ...plugin, manifest: assessment.bundle.manifest, installed: true, active: true } }, 201);
});
app.post("/plugins/upload", async (c) => {
  const denied = requireAdmin(c);
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
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.activate(defaultWorkspaceId, assessment.bundle.manifest.id);
  await repo.audit(defaultWorkspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id, source: "zip", approvalId: null }, c.get("user")?.id);
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});
app.post("/plugins/install", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const request = pluginInstallRequestSchema.parse(await c.req.json());
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
  await repo.ensureWorkspace(request.workspaceId);
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.activate(request.workspaceId, assessment.bundle.manifest.id);
  await repo.audit(request.workspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id, approvalId: consumedApprovalId ?? null }, c.get("user")?.id);
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});
app.post("/plugins/activate", async (c) => { const denied = requireAdmin(c); if (denied) return denied; const request = pluginActivationRequestSchema.parse(await c.req.json()); const state = await new CoreRepository(c.env.CORE_DB).activate(request.workspaceId, request.pluginId); return state ? c.json(state, 201) : c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404); });
app.post("/plugins/deactivate", async (c) => { const denied = requireAdmin(c); if (denied) return denied; const request = pluginActivationRequestSchema.parse(await c.req.json()); const state = await new CoreRepository(c.env.CORE_DB).deactivate(request.workspaceId, request.pluginId); return state ? c.json(state) : c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404); });
app.post("/plugins/grants", async (c) => { const denied = requireAdmin(c); if (denied) return denied; const request = capabilityGrantRequestSchema.parse(await c.req.json()); const repo = new CoreRepository(c.env.CORE_DB); if (!await repo.installedById(request.pluginId)) return c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404); const declared = new Set(await repo.declaredCapabilities(request.pluginId)); if (!request.capabilities.every((capability) => declared.has(capability))) return c.json(errorResponse(failure("validation_failed", "Capability is not declared by the plugin.")), 400); return c.json({ pluginId: request.pluginId, capabilities: await repo.grantCapabilities(request.workspaceId, request.pluginId, request.capabilities) }); });
app.post("/publications", async (c) => { const denied = requireAdmin(c); if (denied) return denied; const request = publicPublicationRequest(await c.req.json()); if (!request) return c.json(errorResponse(failure("validation_failed", "A valid public publication request is required.")), 400); const publication = await new CoreRepository(c.env.CORE_DB).publishWorkspaceContribution(request); return publication ? c.json({ publication }, 201) : c.json(errorResponse(failure("validation_failed", "The public contribution must be declared by an active installed plugin.")), 400); });
app.get("/workspaces/:workspaceId/tool-approvals", async (c) => { const denied = requireAdmin(c); if (denied) return denied; return c.json({ approvals: await new ToolApprovalRepository(c.env.CORE_DB).listPending(c.req.param("workspaceId")) }); });
app.get("/workspaces/:workspaceId/approval-requests", async (c) => { const denied = requireAdmin(c); if (denied) return denied; return c.json({ approvals: await new ApprovalRequestRepository(c.env.CORE_DB).listPending(c.req.param("workspaceId")) }); });
app.post("/approval-requests/:approvalId/decision", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const request = approvalRequestDecisionRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  const approval = await new ApprovalRequestRepository(c.env.CORE_DB).decide(request.workspaceId, c.req.param("approvalId"), request.decision, c.get("user")?.id, request.reason);
  if (!approval) return c.json(errorResponse(failure("conflict", "Approval is not pending.")), 409);
  await repo.audit(request.workspaceId, `approval.${request.decision}`, { approvalId: approval.id, kind: approval.kind, subjectId: approval.subjectId, pluginId: approval.pluginId }, c.get("user")?.id);
  return c.json({ approval });
});
app.get("/tool-approvals/:approvalId", async (c) => { const denied = c.get("internal") ? undefined : requireAdmin(c); if (denied) return denied; const request = toolApprovalLookupRequestSchema.parse({ workspaceId: c.req.query("workspaceId"), approvalId: c.req.param("approvalId") }); const approval = await new ToolApprovalRepository(c.env.CORE_DB).getForWorkspace(request.workspaceId, request.approvalId); return approval ? c.json({ approval }) : c.json(errorResponse(failure("not_found", "Approval is not available.")), 404); });
app.post("/tool-approvals/decision", async (c) => { const denied = requireAdmin(c); if (denied) return denied; const request = toolApprovalDecisionRequestSchema.parse(await c.req.json()); const approval = await new ToolApprovalRepository(c.env.CORE_DB).decide(request.workspaceId, request.approvalId, request.decision, c.get("user")?.id); if (!approval) return c.json(errorResponse(failure("conflict", "Approval is not pending.")), 409); await new CoreRepository(c.env.CORE_DB).audit(request.workspaceId, `tool.approval.${request.decision}`, { approvalId: approval.id, toolId: approval.toolId }, c.get("user")?.id); return c.json({ approval }); });
app.post("/tools/execute", async (c) => { const denied = requireRead(c); if (denied) return denied; const request = toolExecutionRequestSchema.parse(await c.req.json()); const repo = new CoreRepository(c.env.CORE_DB); const approvals = new ToolApprovalRepository(c.env.CORE_DB); const runtime = await runtimeFor(repo); const owner = runtime.plugins.all().find((plugin) => plugin.contributes.tools.some((tool) => tool.id === request.toolId)); const tool = runtime.tools.get(request.toolId); if (!owner || !tool) return c.json({ status: "denied", toolId: request.toolId, reason: "Tool not registered" }, 404); const active = new Set(await repo.activePlugins(request.workspaceId)); if (!active.has(owner.id)) return c.json({ status: "denied", toolId: tool.id, reason: "Plugin is not active in workspace" }, 403); const permissions = new Set(await repo.grantedCapabilities(request.workspaceId, owner.id)); const initialDecision = runtime.canExecuteTool(tool.id, { permissions }); if (initialDecision === "deny") return c.json({ status: "denied", toolId: tool.id, reason: "Capability has not been granted" }, 403); let executionInput = request.input; let consumedApprovalId: string | undefined; if (initialDecision === "require-approval") { if (!request.approvalId) { const approval = await approvals.create(request.workspaceId, owner.id, tool.id, tool.risk, request.input, c.get("user")?.id); await repo.audit(request.workspaceId, "tool.approval.requested", { approvalId: approval.id, toolId: tool.id, pluginId: owner.id }, c.get("user")?.id); return c.json({ status: "approval-required", toolId: tool.id, risk: tool.risk, approvalId: approval.id }, 202); } const approved = await approvals.approvedInput(request.workspaceId, request.approvalId, owner.id, tool.id); if (!approved) return c.json({ status: "denied", toolId: tool.id, reason: "Approval is missing, expired or already consumed" }, 403); executionInput = approved.input; consumedApprovalId = approved.approval.id; } await runtime.events.emit("tool.executed", { workspaceId: request.workspaceId, toolId: tool.id, input: executionInput }); if (consumedApprovalId) await approvals.consume(consumedApprovalId); await repo.audit(request.workspaceId, "tool.execute", { toolId: tool.id, pluginId: owner.id, approvalId: consumedApprovalId ?? null }, c.get("user")?.id); return c.json({ status: "executed", toolId: tool.id, ...(consumedApprovalId ? { approvalId: consumedApprovalId } : {}), result: { accepted: true } }); });
app.post("/runtime/ui/data", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const request = runtimeDataRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json({ status: "denied", data: null, error: "Contribution is not active in this workspace.", approvalId: null, auditEventId: null }, 403);
  const dataSource = resolved.page.dataSources.find((item) => item.id === request.dataSourceId);
  if (!dataSource) return c.json({ status: "denied", data: null, error: "Data source is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  if (dataSource.kind === "static") return c.json({ status: "ok", data: staticDataFor(resolved.page.data, dataSource.id, dataSource.resource), error: null, approvalId: null, auditEventId: null });
  await repo.audit(request.workspaceId, "runtime.ui.data.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
});
app.post("/runtime/ui/actions", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const request = runtimeActionRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json({ status: "denied", data: null, error: "Contribution is not active in this workspace.", approvalId: null, auditEventId: null }, 403);
  const action = resolved.page.actions.find((item) => item.id === request.actionId);
  if (!action) return c.json({ status: "denied", data: null, error: "Action is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  const approval = await maybeActionApproval(c, repo, action, request.workspaceId, resolved.pluginId, request.contributionId, request.input);
  if (approval) return c.json(approval, 202);
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
  await repo.audit(request.workspaceId, "public.runtime.ui.action.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, actionId: action.id, commandId: action.commandId }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
});
app.get("/workspaces/:workspaceId/settings/tabs", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const tabs = await repo.settingsTabs(c.req.param("workspaceId"));
  return c.json({ tabs: tabs.filter((tab) => tab.status === "active") });
});
app.get("/workspaces/:workspaceId/settings/tabs/:tabId", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const resolved = await new CoreRepository(c.env.CORE_DB).settingsTab(c.req.param("workspaceId"), c.req.param("tabId"));
  return resolved ? c.json(resolved) : c.json(errorResponse(failure("not_found", "Settings tab is not available.")), 404);
});
app.post("/workspaces/:workspaceId/settings/tabs/order", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const body = await c.req.json() as { tabIds?: unknown };
  if (!Array.isArray(body.tabIds) || !body.tabIds.every((item) => typeof item === "string")) return c.json(errorResponse(failure("validation_failed", "tabIds must be a string array.")), 400);
  await new CoreRepository(c.env.CORE_DB).reorderSettingsTabs(c.req.param("workspaceId"), body.tabIds);
  return c.json({ saved: true });
});
app.post("/workspaces/:workspaceId/settings/runtime/data", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const request = runtimeDataRequestSchema.parse({ ...await c.req.json(), workspaceId: c.req.param("workspaceId") });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json({ status: "denied", data: null, error: "Contribution is not active in this workspace.", approvalId: null, auditEventId: null }, 403);
  const dataSource = resolved.page.dataSources.find((item) => item.id === request.dataSourceId);
  if (!dataSource) return c.json({ status: "denied", data: null, error: "Data source is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  if (dataSource.kind === "static") return c.json({ status: "ok", data: staticDataFor(resolved.page.data, dataSource.id, dataSource.resource), error: null, approvalId: null, auditEventId: null });
  await repo.audit(request.workspaceId, "settings.runtime.ui.data.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, dataSourceId: dataSource.id }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
});
app.post("/workspaces/:workspaceId/settings/runtime/actions", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const request = runtimeActionRequestSchema.parse({ ...await c.req.json(), workspaceId: c.req.param("workspaceId") });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.privateRuntimeContribution(request.workspaceId, request.contributionId);
  if (!resolved) return c.json({ status: "denied", data: null, error: "Contribution is not active in this workspace.", approvalId: null, auditEventId: null }, 403);
  const action = resolved.page.actions.find((item) => item.id === request.actionId);
  if (!action) return c.json({ status: "denied", data: null, error: "Action is not declared by this contribution.", approvalId: null, auditEventId: null }, 403);
  const approval = await maybeActionApproval(c, repo, action, request.workspaceId, resolved.pluginId, request.contributionId, request.input);
  if (approval) return c.json(approval, 202);
  await repo.audit(request.workspaceId, "settings.runtime.ui.action.unavailable", { pluginId: resolved.pluginId, contributionId: request.contributionId, actionId: action.id, commandId: action.commandId }, c.get("user")?.id);
  return c.json(runtimeUnavailable(), 501);
});
app.get("/workspaces/:workspaceId/settings/:scope", async (c) => { const denied = requireRead(c); if (denied) return denied; const scope = settingScopeSchema.parse(c.req.param("scope")) as SettingScope; return c.json({ settings: await new CoreRepository(c.env.CORE_DB).listSettings(c.req.param("workspaceId"), scope) }); });
app.put("/settings", async (c) => { const denied = requireAdmin(c); if (denied) return denied; const request = settingWriteRequestSchema.parse(await c.req.json()); await new CoreRepository(c.env.CORE_DB).setSetting(request.workspaceId, request.scope as SettingScope, request.key, request.value); return c.json({ saved: true }); });
app.get("/workspaces/:workspaceId/layout", async (c) => { const denied = requireRead(c); if (denied) return denied; return c.json({ layout: (await new CoreRepository(c.env.CORE_DB).getLayout(c.req.param("workspaceId"))) ?? null }); });
app.put("/layouts", async (c) => { const denied = requireAdmin(c); if (denied) return denied; const request = layoutWriteRequestSchema.parse(await c.req.json()); await new CoreRepository(c.env.CORE_DB).saveLayout(request.workspaceId, request.layout); return c.json({ saved: true, layout: request.layout }); });
export default app;
export type CoreApp = typeof app;
