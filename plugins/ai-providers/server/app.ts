import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { aiProvidersPlugin } from "../src/index";
import { detectProviderModels, testProvider, type ProviderRuntimeEnv } from "./adapters/runtime";
import { ProviderRepository } from "./repository";

type ProviderServiceEnv = ProviderRuntimeEnv & { PROVIDERS_DB?: D1Database };
const app = new Hono<{ Bindings: ProviderServiceEnv }>();
const catalog = new Map(aiProvidersPlugin.contributes.providers.map((provider) => [provider.id, provider]));
const providers = [...catalog.values()].map((provider) => ({ id: provider.id, title: provider.title }));
function noDatabase() { return errorResponse(failure("dependency_unavailable", "Provider connection storage is not configured.")); }

app.get("/health", (c) => c.json({ ok: true, service: "ai-providers", storageConfigured: Boolean(c.env.PROVIDERS_DB) }));
app.get("/providers", (c) => c.json({ providers }));
app.post("/connections/:connectionId/detect-models", async (c) => {
  if (!c.env.PROVIDERS_DB) return c.json(noDatabase(), 503);
  const connection = await new ProviderRepository(c.env.PROVIDERS_DB).get(c.req.param("connectionId"));
  if (!connection) return c.json(errorResponse(failure("not_found", "Provider connection is not available.")), 404);
  if (connection.status === "disabled") return c.json(errorResponse(failure("conflict", "Provider connection is disabled.")), 409);
  const provider = catalog.get(connection.providerId);
  if (!provider) return c.json(errorResponse(failure("not_found", "Provider definition is not available.")), 404);
  try {
    const models = await detectProviderModels(c.env, provider, {});
    await new ProviderRepository(c.env.PROVIDERS_DB).replaceModels(connection.id, models);
    return c.json({ models });
  } catch {
    return c.json(errorResponse(failure("dependency_unavailable", "Provider model discovery failed.")), 502);
  }
});
app.post("/connections/:connectionId/test", async (c) => {
  if (!c.env.PROVIDERS_DB) return c.json(noDatabase(), 503);
  const connection = await new ProviderRepository(c.env.PROVIDERS_DB).get(c.req.param("connectionId"));
  if (!connection) return c.json(errorResponse(failure("not_found", "Provider connection is not available.")), 404);
  const provider = catalog.get(connection.providerId);
  if (!provider) return c.json(errorResponse(failure("not_found", "Provider definition is not available.")), 404);
  const input = await c.req.json<{ modelId?: string }>();
  try { return c.json(await testProvider(c.env, provider, {}, input.modelId ?? connection.defaultModelId ?? undefined)); }
  catch { return c.json(errorResponse(failure("dependency_unavailable", "Provider connection test failed.")), 502); }
});
export default app;
