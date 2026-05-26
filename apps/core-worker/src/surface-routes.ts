import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { extractDeclaredHtmlAsset } from "@v2/plugin-installer";
import { declarativePageContributionSchema } from "@v2/ui-schema";
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

  routes.get("/surfaces", async (c) => {
    const workspaceId = c.req.query("workspaceId")?.trim();
    if (!workspaceId) return c.json(errorResponse(failure("validation_failed", "Workspace is required.")), 400);
    if (!c.get("internal")) {
      const user = c.get("user");
      if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
      if (!await new CoreRepository(c.env.CORE_DB).hasPermission(workspaceId, user, "workspace.read")) {
        return c.json(errorResponse(failure("not_authorized", "workspace.read permission is required.")), 403);
      }
    }
    const rows = await c.env.CORE_DB.prepare(`SELECT c.contribution_id, c.zone_id, c.schema_json, a.zone_override
      FROM workspace_ui_activations a
      INNER JOIN workspace_plugins wp ON wp.workspace_id = a.workspace_id AND wp.plugin_id = a.plugin_id AND wp.active = 1
      INNER JOIN plugin_ui_contributions c ON c.plugin_id = a.plugin_id AND c.contribution_id = a.contribution_id
      WHERE a.workspace_id = ? AND a.enabled = 1 AND c.contribution_type = 'surface' AND c.access_mode != 'public-candidate'
      ORDER BY a.order_index, c.contribution_id`)
      .bind(workspaceId)
      .all<{ contribution_id: string; zone_id: string | null; schema_json: string; zone_override: string | null }>();
    return c.json({ surfaces: rows.results.map((row) => {
      const zone = row.zone_override ?? row.zone_id ?? "workspace.main";
      const schema = declarativePageContributionSchema.parse(JSON.parse(row.schema_json));
      return {
        id: row.contribution_id,
        title: schema.title,
        zone,
        kind: zone.startsWith("settings.") ? "settings" : zone === "assistant.right" ? "panel" : "page",
        renderer: { mode: "declarative", schema },
      };
    }) });
  });

  routes.get("/surfaces/:surfaceId", async (c) => {
    if (!c.get("internal") && !c.get("user")) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
    const workspaceId = c.req.query("workspaceId")?.trim();
    const surfaceId = c.req.param("surfaceId").trim();
    if (!workspaceId || !surfaceId) return c.json(errorResponse(failure("validation_failed", "Workspace and surface are required.")), 400);
    const surface = await new CoreRepository(c.env.CORE_DB).resolveSandboxSurface(workspaceId, surfaceId);
    if (!surface) return c.json(errorResponse(failure("not_found", "Plugin surface is not available.")), 404);
    const archive = await c.env.PLUGIN_PACKAGES.get(surface.objectKey);
    if (!archive) return c.json(errorResponse(failure("dependency_unavailable", "Plugin package asset is unavailable.")), 503);
    const html = extractDeclaredHtmlAsset(await archive.arrayBuffer(), surface.entry);
    if (!html) return c.json(errorResponse(failure("not_found", "Declared plugin UI asset is not available.")), 404);
    const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; frame-ancestors ${frameAncestors(c.env)}; base-uri 'none'; object-src 'none'`;
    return c.body(html, 200, { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": policy, "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-site" });
  });

  return routes;
}
