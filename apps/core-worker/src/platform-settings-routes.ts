import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { CoreEnv } from "./env";
import { platformSettingsTabs } from "./platform-settings";
import type { WorkspacePermission } from "./repository";
import { CoreRepository } from "./repository";

type User = { id: string; email: string; name?: string | null; impersonatedBy?: string | null } | null;
type Variables = { user: User; internal?: boolean };

async function requirePermission(c: { env: CoreEnv; get: (name: "user") => User; json: (value: unknown, status?: number) => Response }, workspaceId: string, permission: WorkspacePermission) {
  const user = c.get("user");
  if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  const allowed = await new CoreRepository(c.env.CORE_DB).hasPermission(workspaceId, user, permission);
  return allowed ? undefined : c.json(errorResponse(failure("not_authorized", `${permission} permission is required.`)), 403);
}

/**
 * Platform settings are source-controlled compact UI declarations. The
 * platform tab registry intentionally does not depend on legacy seeded D1
 * contributions; plugin settings can be reintroduced through a dedicated
 * runtime contribution query once that registry is exposed by repository.
 */
export function createPlatformSettingsRoutes() {
  const routes = new Hono<{ Bindings: CoreEnv; Variables: Variables }>();

  routes.get("/workspaces/:workspaceId/settings/schema/tabs", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "workspace.settings.read");
    if (denied) return denied;
    const tabs = platformSettingsTabs().map(({ tab }) => tab).sort((left, right) => left.displayOrder - right.displayOrder);
    return c.json({ tabs });
  });

  routes.get("/workspaces/:workspaceId/settings/schema/tabs/:tabId", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "workspace.settings.read");
    if (denied) return denied;
    const compact = platformSettingsTabs().find((entry) => entry.tab.id === c.req.param("tabId"));
    return compact ? c.json(compact) : c.json(errorResponse(failure("not_found", "Settings tab is not available.")), 404);
  });

  return routes;
}
