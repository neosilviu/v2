import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { CoreEnv } from "./env";
import { platformSettingsTabs } from "./platform-settings";
import { CoreRepository, type WorkspacePermission } from "./repository";

type User = { id: string; email: string; name?: string | null; impersonatedBy?: string | null } | null;
type Variables = { user: User; internal?: boolean };

async function requirePermission(c: { env: CoreEnv; get: (name: "user") => User; json: (value: unknown, status?: number) => Response }, workspaceId: string, permission: WorkspacePermission) {
  const user = c.get("user");
  if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  const allowed = await new CoreRepository(c.env.CORE_DB).hasPermission(workspaceId, user, permission);
  return allowed ? undefined : c.json(errorResponse(failure("not_authorized", `${permission} permission is required.`)), 403);
}

/**
 * Platform settings are source-controlled compact UI declarations. This route
 * deliberately uses /settings/schema so legacy seeded routes cannot intercept
 * or silently replace the active schema consumed by the web application.
 * Plugin tabs continue to be merged from runtime contributions.
 */
export function createPlatformSettingsRoutes() {
  const routes = new Hono<{ Bindings: CoreEnv; Variables: Variables }>();

  routes.get("/workspaces/:workspaceId/settings/schema/tabs", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "workspace.settings.read");
    if (denied) return denied;
    const repo = new CoreRepository(c.env.CORE_DB);
    const compact = platformSettingsTabs().map(({ tab }) => tab);
    const pluginTabs = (await repo.settingsTabsForWorkspace(workspaceId)).filter((tab) => tab.pluginId !== "platform");
    return c.json({ tabs: [...compact, ...pluginTabs].sort((left, right) => left.displayOrder - right.displayOrder) });
  });

  routes.get("/workspaces/:workspaceId/settings/schema/tabs/:tabId", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "workspace.settings.read");
    if (denied) return denied;
    const tabId = c.req.param("tabId");
    const compact = platformSettingsTabs().find((entry) => entry.tab.id === tabId);
    if (compact) return c.json(compact);
    const resolution = await new CoreRepository(c.env.CORE_DB).resolveSettingsTab(workspaceId, tabId);
    return resolution ? c.json(resolution) : c.json(errorResponse(failure("not_found", "Settings tab is not available.")), 404);
  });

  return routes;
}
