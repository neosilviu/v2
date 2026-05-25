import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { WebsiteStudioEnv } from "./env";

const app = new Hono<{ Bindings: WebsiteStudioEnv }>();

app.get("/health", (c) => c.json({ ok: true, service: "website-studio" }));
app.get("/workspaces/:workspaceId/pages", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const rows = await c.env.WEBSITE_DB.prepare("SELECT id, slug, title, status, updated_at FROM website_pages WHERE workspace_id = ? ORDER BY updated_at DESC").bind(workspaceId).all();
  return c.json({ pages: rows.results });
});
app.get("/workspaces/:workspaceId/context/:pageId", async (c) => {
  const result = await c.env.WEBSITE_DB.prepare("SELECT surface_id, readable_json, allowed_tools_json FROM website_context_shares WHERE workspace_id = ? AND page_id = ? AND enabled = 1 LIMIT 1").bind(c.req.param("workspaceId"), c.req.param("pageId")).first();
  if (!result) return c.json(errorResponse(failure("not_found", "Approved page context is not available.")), 404);
  return c.json({ context: result });
});

export default app;
