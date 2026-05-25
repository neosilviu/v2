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
  routes.post("/:providerId/detect-models", async (c) => {
    const request = providerConnectionOperationSchema.parse(await c.req.json());
    const providerId = c.req.param("providerId");
    if (!await available(c.env, request.workspaceId, providerId)) return c.json({ error: "Provider not available in workspace" }, 404);
    return c.env.PROVIDER_RUNTIME.fetch(`https://providers.internal/connections/${encodeURIComponent(request.connectionId)}/detect-models`, { method: "POST" });
  });
  routes.post("/:providerId/test", async (c) => {
    const request = providerConnectionTestSchema.parse(await c.req.json());
    const providerId = c.req.param("providerId");
    if (!await available(c.env, request.workspaceId, providerId)) return c.json({ error: "Provider not available in workspace" }, 404);
    return c.env.PROVIDER_RUNTIME.fetch(`https://providers.internal/connections/${encodeURIComponent(request.connectionId)}/test`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelId: request.modelId })
    });
  });
  return routes;
}
