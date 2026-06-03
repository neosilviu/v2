import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { CommerceEnv } from "./env";

const app = new Hono<{ Bindings: CommerceEnv }>();
app.get("/health", (c) => c.json({ ok: true, service: "commerce" }));
async function listProducts(env: CommerceEnv, workspaceId: string) {
  const cacheKey = `products:${workspaceId}`;
  if (env.COMMERCE_KV) {
    const cached = await env.COMMERCE_KV.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as unknown[];
      } catch {
        // Fallback to database on JSON parse error
      }
    }
  }
  const rows = await env.COMMERCE_DB.prepare(
    "SELECT id, slug, title, status, updated_at FROM commerce_products WHERE workspace_id = ? ORDER BY updated_at DESC",
  )
    .bind(workspaceId)
    .all();
  if (env.COMMERCE_KV && rows.results) {
    await env.COMMERCE_KV.put(cacheKey, JSON.stringify(rows.results), {
      expirationTtl: 300,
    });
  }
  return rows.results ?? [];
}
app.get("/workspaces/:workspaceId/products", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  return c.json({ products: await listProducts(c.env, workspaceId) });
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
app.post("/runtime/execute", async (c) => {
  const url = new URL(c.req.url);
  const localRuntimeBridge =
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    c.req.header("x-v2-runtime-bridge-dev") === "1";
  if (
    (!localRuntimeBridge && url.hostname !== "plugin-runtime.internal") ||
    c.req.header("origin")
  )
    return c.json(
      errorResponse(failure("not_authorized", "Commerce runtime is internal.")),
      403,
    );
  const body = (await c.req.json().catch(() => null)) as {
    workspaceId?: unknown;
    operationId?: unknown;
  } | null;
  const workspaceId =
    typeof body?.workspaceId === "string" ? body.workspaceId : "default";
  const operationId =
    typeof body?.operationId === "string" ? body.operationId : "";
  if (operationId === "commerce.listProducts") {
    return c.json({ rows: await listProducts(c.env, workspaceId) });
  }
  return c.json(
    errorResponse(failure("not_found", "Commerce runtime operation not found.")),
    404,
  );
});
export default app;
