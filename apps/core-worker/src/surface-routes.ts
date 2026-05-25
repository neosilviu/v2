import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { extractDeclaredHtmlAsset } from "@v2/plugin-installer";
import { allowedOrigins, type CoreSessionUser } from "./access";
import type { CoreEnv } from "./env";
import { CoreRepository } from "./repository";

type CoreVariables = { user: CoreSessionUser | null; internal: boolean };

function frameAncestors(env: CoreEnv): string {
  const configured = allowedOrigins(env)
    .map((origin) => {
      try { return new URL(origin).origin; } catch { return undefined; }
    })
    .filter((origin): origin is string => Boolean(origin));
  return configured.length ? configured.join(" ") : "'none'";
}

export function createSurfaceRoutes() {
  const routes = new Hono<{ Bindings: CoreEnv; Variables: CoreVariables }>();

  routes.get("/surfaces/:surfaceId", async (c) => {
    if (!c.get("internal") && !c.get("user")) {
      return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
    }
    const workspaceId = c.req.query("workspaceId")?.trim();
    const surfaceId = c.req.param("surfaceId").trim();
    if (!workspaceId || !surfaceId) {
      return c.json(errorResponse(failure("validation_failed", "Workspace and surface are required.")), 400);
    }
    const surface = await new CoreRepository(c.env.CORE_DB).resolveSandboxSurface(workspaceId, surfaceId);
    if (!surface) {
      return c.json(errorResponse(failure("not_found", "Plugin surface is not available.")), 404);
    }
    const archive = await c.env.PLUGIN_PACKAGES.get(surface.objectKey);
    if (!archive) {
      return c.json(errorResponse(failure("dependency_unavailable", "Plugin package asset is unavailable.")), 503);
    }
    const html = extractDeclaredHtmlAsset(await archive.arrayBuffer(), surface.entry);
    if (!html) {
      return c.json(errorResponse(failure("not_found", "Declared plugin UI asset is not available.")), 404);
    }
    const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; frame-ancestors ${frameAncestors(c.env)}; base-uri 'none'; object-src 'none'`;
    return c.body(html, 200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": policy,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-site",
    });
  });

  return routes;
}
