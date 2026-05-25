import { Hono } from "hono";
import { cors } from "hono/cors";
import { capabilityGrantRequestSchema, layoutWriteRequestSchema, pluginActivationRequestSchema, pluginInstallRequestSchema, settingScopeSchema, settingWriteRequestSchema, toolExecutionRequestSchema, type SettingScope, type WorkspaceLayout } from "@v2/rpc-contracts";
import { RuntimeKernel } from "@v2/runtime";
import type { CoreEnv } from "./env";
import { assessPluginBundle, unpackPluginZip } from "./plugin-package";
import { CoreRepository } from "./repository";

const app = new Hono<{ Bindings: CoreEnv }>();
const defaultWorkspaceId = "default";

app.use("*", cors({ origin: "*" }));

function jsonError(c: { json: (body: unknown, status?: number) => Response }, code: string, message: string, status: number, details?: Record<string, unknown>) {
  return c.json({ error: { code, message, ...(details ? { details } : {}) } }, status);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function hydrateRuntime(repo: CoreRepository): Promise<RuntimeKernel> {
  const runtime = new RuntimeKernel();
  for (const manifest of await repo.installed()) await runtime.registerPlugin(manifest);
  return runtime;
}

async function activePluginIds(repo: CoreRepository, workspaceId: string) {
  return new Set(await repo.activePlugins(workspaceId));
}

app.onError((error, c) => {
  const issues = "issues" in error && Array.isArray(error.issues) ? { issues: error.issues } : undefined;
  if (issues) return jsonError(c, "validation_failed", "Request validation failed", 400, issues);
  return jsonError(c, "internal_error", "Internal server error", 500);
});

app.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));
app.get("/runtime/plugins", async (c) => {
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.ensureWorkspace(defaultWorkspaceId);
  return c.json({ plugins: await repo.installed() });
});
app.get("/runtime/tools", async (c) => {
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.ensureWorkspace(defaultWorkspaceId);
  const runtime = await hydrateRuntime(repo);
  const active = await activePluginIds(repo, c.req.query("workspaceId") ?? defaultWorkspaceId);
  return c.json({ tools: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.tools) });
});
app.get("/runtime/providers", async (c) => {
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.ensureWorkspace(defaultWorkspaceId);
  const runtime = await hydrateRuntime(repo);
  const active = await activePluginIds(repo, c.req.query("workspaceId") ?? defaultWorkspaceId);
  return c.json({ providers: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.providers) });
});
app.get("/plugins/installed", async (c) => c.json({ plugins: await new CoreRepository(c.env.CORE_DB).installed() }));
app.get("/workspaces/:workspaceId/plugins", async (c) => c.json({ active: await new CoreRepository(c.env.CORE_DB).activePlugins(c.req.param("workspaceId")) }));

