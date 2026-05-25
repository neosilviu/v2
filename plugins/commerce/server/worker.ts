import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { CommerceEnv } from "./env";

const app = new Hono<{ Bindings: CommerceEnv }>();
app.get("/health", (c) => c.json({ ok: true, service: "commerce" }));
app.get("/workspaces/:workspaceId/products", async (c) => {
  const rows = await c.env.COMMERCE_DB.prepare("SELECT id, slug, title, status, updated_at FROM commerce_products WHERE workspace_id = ? ORDER BY updated_at DESC").bind(c.req.param("workspaceId")).all();
  return c.json({ products: rows.results });
});
app.get("/workspaces/:workspaceId/orders/:orderId", async (c) => {
  const row = await c.env.COMMERCE_DB.prepare("SELECT id, status, total_minor, currency, updated_at FROM commerce_orders WHERE workspace_id = ? AND id = ? LIMIT 1").bind(c.req.param("workspaceId"), c.req.param("orderId")).first();
  if (!row) return c.json(errorResponse(failure("not_found", "Order is not available.")), 404);
  return c.json({ order: row });
});
export default app;
