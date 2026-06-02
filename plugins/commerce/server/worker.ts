import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { CommerceEnv } from "./env";

const app = new Hono<{ Bindings: CommerceEnv }>();
app.get("/health", (c) => c.json({ ok: true, service: "commerce" }));
app.get("/workspaces/:workspaceId/products", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const cacheKey = `products:${workspaceId}`;
  if (c.env.COMMERCE_KV) {
    const cached = await c.env.COMMERCE_KV.get(cacheKey);
    if (cached) {
      try {
        return c.json({ products: JSON.parse(cached) });
      } catch {
        // Fallback to database on JSON parse error
      }
    }
  }
  const rows = await c.env.COMMERCE_DB.prepare(
    "SELECT id, slug, title, status, updated_at FROM commerce_products WHERE workspace_id = ? ORDER BY updated_at DESC",
  )
    .bind(workspaceId)
    .all();
  if (c.env.COMMERCE_KV && rows.results) {
    await c.env.COMMERCE_KV.put(cacheKey, JSON.stringify(rows.results), {
      expirationTtl: 300,
    });
  }
  return c.json({ products: rows.results });
});
app.get("/workspaces/:workspaceId/orders/:orderId", async (c) => {
  const row = await c.env.COMMERCE_DB.prepare(
    "SELECT id, status, total_minor, currency, updated_at FROM commerce_orders WHERE workspace_id = ? AND id = ? LIMIT 1",
  )
    .bind(c.req.param("workspaceId"), c.req.param("orderId"))
    .first();
  if (!row)
    return c.json(
      errorResponse(failure("not_found", "Order is not available.")),
      404,
    );
  return c.json({ order: row });
});
export default app;
