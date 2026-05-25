import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { assessPluginBundle, unpackPluginZip } from "@v2/plugin-installer";
import {
  capabilityGrantRequestSchema,
  layoutWriteRequestSchema,
  pluginActivationRequestSchema,
  pluginInstallRequestSchema,
  settingScopeSchema,
  settingWriteRequestSchema,
  toolExecutionRequestSchema,
  type SettingScope,
} from "@v2/rpc-contracts";
import { RuntimeKernel } from "@v2/runtime";
import { allowedOrigins, isInternalRequest, isPlatformAdmin, readSession, type CoreSessionUser } from "./access";
import type { CoreEnv } from "./env";
import { CoreRepository } from "./repository";

type CoreVariables = { user: CoreSessionUser | null; internal: boolean };
type CoreBindings = { Bindings: CoreEnv; Variables: CoreVariables };
type CoreContext = Context<CoreBindings>;

const app = new Hono<CoreBindings>();
const defaultWorkspaceId = "default";

app.use("*", cors({
  origin: (origin, c) => allowedOrigins(c.env).includes(origin) ? origin : "",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
  credentials: true,
  maxAge: 600,
}));

app.use("*", async (c, next) => {
  const internal = isInternalRequest(c.req.raw);
  c.set("internal", internal);
  c.set("user", internal || c.req.path === "/health" ? null : await readSession(c.env, c.req.raw.headers));
  await next();
});

app.onError((error, c) => {
  const validation = error instanceof Error && error.name === "ZodError";
  const result = errorResponse(failure(
    validation ? "validation_failed" : "internal_error",
    validation ? "Request validation failed." : "An unexpected error occurred.",
  ));
  return c.json(result, validation ? 400 : 500);
});

function requireRead(c: CoreContext): Response | undefined {
  if (c.get("internal") || c.get("user")) return undefined;
  return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
}

function requireAdmin(c: CoreContext): Response | undefined {
  if (isPlatformAdmin(c.env, c.get("user"))) return undefined;
  return c.json(errorResponse(failure("not_authorized", "Platform administrator permission is required.")), 403);
}

async function runtimeFor(repo: CoreRepository) {
  const runtime = new RuntimeKernel();
  for (const manifest of await repo.installed()) await runtime.registerPlugin(manifest);
  return runtime;
}

app.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));

app.get("/runtime/plugins", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  return c.json({ plugins: await new CoreRepository(c.env.CORE_DB).installed() });
});

app.get("/runtime/tools", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const active = new Set(await repo.activePlugins(c.req.query("workspaceId") ?? defaultWorkspaceId));
  return c.json({ tools: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.tools) });
});

app.get("/runtime/providers", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const active = new Set(await repo.activePlugins(c.req.query("workspaceId") ?? defaultWorkspaceId));
  return c.json({ providers: runtime.plugins.all().filter((plugin) => active.has(plugin.id)).flatMap((plugin) => plugin.contributes.providers) });
});

app.get("/plugins/installed", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  return c.json({ plugins: await new CoreRepository(c.env.CORE_DB).installed() });
});

app.get("/workspaces/:workspaceId/plugins", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  return c.json({ active: await new CoreRepository(c.env.CORE_DB).activePlugins(c.req.param("workspaceId")) });
});

