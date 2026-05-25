import { Hono } from "hono";
import { RuntimeKernel } from "@v2/runtime";

const app = new Hono();
const runtime = new RuntimeKernel();

app.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));
app.get("/runtime/plugins", (c) => c.json({ plugins: runtime.plugins.all() }));
app.get("/runtime/tools", (c) => c.json({ tools: runtime.tools.all() }));

export default app;
export type CoreApp = typeof app;
