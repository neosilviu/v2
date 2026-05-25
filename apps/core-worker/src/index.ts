import { Hono } from "hono";
import { assessPluginBundle } from "@v2/plugin-installer";
import { layoutWriteRequestSchema, pluginActivationRequestSchema, pluginInstallRequestSchema, settingScopeSchema, settingWriteRequestSchema } from "@v2/rpc-contracts";
import { RuntimeKernel } from "@v2/runtime";
import { MemorySettingsStore, type SettingScope } from "@v2/settings-runtime";
import { agentAiPlugin } from "@v2/plugin-agent-ai";
import { themeStudioPlugin } from "@v2/plugin-theme-studio";
import { PluginControlPlane } from "./plugin-control-plane";

const app = new Hono();
const runtime = new RuntimeKernel();
const controlPlane = new PluginControlPlane();
const settings = new MemorySettingsStore();
const ready = Promise.all([agentAiPlugin, themeStudioPlugin].map(async (plugin) => {
  controlPlane.install(plugin);
  await runtime.registerPlugin(plugin);
}));

app.use("*", async (_c, next) => { await ready; await next(); });
app.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));
app.get("/runtime/plugins", (c) => c.json({ plugins: runtime.plugins.all() }));
app.get("/runtime/tools", (c) => c.json({ tools: runtime.tools.all() }));
app.get("/plugins/installed", (c) => c.json({ plugins: controlPlane.installed() }));
app.get("/workspaces/:workspaceId/plugins", (c) => c.json({ active: controlPlane.activeForWorkspace(c.req.param("workspaceId")) }));

app.post("/plugins/install", async (c) => {
  const request = pluginInstallRequestSchema.parse(await c.req.json());
  const assessment = assessPluginBundle(request.bundle);
  if (assessment.requiresApproval && !request.approved) {
    return c.json({ status: "approval-required", sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  }
  const manifest = controlPlane.installBundle(assessment);
  await runtime.registerPlugin(manifest);
  return c.json({ installed: manifest.id }, 201);
});
app.post("/plugins/activate", async (c) => {
  const request = pluginActivationRequestSchema.parse(await c.req.json());
  return c.json(controlPlane.activate(request.workspaceId, request.pluginId), 201);
});

app.get("/workspaces/:workspaceId/settings/:scope", async (c) => {
  const scope = settingScopeSchema.parse(c.req.param("scope")) as SettingScope;
  return c.json({ settings: await settings.list(c.req.param("workspaceId"), scope) });
});
app.put("/settings", async (c) => {
  const request = settingWriteRequestSchema.parse(await c.req.json());
  await settings.set({ workspaceId: request.workspaceId, scope: request.scope as SettingScope, key: request.key }, request.value);
  return c.json({ saved: true });
});
app.get("/workspaces/:workspaceId/layout", async (c) => c.json({ layout: await settings.get({ workspaceId: c.req.param("workspaceId"), scope: "platform", key: "shell.layout" }) ?? null }));
app.put("/layouts", async (c) => {
  const request = layoutWriteRequestSchema.parse(await c.req.json());
  await settings.set({ workspaceId: request.workspaceId, scope: "platform", key: "shell.layout" }, request.layout);
  return c.json({ saved: true, layout: request.layout });
});

export default app;
export type CoreApp = typeof app;
