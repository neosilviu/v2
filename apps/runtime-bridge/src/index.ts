import { Hono } from "hono";
import { toolExecutionRequestSchema } from "@v2/rpc-contracts";

const app = new Hono();
const bridgeTools = [
  { id: "runtime.listTools", title: "List runtime tools", risk: "safe" },
  { id: "github.commitFiles", title: "Commit files to a working branch", risk: "sensitive" },
  { id: "runtime.executeTool", title: "Execute a permitted runtime tool", risk: "reversible" },
];

app.get("/health", (c) => c.json({ ok: true, service: "runtime-bridge" }));
app.get("/mcp/tools", (c) => c.json({ tools: bridgeTools }));
app.post("/mcp/execute", async (c) => {
  const request = toolExecutionRequestSchema.parse(await c.req.json());
  if (request.toolId === "runtime.listTools") return c.json({ tools: bridgeTools });
  return c.json({ status: "approval-required", request }, 202);
});

export default app;
