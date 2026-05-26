import { Hono, type Context } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { createAuth, isAuthAdmin, parseAuthConfig, resolveAuthConfig, type AuthEnv } from "./auth";
import { AuthRuntimeRepository } from "./runtime-config";

const app = new Hono<{ Bindings: AuthEnv }>();
type AuthContext = Context<{ Bindings: AuthEnv }>;

function isInternalRequest(c: AuthContext) {
  const url = new URL(c.req.url);
  return url.hostname === "auth.internal" && !c.req.header("origin");
}

function needsBrowserCors(path: string) {
  return path.startsWith("/api/auth/") || path.startsWith("/public/auth/") || path.startsWith("/admin/auth/") || path.startsWith("/setup/owner/");
}

function applyCorsHeaders(headers: Headers, origin: string) {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Expose-Headers", "Content-Length");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  headers.set("Access-Control-Max-Age", "600");
  headers.set("Vary", "Origin");
}

function corsHeaders(origin: string) {
  const headers = new Headers();
  applyCorsHeaders(headers, origin);
  return headers;
}

function addCorsHeaders(response: Response, origin: string) {
  const headers = new Headers(response.headers);
  applyCorsHeaders(headers, origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

app.get("/health", (c) => c.json({ ok: true, service: "auth-worker", configured: parseAuthConfig(c.env).ok }));
app.use("*", async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  if (!origin || !needsBrowserCors(c.req.path)) {
    await next();
    return;
  }
  const parsed = await resolveAuthConfig(c.env, c.req.query("workspaceId") ?? undefined);
  const allowed = parsed.ok && parsed.config.trustedOrigins.includes(origin);
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? corsHeaders(origin) : undefined });
  }
  await next();
  if (allowed) c.res = addCorsHeaders(c.res, origin);
});
app.get("/public/auth/login-config", async (c) => {
  const parsed = await resolveAuthConfig(c.env, c.req.query("workspaceId") ?? undefined);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  const config = await new AuthRuntimeRepository(parsed.config.db).publicLoginConfig(c.req.query("workspaceId") ?? null, { github: Boolean(parsed.config.github) });
  return c.json(config);
});
async function requireAdmin(c: AuthContext) {
  const parsed = await resolveAuthConfig(c.env, c.req.query("workspaceId") ?? undefined);
  if (!parsed.ok) return { ok: false as const, response: c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503) };
  if (isInternalRequest(c)) return { ok: true as const, config: parsed.config };
  if (!await isAuthAdmin(parsed.config, c.req.raw.headers)) return { ok: false as const, response: c.json(errorResponse(failure("not_authorized", "Auth recovery administrator access is disabled or not authorized.")), 403) };
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
  const body = await c.req.json();
  const policy = await new AuthRuntimeRepository(admin.config.db).upsertPolicy(body, { mailDeliveryAvailable: isInternalRequest(c) && (body as { mailDeliveryAvailable?: unknown }).mailDeliveryAvailable === true });
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
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  const policy = await new AuthRuntimeRepository(parsed.config.db).publicPolicy(null);
  if (policy.registrationMode !== "open") return c.json(errorResponse(failure("not_authorized", "Password registration is not open.")), 403);
  return createAuth(parsed.config).handler(c.req.raw);
});
app.post("/setup/owner/sign-up/email", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  if (!parsed.config.core) return c.json(errorResponse(failure("dependency_unavailable", "Core service binding is required for owner setup.")), 503);
  const body = await c.req.json().catch(() => null) as { token?: unknown; email?: unknown; password?: unknown; name?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (token.length < 24 || !email || typeof body?.password !== "string") return c.json(errorResponse(failure("validation_failed", "A valid owner setup token, email and password are required.")), 400);
  const statusResponse = await parsed.config.core.fetch(`https://core.internal/setup/owner?token=${encodeURIComponent(token)}`);
  if (!statusResponse.ok) return c.json(errorResponse(failure("not_found", "Owner setup link is not available.")), 404);
  const status = await statusResponse.json() as { setup?: { ownerEmail?: string; status?: string } };
  if (status.setup?.status !== "pending" || status.setup.ownerEmail?.toLowerCase() !== email) return c.json(errorResponse(failure("not_authorized", "Owner setup token is not valid for this email.")), 403);
  const signUpRequest = new Request(new URL("/api/auth/sign-up/email", parsed.config.baseURL).toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: body.password, name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : email }),
  });
  const response = await createAuth(parsed.config).handler(signUpRequest);
  if (!response.ok) return response;
  const payload = await response.clone().json().catch(() => ({})) as { user?: { id?: unknown; email?: unknown; name?: unknown } };
  const user = payload.user && typeof payload.user.id === "string" && typeof payload.user.email === "string"
    ? { id: payload.user.id, email: payload.user.email, ...(typeof payload.user.name === "string" ? { name: payload.user.name } : {}) }
    : await parsed.config.db.prepare("SELECT id, email, name FROM user WHERE lower(email) = lower(?) LIMIT 1").bind(email).first<{ id: string; email: string; name: string }>();
  if (!user) return c.json(errorResponse(failure("conflict", "Owner account was not created.")), 409);
  const consumeResponse = await parsed.config.core.fetch("https://core.internal/internal/setup/owner/consume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, user }),
  });
  if (!consumeResponse.ok) return c.json(errorResponse(failure("conflict", "Owner account was created but workspace membership could not be finalized. Retry with the same setup link.")), 409);
  return response;
});
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  return createAuth(parsed.config).handler(c.req.raw);
});

export default app;
