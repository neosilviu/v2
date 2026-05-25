import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { providerChatRequestSchema } from "@v2/provider-contracts";
import { aiProvidersPlugin } from "../src/index";
import { detectProviderModels, invokeProviderChat, testProvider, type ProviderRuntimeEnv } from "./adapters/runtime";
import { ProviderRepository } from "./repository";

type ProviderServiceEnv = ProviderRuntimeEnv & { PROVIDERS_DB?: D1Database };
const app = new Hono<{ Bindings: ProviderServiceEnv }>();
const catalog = new Map(aiProvidersPlugin.contributes.providers.map((provider) => [provider.id, provider]));
const providers = [...catalog.values()].map((provider) => ({ id: provider.id, title: provider.title }));
const unavailable = (message: string) => errorResponse(failure("dependency_unavailable", message));
const internal = (request: Request) => new URL(request.url).hostname === "providers.internal" && !request.headers.has("origin");
app.use("/connections/*", async (c, next) => internal(c.req.raw) ? next() : c.json(errorResponse(failure("not_authorized", "Provider operations require an internal runtime request.")), 403));
app.get("/health", (c) => c.json({ ok: true, service: "ai-providers", storageConfigured: Boolean(c.env.PROVIDERS_DB) }));
app.get("/providers", (c) => c.json({ providers }));
async function resolve(c: { env: ProviderServiceEnv; req: { param(name: string): string } }) {
  if (!c.env.PROVIDERS_DB) return { error: unavailable("Provider connection storage is not configured."), status: 503 as const };
  const connection = await new ProviderRepository(c.env.PROVIDERS_DB).get(c.req.param("connectionId"));
  if (!connection) return { error: errorResponse(failure("not_found", "Provider connection is not available.")), status: 404 as const };
  if (connection.status === "disabled") return { error: errorResponse(failure("conflict", "Provider connection is disabled.")), status: 409 as const };
  const provider = catalog.get(connection.providerId);
  if (!provider) return { error: errorResponse(failure("not_found", "Provider definition is not available.")), status: 404 as const };
  return { connection, provider };
}
app.post("/connections/:connectionId/detect-models", async (c) => { const resolved = await resolve(c); if ("error" in resolved) return c.json(resolved.error, resolved.status); try { const models = await detectProviderModels(c.env, resolved.provider, {}); await new ProviderRepository(c.env.PROVIDERS_DB!).replaceModels(resolved.connection.id, models); return c.json({ models }); } catch { return c.json(unavailable("Provider model discovery failed."), 502); } });
app.post("/connections/:connectionId/test", async (c) => { const resolved = await resolve(c); if ("error" in resolved) return c.json(resolved.error, resolved.status); const input = await c.req.json<{ modelId?: string }>(); try { return c.json(await testProvider(c.env, resolved.provider, {}, input.modelId ?? resolved.connection.defaultModelId ?? undefined)); } catch { return c.json(unavailable("Provider connection test failed."), 502); } });
app.post("/connections/:connectionId/chat", async (c) => { const resolved = await resolve(c); if ("error" in resolved) return c.json(resolved.error, resolved.status); const input = providerChatRequestSchema.parse(await c.req.json()); const modelId = input.modelId ?? resolved.connection.defaultModelId; if (!modelId) return c.json(errorResponse(failure("conflict", "No chat model is configured for this connection.")), 409); try { return c.json(await invokeProviderChat(c.env, resolved.provider, modelId, input.messages)); } catch { return c.json(unavailable("Provider chat execution is not available for this connection."), 502); } });
export default app;
