import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { createAuth, isAuthAdmin, parseAuthConfig, type AuthEnv } from "./auth";
import { AuthRuntimeRepository } from "./runtime-config";

const app = new Hono<{ Bindings: AuthEnv }>();
type AuthContext = Context<{ Bindings: AuthEnv }>;

app.get("/health", (c) => c.json({ ok: true, service: "auth-worker", configured: parseAuthConfig(c.env).ok }));
app.use("/api/auth/*", cors({
  origin: (origin, c) => {
    const parsed = parseAuthConfig(c.env);
    return parsed.ok && parsed.config.trustedOrigins.includes(origin) ? origin : "";
  },
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}));
app.use("/public/auth/*", cors({
  origin: (origin, c) => {
    const parsed = parseAuthConfig(c.env);
    return parsed.ok && parsed.config.trustedOrigins.includes(origin) ? origin : "";
  },
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "OPTIONS"],
  maxAge: 600,
  credentials: true,
}));
app.use("/admin/auth/*", cors({
  origin: (origin, c) => {
    const parsed = parseAuthConfig(c.env);
    return parsed.ok && parsed.config.trustedOrigins.includes(origin) ? origin : "";
  },
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
  maxAge: 600,
  credentials: true,
}));
app.get("/public/auth/login-config", async (c) => {
  const parsed = parseAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  const config = await new AuthRuntimeRepository(parsed.config.db).publicLoginConfig(c.req.query("workspaceId") ?? null, { github: Boolean(parsed.config.github) });
  return c.json(config);
});
async function requireAdmin(c: AuthContext) {
  const parsed = parseAuthConfig(c.env);
  if (!parsed.ok) return { ok: false as const, response: c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503) };
  if (!await isAuthAdmin(parsed.config, c.req.raw.headers)) return { ok: false as const, response: c.json(errorResponse(failure("not_authorized", "Authentication administrator permission is required.")), 403) };
  return { ok: true as const, config: parsed.config };
}
app.post("/admin/auth/methods", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const method = await new AuthRuntimeRepository(admin.config.db).upsertMethod(await c.req.json());
  return c.json({ method }, 201);
});
app.get("/admin/auth/methods", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const methods = await new AuthRuntimeRepository(admin.config.db).listMethods(c.req.query("workspaceId") ?? null, { github: Boolean(admin.config.github) });
  return c.json({ methods });
});
app.put("/admin/auth/methods/:methodId", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const body = await c.req.json() as Record<string, unknown>;
  const method = await new AuthRuntimeRepository(admin.config.db).upsertMethod({ ...body, providerId: body.providerId, type: body.type, title: body.title ?? c.req.param("methodId") });
  return c.json({ method });
});
app.post("/admin/auth/ui-contributions", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const contribution = await new AuthRuntimeRepository(admin.config.db).upsertUiContribution(await c.req.json());
  return c.json({ contribution }, 201);
});
app.get("/admin/auth/ui-contributions", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const contributions = await new AuthRuntimeRepository(admin.config.db).listUiContributions(c.req.query("workspaceId") ?? null);
  return c.json({ contributions });
});
app.put("/admin/auth/ui-contributions/:id", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const contribution = await new AuthRuntimeRepository(admin.config.db).upsertUiContribution({ ...await c.req.json() as Record<string, unknown>, contributionId: c.req.param("id") });
  return c.json({ contribution });
});
app.post("/admin/auth/policies", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const policy = await new AuthRuntimeRepository(admin.config.db).upsertPolicy(await c.req.json());
  return c.json({ policy }, 201);
});
app.get("/admin/auth/policy", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const policy = await new AuthRuntimeRepository(admin.config.db).publicPolicy(c.req.query("workspaceId") ?? null);
  return c.json({ policy });
});
app.put("/admin/auth/policy", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const policy = await new AuthRuntimeRepository(admin.config.db).upsertPolicy(await c.req.json());
  return c.json({ policy });
});
app.get("/admin/auth/security-summary", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const summary = await new AuthRuntimeRepository(admin.config.db).securitySummary(c.req.query("workspaceId") ?? null, { github: Boolean(admin.config.github) });
  return c.json({ summary });
});
app.get("/admin/auth/sessions/summary", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const summary = await new AuthRuntimeRepository(admin.config.db).sessionsSummary();
  return c.json({ summary });
});
app.post("/api/auth/sign-up/email", async (c) => {
  const parsed = parseAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  const policy = await new AuthRuntimeRepository(parsed.config.db).publicPolicy(null);
  if (policy.registrationMode !== "open") return c.json(errorResponse(failure("not_authorized", "Password registration is not open.")), 403);
  return createAuth(parsed.config).handler(c.req.raw);
});
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const parsed = parseAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  return createAuth(parsed.config).handler(c.req.raw);
});

export default app;
