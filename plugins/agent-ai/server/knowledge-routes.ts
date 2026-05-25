import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { AgentAiEnv } from "./env";

type SearchInput = { workspaceId: string; query: string; limit: number };
type ContextInput = { workspaceId: string; surfaceId: string; entityId?: string };

function searchInput(input: unknown): SearchInput | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const query = typeof value.query === "string" ? value.query.trim() : "";
  const workspaceId = typeof value.workspaceId === "string" ? value.workspaceId.trim() : "";
  if (!workspaceId || !query || query.length > 2000) return undefined;
  const requested = typeof value.limit === "number" && Number.isInteger(value.limit) ? value.limit : 5;
  return { workspaceId, query, limit: Math.max(1, Math.min(10, requested)) };
}

function contextInput(input: unknown): ContextInput | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const workspaceId = typeof value.workspaceId === "string" ? value.workspaceId.trim() : "";
  const surfaceId = typeof value.surfaceId === "string" ? value.surfaceId.trim() : "";
  if (!workspaceId || !surfaceId) return undefined;
  const entityId = typeof value.entityId === "string" && value.entityId.trim() ? value.entityId.trim() : undefined;
  return entityId ? { workspaceId, surfaceId, entityId } : { workspaceId, surfaceId };
}

export function createKnowledgeRoutes() {
  const routes = new Hono<{ Bindings: AgentAiEnv }>();
  routes.get("/status", (c) => c.json({
    knowledgeAvailable: Boolean(c.env.KNOWLEDGE_RUNTIME),
    pageContextAvailable: Boolean(c.env.PAGE_CONTEXT),
    vectorStoreAvailable: Boolean(c.env.AGENT_VECTORIZE),
  }));
  routes.post("/search", async (c) => {
    const input = searchInput(await c.req.json().catch(() => null));
    if (!input) return c.json(errorResponse(failure("validation_failed", "A valid knowledge query is required.")), 400);
    if (!c.env.KNOWLEDGE_RUNTIME) return c.json(errorResponse(failure("dependency_unavailable", "Knowledge search is not configured.")), 503);
    const response = await c.env.KNOWLEDGE_RUNTIME.fetch("https://knowledge.internal/search", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
    if (!response.ok) return c.json(errorResponse(failure("dependency_unavailable", "Knowledge search failed.")), 502);
    return c.json(await response.json());
  });
  routes.post("/page-context", async (c) => {
    const input = contextInput(await c.req.json().catch(() => null));
    if (!input) return c.json(errorResponse(failure("validation_failed", "A valid page context request is required.")), 400);
    if (!c.env.PAGE_CONTEXT) return c.json(errorResponse(failure("dependency_unavailable", "Page context is not configured.")), 503);
    const response = await c.env.PAGE_CONTEXT.fetch("https://context.internal/read", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
    if (!response.ok) return c.json(errorResponse(failure("dependency_unavailable", "Page context request failed.")), 502);
    return c.json(await response.json());
  });
  return routes;
}
