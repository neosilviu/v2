import { Hono } from "hono";
import { mcpRequestSchema, mcpToolCallParamsSchema } from "@v2/mcp-contracts";
import type { ToolContribution } from "@v2/plugin-contracts";
import type { McpGatewayEnv } from "./env";

const app = new Hono<{ Bindings: McpGatewayEnv }>();
const defaultWorkspaceId = "default";

function result(id: string | number | null | undefined, value: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result: value };
}

function delegatedHeaders(headers: Headers) {
  const forwarded = new Headers();
  const cookie = headers.get("cookie");
  const authorization = headers.get("authorization");
  if (cookie) forwarded.set("cookie", cookie);
  if (authorization) forwarded.set("authorization", authorization);
  return forwarded;
}

function hasActor(headers: Headers) {
  return Boolean(headers.get("cookie") || headers.get("authorization"));
}

async function mcpTools(
  env: McpGatewayEnv,
  workspaceId: string,
  headers: Headers,
): Promise<{ response: Response; tools: ToolContribution[] }> {
  const response = await env.CORE.fetch(
    `https://core.internal/runtime/tools?workspaceId=${encodeURIComponent(workspaceId)}`,
    { headers: delegatedHeaders(headers) },
  );
  const payload = (await response.json()) as { tools?: ToolContribution[] };
  return {
    response,
    tools: (payload.tools ?? []).filter((tool) =>
      tool.exposure.includes("mcp"),
    ),
  };
}

app.get("/health", (c) => c.json({ ok: true, service: "mcp-gateway" }));

app.post("/mcp", async (c) => {
  const workspaceId = c.req.query("workspaceId") || defaultWorkspaceId;
  const request = mcpRequestSchema.parse(await c.req.json());
  if (request.method === "initialize") {
    return c.json(
      result(request.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "v2-mcp-gateway", version: "0.1.0" },
      }),
    );
  }
  if (request.method === "tools/list") {
    if (!hasActor(c.req.raw.headers))
      return c.json(
        {
          jsonrpc: "2.0",
          id: request.id ?? null,
          error: { code: -32001, message: "Authentication is required." },
        },
        401,
      );
    const listed = await mcpTools(c.env, workspaceId, c.req.raw.headers);
    if (!listed.response.ok) {
      const status =
        listed.response.status === 401
          ? 401
          : listed.response.status === 403
            ? 403
            : 502;
      return c.json(
        {
          jsonrpc: "2.0",
          id: request.id ?? null,
          error: {
            code: -32002,
            message: "Workspace tools are not available for this actor.",
          },
        },
        status,
      );
    }
    const tools = listed.tools;
    return c.json(
      result(request.id, {
        tools: tools.map((tool) => ({
          name: tool.id,
          title: tool.title,
          description: tool.description ?? tool.title,
          inputSchema: { type: "object", additionalProperties: true },
        })),
      }),
    );
  }
  if (request.method === "tools/call") {
    if (!hasActor(c.req.raw.headers))
      return c.json(
        {
          jsonrpc: "2.0",
          id: request.id ?? null,
          error: { code: -32001, message: "Authentication is required." },
        },
        401,
      );
    const params = mcpToolCallParamsSchema.parse(request.params ?? {});
    const response = await c.env.CORE.fetch(
      "https://core.internal/tools/execute",
      {
        method: "POST",
        headers: {
          ...Object.fromEntries(delegatedHeaders(c.req.raw.headers)),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          toolId: params.name,
          input: params.arguments,
          approved: false,
        }),
      },
    );
    const payload = (await response.json()) as Record<string, unknown>;
    return c.json(
      result(request.id, {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: response.status >= 400,
      }),
    );
  }
  return c.json(
    {
      jsonrpc: "2.0",
      id: request.id ?? null,
      error: { code: -32601, message: "Method not found" },
    },
    404,
  );
});

export default app;
