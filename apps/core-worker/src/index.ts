import { Hono } from "hono";
import { cors } from "hono/cors";
import { assessPluginBundle, unpackPluginZip } from "@v2/plugin-installer";
import { layoutWriteRequestSchema, pluginActivationRequestSchema, pluginInstallRequestSchema, settingScopeSchema, settingWriteRequestSchema, toolExecutionRequestSchema, type SettingScope, type WorkspaceLayout } from "@v2/rpc-contracts";
import { RuntimeKernel } from "@v2/runtime";
import { agentAiPlugin } from "@v2/plugin-agent-ai";
import { themeStudioPlugin } from "@v2/plugin-theme-studio";
import type { CoreEnv } from "./env";
import { CoreRepository } from "./repository";

const app = new Hono<{ Bindings: CoreEnv }>();
const runtime = new RuntimeKernel();
const builtIns = [agentAiPlugin, themeStudioPlugin];
const runtimeReady = Promise.all(builtIns.map((plugin) => runtime.registerPlugin(plugin)));

app.use("*", cors({ origin: "*" }));
app.use("*", async (c, next) => {
  await runtimeReady;
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.ensureWorkspace("default");
  await Promise.all(builtIns.map((plugin) => repo.installManifest(plugin)));
  await next();
});

app.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));
app.get("/runtime/plugins", (c) => c.json({ plugins: runtime.plugins.all() }));
app.get("/runtime/tools", (c) => c.json({ tools: runtime.tools.all() }));
app.get("/plugins/installed", async (c) => c.json({ plugins: await new CoreRepository(c.env.CORE_DB).installed() }));
app.get("/workspaces/:workspaceId/plugins", async (c) => c.json({ active: await new CoreRepository(c.env.CORE_DB).activePlugins(c.req.param("workspaceId")) }));

app.post("/plugins/upload", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip")) return c.json({ error: "A ZIP file is required" }, 400);
  if (file.size > 20 * 1024 * 1024) return c.json({ error: "Plugin package exceeds 20 MB" }, 413);
  const bytes = await file.arrayBuffer();
  const key = `packages/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
  const assessment = await unpackPluginZip(bytes, key);
  await c.env.PLUGIN_PACKAGES.put(key, bytes, { customMetadata: { pluginId: assessment.bundle.manifest.id, version: assessment.bundle.manifest.version, sha256: assessment.bundle.package.sha256 } });
  const repo = new CoreRepository(c.env.CORE_DB);
  if (assessment.requiresApproval) return c.json({ status: "approval-required", bundle: assessment.bundle, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.audit("default", "plugin.install", { pluginId: assessment.bundle.manifest.id, source: "zip" });
  await runtime.registerPlugin(assessment.bundle.manifest);
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});
app.post("/plugins/install", async (c) => {
  const request = pluginInstallRequestSchema.parse(await c.req.json());
  const assessment = assessPluginBundle(request.bundle);
  if (assessment.requiresApproval && !request.approved) return c.json({ status: "approval-required", sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.audit(request.workspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id });
  await runtime.registerPlugin(assessment.bundle.manifest);
  return c.json({ installed: assessment.bundle.manifest.id }, 201);
});
app.post("/plugins/activate", async (c) => {
  const request = pluginActivationRequestSchema.parse(await c.req.json());
  return c.json(await new CoreRepository(c.env.CORE_DB).activate(request.workspaceId, request.pluginId), 201);
});

app.post("/tools/execute", async (c) => {
  const request = toolExecutionRequestSchema.parse(await c.req.json());
  const tool = runtime.tools.get(request.toolId);
  if (!tool) return c.json({ status: "denied", toolId: request.toolId, reason: "Tool not registered" }, 404);
  const decision = runtime.canExecuteTool(tool.id, { permissions: new Set<string>(), approvedToolIds: request.approved ? new Set([tool.id]) : undefined });
  if (decision === "deny") return c.json({ status: "denied", toolId: tool.id, reason: "Permission not granted" }, 403);
  if (decision === "require-approval") return c.json({ status: "approval-required", toolId: tool.id, risk: tool.risk }, 202);
  await runtime.events.emit("tool.executed", { workspaceId: request.workspaceId, toolId: tool.id, input: request.input });
  await new CoreRepository(c.env.CORE_DB).audit(request.workspaceId, "tool.execute", { toolId: tool.id });
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
  const layout = await new CoreRepository(c.env.CORE_DB).getSetting(c.req.param("workspaceId"), "platform", "shell.layout");
  return c.json({ layout: (layout as WorkspaceLayout | undefined) ?? null });
});
app.put("/layouts", async (c) => {
  const request = layoutWriteRequestSchema.parse(await c.req.json());
  await new CoreRepository(c.env.CORE_DB).saveLayout(request.workspaceId, request.layout);
  return c.json({ saved: true, layout: request.layout });
});

export default app;
export type CoreApp = typeof app;
