import { Hono } from "hono";
import { providerConnectionOperationSchema, providerConnectionTestSchema } from "@v2/agent-contracts/provider-operations";
import type { ProviderContribution } from "@v2/plugin-contracts";
import type { AgentAiEnv } from "./env";

export function createProviderRoutes() {
  const routes = new Hono<{ Bindings: AgentAiEnv }>();
  async function available(env: AgentAiEnv, workspaceId: string, providerId: string) {
    const response = await env.CORE.fetch(`https://core.internal/runtime/providers?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (!response.ok) return false;
    const payload = await response.json() as { providers: ProviderContribution[] };
    return payload.providers.some((provider) => provider.id === providerId);
  }
  async function callProvider(env: AgentAiEnv, path: string, body?: string) {
    const url = `https://providers.internal${path}`;
    const response = body
      ? await env.PROVIDER_RUNTIME.fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        })
      : await env.PROVIDER_RUNTIME.fetch(url, { method: "POST" });
    const payload = await response.json().catch(() => ({ error: "Provider runtime returned an invalid response" }));
    return { ok: response.ok, payload };
  }
  routes.post("/:providerId/detect-models", async (c) => {
    const request = providerConnectionOperationSchema.parse(await c.req.json());
    const providerId = c.req.param("providerId");
    if (!await available(c.env, request.workspaceId, providerId)) return c.json({ error: "Provider not available in workspace" }, 404);
    const result = await callProvider(c.env, `/connections/${encodeURIComponent(request.connectionId)}/detect-models`);
    return result.ok ? c.json(result.payload) : c.json({ error: "Provider runtime rejected the operation" }, 502);
  });
  routes.post("/:providerId/test", async (c) => {
    const request = providerConnectionTestSchema.parse(await c.req.json());
    const providerId = c.req.param("providerId");
    if (!await available(c.env, request.workspaceId, providerId)) return c.json({ error: "Provider not available in workspace" }, 404);
    const result = await callProvider(c.env, `/connections/${encodeURIComponent(request.connectionId)}/test`, JSON.stringify({ modelId: request.modelId }));
    return result.ok ? c.json(result.payload) : c.json({ error: "Provider runtime rejected the operation" }, 502);
  });
  return routes;
}
