import { Hono } from "hono";
import { pluginManifestSchema } from "@v2/plugin-contracts";
import { pluginActivationRequestSchema } from "@v2/rpc-contracts";
import { RuntimeKernel } from "@v2/runtime";
import { agentAiPlugin } from "@v2/plugin-agent-ai";
import { themeStudioPlugin } from "@v2/plugin-theme-studio";
import { PluginControlPlane } from "./plugin-control-plane";

const app = new Hono();
const runtime = new RuntimeKernel();
const controlPlane = new PluginControlPlane();
const ready = Promise.all([agentAiPlugin, themeStudioPlugin].map(async (plugin) => {
  controlPlane.install(plugin);
  await runtime.registerPlugin(plugin);
}));

app.use("*", async (_c, next) => { await ready; await next(); });
app.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));
app.get("/runtime/plugins", (c) => c.json({ plugins: runtime.plugins.all() }));
app.get("/runtime/tools", (c) => c.json({ tools: runtime.tools.all() }));
app.get("/plugins/installed", (c) => c.json({ plugins: controlPlane.installed() }));
app.post("/plugins/manifest", async (c) => {
  const manifest = pluginManifestSchema.parse(await c.req.json());
  controlPlane.install(manifest);
  await runtime.registerPlugin(manifest);
  return c.json({ installed: manifest.id }, 201);
});
app.post("/plugins/activate", async (c) => {
  const request = pluginActivationRequestSchema.parse(await c.req.json());
  return c.json(controlPlane.activate(request.workspaceId, request.pluginId), 201);
});

export default app;
export type CoreApp = typeof app;