app.post("/plugins/upload", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip")) return c.json({ error: "A ZIP file is required" }, 400);
  if (file.size > 20 * 1024 * 1024) return c.json({ error: "Plugin package exceeds 20 MB" }, 413);
  const bytes = await file.arrayBuffer();
  const key = `packages/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
  let assessment;
  try {
    assessment = await unpackPluginZip(bytes, key);
  } catch (error) {
    return jsonError(c, "validation_failed", errorMessage(error), 400);
  }
  await c.env.PLUGIN_PACKAGES.put(key, bytes, { customMetadata: { pluginId: assessment.bundle.manifest.id, version: assessment.bundle.manifest.version, sha256: assessment.bundle.package.sha256 } });
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.ensureWorkspace(defaultWorkspaceId);
  if (assessment.requiresApproval) {
    await repo.audit(defaultWorkspaceId, "plugin.install.approval_required", { pluginId: assessment.bundle.manifest.id, sensitiveCapabilities: assessment.sensitiveCapabilities });
    return c.json({ status: "approval-required", bundle: assessment.bundle, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  }
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.activate(defaultWorkspaceId, assessment.bundle.manifest.id);
  await repo.audit(defaultWorkspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id, source: "zip" });
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});
app.post("/plugins/install", async (c) => {
  const request = pluginInstallRequestSchema.parse(await c.req.json());
  let assessment;
  try {
    assessment = assessPluginBundle(request.bundle);
  } catch (error) {
    return jsonError(c, "validation_failed", errorMessage(error), 400);
  }
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.ensureWorkspace(request.workspaceId);
  if (assessment.requiresApproval && !request.approved) {
    await repo.audit(request.workspaceId, "plugin.install.approval_required", { pluginId: assessment.bundle.manifest.id, sensitiveCapabilities: assessment.sensitiveCapabilities });
    return c.json({ status: "approval-required", bundle: assessment.bundle, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  }
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.activate(request.workspaceId, assessment.bundle.manifest.id);
  await repo.audit(request.workspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id });
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});
app.post("/plugins/activate", async (c) => {
  const request = pluginActivationRequestSchema.parse(await c.req.json());
  const result = await new CoreRepository(c.env.CORE_DB).activate(request.workspaceId, request.pluginId);
  if (!result) return jsonError(c, "not_found", "Plugin is not installed", 404);
  return c.json(result, 201);
});
app.post("/plugins/deactivate", async (c) => {
  const request = pluginActivationRequestSchema.parse(await c.req.json());
  const result = await new CoreRepository(c.env.CORE_DB).deactivate(request.workspaceId, request.pluginId);
  if (!result) return jsonError(c, "not_found", "Plugin is not installed", 404);
  return c.json(result);
});
app.post("/plugins/grants", async (c) => {
  const request = capabilityGrantRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  if (!await repo.installedById(request.pluginId)) return jsonError(c, "not_found", "Plugin is not installed", 404);
  const declared = new Set(await repo.declaredCapabilities(request.pluginId));
  if (!request.capabilities.every((capability) => declared.has(capability))) return jsonError(c, "validation_failed", "Capability not declared by plugin", 400);
  return c.json({ pluginId: request.pluginId, capabilities: await repo.grantCapabilities(request.workspaceId, request.pluginId, request.capabilities) });
});
app.post("/tools/execute", async (c) => {
  const request = toolExecutionRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  const runtime = await hydrateRuntime(repo);
  const owner = runtime.plugins.all().find((plugin) => plugin.contributes.tools.some((tool) => tool.id === request.toolId));
  const tool = runtime.tools.get(request.toolId);
  if (!owner || !tool) return c.json({ status: "denied", toolId: request.toolId, reason: "Tool not registered" }, 404);
  const active = await activePluginIds(repo, request.workspaceId);
  if (!active.has(owner.id)) {
    await repo.audit(request.workspaceId, "tool.denied", { toolId: tool.id, pluginId: owner.id, reason: "plugin_inactive" });
    return c.json({ status: "denied", toolId: tool.id, reason: "Plugin is not active in workspace" }, 403);
  }
  const permissions = new Set(await repo.grantedCapabilities(request.workspaceId, owner.id));
  const decision = runtime.canExecuteTool(tool.id, request.approved ? { permissions, approvedToolIds: new Set([tool.id]) } : { permissions });
  if (decision === "deny") {
    await repo.audit(request.workspaceId, "tool.denied", { toolId: tool.id, pluginId: owner.id, reason: "capability_not_granted" });
    return c.json({ status: "denied", toolId: tool.id, reason: "Capability has not been granted" }, 403);
  }
  if (decision === "require-approval") {
    await repo.audit(request.workspaceId, "tool.approval_required", { toolId: tool.id, pluginId: owner.id, risk: tool.risk });
    return c.json({ status: "approval-required", toolId: tool.id, risk: tool.risk }, 202);
  }
  await runtime.events.emit("tool.executed", { workspaceId: request.workspaceId, toolId: tool.id, input: request.input });
  await repo.audit(request.workspaceId, "tool.execute", { toolId: tool.id, pluginId: owner.id });
  return c.json({ status: "executed", toolId: tool.id, result: { accepted: true } });
});
app.get("/workspaces/:workspaceId/settings/:scope", async (c) => {
  const scope = settingScopeSchema.parse(c.req.param("scope")) as SettingScope;
  return c.json({ settings: await new CoreRepository(c.env.CORE_DB).listSettings(c.req.param("workspaceId"), scope) });
});
app.put("/settings", async (c) => {
  const request = settingWriteRequestSchema.parse(await c.req.json());
  await new CoreRepository(c.env.CORE_DB).setSetting(request.workspaceId, request.scope as SettingScope, request.key, request.value);
  return c.json({ saved: true });
});
app.get("/workspaces/:workspaceId/layout", async (c) => {
  const layout = await new CoreRepository(c.env.CORE_DB).getLayout(c.req.param("workspaceId"));
  return c.json({ layout: (layout as WorkspaceLayout | undefined) ?? null });
});
app.put("/layouts", async (c) => {
  const request = layoutWriteRequestSchema.parse(await c.req.json());
  await new CoreRepository(c.env.CORE_DB).saveLayout(request.workspaceId, request.layout);
  return c.json({ saved: true, layout: request.layout });
});
export default app;
export type CoreApp = typeof app;
