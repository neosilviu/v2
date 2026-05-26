import { Hono } from "hono";
import { mcpRequestSchema, mcpToolCallParamsSchema } from "@v2/mcp-contracts";
import type { ToolContribution } from "@v2/plugin-contracts";
import type { McpGatewayEnv } from "./env";

const app = new Hono<{ Bindings: McpGatewayEnv }>();
const defaultWorkspaceId = "default";

function result(id: string | number | null | undefined, value: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result: value };
}

async function mcpTools(env: McpGatewayEnv, workspaceId: string): Promise<ToolContribution[]> {
  const response = await env.CORE.fetch(`https://core.internal/runtime/tools?workspaceId=${encodeURIComponent(workspaceId)}`);
  const payload = await response.json() as { tools?: ToolContribution[] };
  return (payload.tools ?? []).filter((tool) => tool.exposure.includes("mcp"));
}

app.get("/health", (c) => c.json({ ok: true, service: "mcp-gateway" }));

app.post("/mcp", async (c) => {
  const workspaceId = c.req.query("workspaceId") || defaultWorkspaceId;
  const request = mcpRequestSchema.parse(await c.req.json());
  if (request.method === "initialize") {
    return c.json(result(request.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "v2-mcp-gateway", version: "0.1.0" } }));
  }
  if (request.method === "tools/list") {
    const tools = await mcpTools(c.env, workspaceId);
    return c.json(result(request.id, { tools: tools.map((tool) => ({ name: tool.id, title: tool.title, description: tool.description ?? tool.title, inputSchema: { type: "object", additionalProperties: true } })) }));
  }
  if (request.method === "tools/call") {
    const params = mcpToolCallParamsSchema.parse(request.params ?? {});
    const response = await c.env.CORE.fetch("https://core.internal/tools/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, toolId: params.name, input: params.arguments, approved: false }),
    });
    const payload = await response.json() as Record<string, unknown>;
    return c.json(result(request.id, { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: response.status >= 400 }));
  }
  return c.json({ jsonrpc: "2.0", id: request.id ?? null, error: { code: -32601, message: "Method not found" } }, 404);
});

export default app;
