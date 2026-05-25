import { Hono } from "hono";
import { aiProvidersPlugin } from "../src/index";
import { detectProviderModels, testProvider, type ProviderRuntimeEnv } from "./adapters/runtime";

const app = new Hono<{ Bindings: ProviderRuntimeEnv }>();
const catalog = new Map(aiProvidersPlugin.contributes.providers.map((provider) => [provider.id, provider]));
const providers = [...catalog.values()].map((provider) => ({ id: provider.id, title: provider.title }));

app.get("/health", (c) => c.json({ ok: true, service: "ai-providers" }));
app.get("/providers", (c) => c.json({ providers }));
app.post("/connections/:connectionId/detect-models", async (c) => {
  const provider = catalog.get(c.req.param("connectionId"));
  if (!provider) return c.json({ error: "Connection is not available" }, 404);
  return c.json({ models: await detectProviderModels(c.env, provider, {}) });
});
app.post("/connections/:connectionId/test", async (c) => {
  const provider = catalog.get(c.req.param("connectionId"));
  if (!provider) return c.json({ error: "Connection is not available" }, 404);
  const input = await c.req.json<{ modelId?: string }>();
  return c.json(await testProvider(c.env, provider, {}, input.modelId));
});

export default app;
