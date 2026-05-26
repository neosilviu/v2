import { Hono } from "hono";
import { mcpRequestSchema, mcpToolCallParamsSchema } from "@v2/mcp-contracts";
import type { ToolContribution } from "@v2/plugin-contracts";
import type { BridgeEnv } from "./env";

const app = new Hono<{ Bindings: BridgeEnv }>();
const workspaceId = "default";

async function mcpTools(env: BridgeEnv): Promise<ToolContribution[]> {
  const response = await env.CORE.fetch(`https://core.internal/runtime/tools?workspaceId=${workspaceId}`);
  const payload = await response.json() as { tools: ToolContribution[] };
  return payload.tools.filter((tool) => tool.exposure.includes("mcp"));
}
function result(id: string | number | null | undefined, value: unknown) { return { jsonrpc: "2.0" as const, id: id ?? null, result: value }; }
function runtimeBindings(env: BridgeEnv): Record<string, string> {
  try {
    const parsed = JSON.parse(env.PLUGIN_RUNTIME_BINDINGS ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}
function pluginRuntime(env: BridgeEnv, pluginId: string): Fetcher | null {
  const bindingName = runtimeBindings(env)[pluginId];
  const binding = bindingName ? env[bindingName] : null;
  return binding && typeof (binding as Fetcher).fetch === "function" ? binding as Fetcher : null;
}

app.get("/health", (c) => c.json({ ok: true, service: "runtime-bridge" }));
app.post("/dispatch", async (c) => {
  const body = await c.req.json().catch(() => null) as { pluginId?: unknown; workspaceId?: unknown; kind?: unknown; operationId?: unknown; contributionId?: unknown; input?: unknown; routeParams?: unknown; queryParams?: unknown } | null;
  const pluginId = typeof body?.pluginId === "string" ? body.pluginId : "";
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  const operationId = typeof body?.operationId === "string" ? body.operationId : "";
  const kind = body?.kind === "tool" || body?.kind === "action" || body?.kind === "data" ? body.kind : "";
  if (!pluginId || !workspaceId || !operationId || !kind) return c.json({ status: "denied", error: "A valid plugin runtime dispatch request is required." }, 400);
  const runtime = pluginRuntime(c.env, pluginId);
  if (!runtime) return c.json({ status: "unavailable", error: "Plugin runtime binding is not configured." }, 501);
  const dispatch = body;
  const response = await runtime.fetch("https://plugin-runtime.internal/runtime/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId, kind, operationId, contributionId: dispatch?.contributionId, input: dispatch?.input, routeParams: dispatch?.routeParams, queryParams: dispatch?.queryParams }),
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
});
app.post("/mcp", async (c) => {
  const request = mcpRequestSchema.parse(await c.req.json());
  if (request.method === "initialize") return c.json(result(request.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "v2-runtime-bridge", version: "0.1.0" } }));
  if (request.method === "tools/list") {
    const tools = await mcpTools(c.env);
    return c.json(result(request.id, { tools: tools.map((tool) => ({ name: tool.id, title: tool.title, description: tool.description ?? tool.title, inputSchema: { type: "object", additionalProperties: true } })) }));
  }
  if (request.method === "tools/call") {
    const params = mcpToolCallParamsSchema.parse(request.params ?? {});
    const response = await c.env.CORE.fetch("https://core.internal/tools/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, toolId: params.name, input: params.arguments, approved: false }) });
    const payload = await response.json() as Record<string, unknown>;
    return c.json(result(request.id, { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: response.status >= 400 }));
  }
  return c.json({ jsonrpc: "2.0", id: request.id ?? null, error: { code: -32601, message: "Method not found" } }, 404);
});
export default app;
