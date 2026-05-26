import { Hono } from "hono";
import { providerConnectionOperationSchema, providerConnectionTestSchema } from "@v2/agent-contracts/provider-operations";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { ProviderContribution } from "@v2/plugin-contracts";
import type { ProviderConnection } from "@v2/provider-contracts";
import type { AgentAiEnv } from "./env";
export function createProviderRoutes() {
  const routes = new Hono<{ Bindings: AgentAiEnv }>();
  async function available(env: AgentAiEnv, workspaceId: string, providerId: string) { const response = await env.CORE.fetch(`https://core.internal/runtime/providers?workspaceId=${encodeURIComponent(workspaceId)}`); if (!response.ok) return false; const payload = await response.json() as { providers: ProviderContribution[] }; return payload.providers.some((provider) => provider.id === providerId); }
  async function executeProviderTool(env: AgentAiEnv, workspaceId: string, toolId: string, input: unknown) {
    const response = await env.CORE.fetch("https://core.internal/tools/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, toolId, input }) });
    const payload = await response.json().catch(() => errorResponse(failure("dependency_unavailable", "Provider runtime returned an invalid response.", { retryable: true })));
    return { ok: response.ok, payload: payload as { status?: string; result?: unknown } };
  }
  routes.get("/connections", async (c) => {
    const workspaceId = c.req.query("workspaceId") ?? "default";
    const result = await executeProviderTool(c.env, workspaceId, "providers.listConnections", {});
    if (!result.ok || result.payload.status !== "executed") return c.json(errorResponse(failure("dependency_unavailable", "Provider connections are not available.")), 502);
    return c.json(result.payload.result as { connections: ProviderConnection[] });
  });
  routes.post("/:providerId/detect-models", async (c) => { const request = providerConnectionOperationSchema.parse(await c.req.json()); const providerId = c.req.param("providerId"); if (!await available(c.env, request.workspaceId, providerId)) return c.json(errorResponse(failure("not_found", "Provider is not available in this workspace.")), 404); const result = await executeProviderTool(c.env, request.workspaceId, "providers.detectModels", { connectionId: request.connectionId }); return result.ok && result.payload.status === "executed" ? c.json(result.payload.result) : c.json(errorResponse(failure("dependency_unavailable", "Provider runtime rejected the operation.", { retryable: true })), 502); });
  routes.post("/:providerId/test", async (c) => { const request = providerConnectionTestSchema.parse(await c.req.json()); const providerId = c.req.param("providerId"); if (!await available(c.env, request.workspaceId, providerId)) return c.json(errorResponse(failure("not_found", "Provider is not available in this workspace.")), 404); const result = await executeProviderTool(c.env, request.workspaceId, "providers.testConnection", { connectionId: request.connectionId, modelId: request.modelId }); return result.ok && result.payload.status === "executed" ? c.json(result.payload.result) : c.json(errorResponse(failure("dependency_unavailable", "Provider runtime rejected the operation.", { retryable: true })), 502); });
  return routes;
}
