import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import type { CoreEnv } from "./env";
import { CoreRepository } from "./repository";

type User = { id: string; email: string; name?: string | null; impersonatedBy?: string | null } | null;
type Variables = { user: User; internal?: boolean };

async function requireRead(c: { env: CoreEnv; get: (name: "user") => User; json: (input: unknown, status?: number) => Response }, workspaceId: string) {
  const user = c.get("user");
  if (!user) return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
  const allowed = await new CoreRepository(c.env.CORE_DB).hasPermission(workspaceId, user, "workspace.read");
  return allowed ? undefined : c.json(errorResponse(failure("not_authorized", "workspace.read permission is required.")), 403);
}

export function createRuntimeRegistryRoutes() {
  const routes = new Hono<{ Bindings: CoreEnv; Variables: Variables }>();
  routes.get("/workspaces/:workspaceId/runtime/registry", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requireRead(c, workspaceId);
    if (denied) return denied;
    const repo = new CoreRepository(c.env.CORE_DB);
    const active = new Set(await repo.activePlugins(workspaceId));
    const installed = await repo.workspaceInstalled(workspaceId);
    const plugins = installed.filter((plugin) => active.has(plugin.id));
    const deployments = await Promise.all(installed.map(async (plugin) => ({ pluginId: plugin.id, state: await repo.pluginRuntimeDeployment(workspaceId, plugin.id) ?? null })));
    return c.json({
      plugins: plugins.map((plugin) => ({ id: plugin.id, name: plugin.name, version: plugin.version })),
      tools: plugins.flatMap((plugin) => plugin.contributes.tools.map((tool) => ({ ...tool, pluginId: plugin.id, pluginName: plugin.name }))),
      providers: plugins.flatMap((plugin) => plugin.contributes.providers.map((provider) => ({ ...provider, pluginId: plugin.id, pluginName: plugin.name }))),
      channels: plugins.flatMap((plugin) => plugin.contributes.channels.map((channel) => ({ ...channel, pluginId: plugin.id, pluginName: plugin.name }))),
      deployments,
    });
  });
  return routes;
}
