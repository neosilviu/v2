import { Hono } from "hono";

const app = new Hono();

const bridgeTools = [
  { id: "runtime.listTools", title: "List runtime tools", risk: "safe" },
  { id: "github.commitFiles", title: "Commit files to a working branch", risk: "sensitive" },
  { id: "runtime.executeTool", title: "Execute a permitted runtime tool", risk: "reversible" },
];

app.get("/health", (c) => c.json({ ok: true, service: "runtime-bridge" }));
app.get("/mcp/tools", (c) => c.json({ tools: bridgeTools }));
app.post("/mcp/execute", (c) => c.json({ ok: false, message: "MCP execution policy placeholder" }, 501));

export default app;