app.post("/plugins/upload", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip")) {
    return c.json(errorResponse(failure("validation_failed", "A ZIP plugin package is required.")), 400);
  }
  if (file.size > 20 * 1024 * 1024) {
    return c.json(errorResponse(failure("validation_failed", "Plugin package exceeds 20 MB.")), 413);
  }
  const bytes = await file.arrayBuffer();
  const key = `packages/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
  const assessment = await unpackPluginZip(bytes, key);
  await c.env.PLUGIN_PACKAGES.put(key, bytes, {
    customMetadata: {
      pluginId: assessment.bundle.manifest.id,
      version: assessment.bundle.manifest.version,
      sha256: assessment.bundle.package.sha256,
    },
  });
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.ensureWorkspace(defaultWorkspaceId);
  if (assessment.requiresApproval) {
    await repo.audit(defaultWorkspaceId, "plugin.install.approval_required", { pluginId: assessment.bundle.manifest.id }, c.get("user")?.id);
    return c.json({ status: "approval-required", bundle: assessment.bundle, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  }
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.activate(defaultWorkspaceId, assessment.bundle.manifest.id);
  await repo.audit(defaultWorkspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id, source: "zip" }, c.get("user")?.id);
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});

app.post("/plugins/install", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const request = pluginInstallRequestSchema.parse(await c.req.json());
  const assessment = assessPluginBundle(request.bundle);
  if (assessment.requiresApproval && !request.approved) {
    return c.json({ status: "approval-required", bundle: assessment.bundle, sensitiveCapabilities: assessment.sensitiveCapabilities }, 202);
  }
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.ensureWorkspace(request.workspaceId);
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.activate(request.workspaceId, assessment.bundle.manifest.id);
  await repo.audit(request.workspaceId, "plugin.install", { pluginId: assessment.bundle.manifest.id }, c.get("user")?.id);
  return c.json({ status: "installed", manifest: assessment.bundle.manifest }, 201);
});

app.post("/plugins/activate", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const request = pluginActivationRequestSchema.parse(await c.req.json());
  const state = await new CoreRepository(c.env.CORE_DB).activate(request.workspaceId, request.pluginId);
  return state ? c.json(state, 201) : c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404);
});

app.post("/plugins/deactivate", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const request = pluginActivationRequestSchema.parse(await c.req.json());
  const state = await new CoreRepository(c.env.CORE_DB).deactivate(request.workspaceId, request.pluginId);
  return state ? c.json(state) : c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404);
});

app.post("/plugins/grants", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const request = capabilityGrantRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  if (!await repo.installedById(request.pluginId)) {
    return c.json(errorResponse(failure("not_found", "Plugin is not installed.")), 404);
  }
  const declared = new Set(await repo.declaredCapabilities(request.pluginId));
  if (!request.capabilities.every((capability) => declared.has(capability))) {
    return c.json(errorResponse(failure("validation_failed", "Capability is not declared by the plugin.")), 400);
  }
  return c.json({ pluginId: request.pluginId, capabilities: await repo.grantCapabilities(request.workspaceId, request.pluginId, request.capabilities) });
});

app.post("/tools/execute", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const request = toolExecutionRequestSchema.parse(await c.req.json());
  const repo = new CoreRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const owner = runtime.plugins.all().find((plugin) => plugin.contributes.tools.some((tool) => tool.id === request.toolId));
  const tool = runtime.tools.get(request.toolId);
  if (!owner || !tool) return c.json({ status: "denied", toolId: request.toolId, reason: "Tool not registered" }, 404);
  const active = new Set(await repo.activePlugins(request.workspaceId));
  if (!active.has(owner.id)) return c.json({ status: "denied", toolId: tool.id, reason: "Plugin is not active in workspace" }, 403);
  const permissions = new Set(await repo.grantedCapabilities(request.workspaceId, owner.id));
  const approvedByAdmin = request.approved && isPlatformAdmin(c.env, c.get("user"));
  const decision = runtime.canExecuteTool(tool.id, approvedByAdmin ? { permissions, approvedToolIds: new Set([tool.id]) } : { permissions });
  if (decision === "deny") return c.json({ status: "denied", toolId: tool.id, reason: "Capability has not been granted" }, 403);
  if (decision === "require-approval") return c.json({ status: "approval-required", toolId: tool.id, risk: tool.risk }, 202);
  await runtime.events.emit("tool.executed", { workspaceId: request.workspaceId, toolId: tool.id, input: request.input });
  await repo.audit(request.workspaceId, "tool.execute", { toolId: tool.id, pluginId: owner.id }, c.get("user")?.id);
  return c.json({ status: "executed", toolId: tool.id, result: { accepted: true } });
});

app.get("/workspaces/:workspaceId/settings/:scope", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  const scope = settingScopeSchema.parse(c.req.param("scope")) as SettingScope;
  return c.json({ settings: await new CoreRepository(c.env.CORE_DB).listSettings(c.req.param("workspaceId"), scope) });
});

app.put("/settings", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const request = settingWriteRequestSchema.parse(await c.req.json());
  await new CoreRepository(c.env.CORE_DB).setSetting(request.workspaceId, request.scope as SettingScope, request.key, request.value);
  return c.json({ saved: true });
});

app.get("/workspaces/:workspaceId/layout", async (c) => {
  const denied = requireRead(c);
  if (denied) return denied;
  return c.json({ layout: (await new CoreRepository(c.env.CORE_DB).getLayout(c.req.param("workspaceId"))) ?? null });
});

app.put("/layouts", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const request = layoutWriteRequestSchema.parse(await c.req.json());
  await new CoreRepository(c.env.CORE_DB).saveLayout(request.workspaceId, request.layout);
  return c.json({ saved: true, layout: request.layout });
});

export default app;
export type CoreApp = typeof app;
