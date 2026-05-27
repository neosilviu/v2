import { Hono, type Context } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { authSignInEmailRequestSchema, authUpdateUserRequestSchema, ownerSetupSignupRequestSchema } from "@v2/auth-contracts";
import type { AppErrorCode } from "@v2/rpc-contracts";
import { createAuth, isAuthAdmin, parseAuthConfig, resolveAuthConfig, type AuthEnv } from "./auth";
import { AuthRuntimeRepository } from "./runtime-config";

export const authApiRoutes = new Hono<{ Bindings: AuthEnv }>();
const app = new Hono<{ Bindings: AuthEnv }>();
type AuthContext = Context<{ Bindings: AuthEnv }>;

function serverTiming(start: number) {
  const total = Math.max(0, performance.now() - start);
  return [
    `total;dur=${total.toFixed(1)}`,
    "cors;dur=0.0",
    "session_validation;dur=0.0",
    "auth_service_binding;dur=0.0",
    "permission_lookup;dur=0.0",
    "workspace_lookup;dur=0.0",
    "d1_queries;dur=0.0",
    "runtime_manifest_parse;dur=0.0",
    "serialization;dur=0.0",
  ].join(", ");
}

function isInternalRequest(c: AuthContext) {
  const url = new URL(c.req.url);
  return url.hostname === "auth.internal" && !c.req.header("origin");
}

function needsBrowserCors(path: string) {
  return path.startsWith("/api/auth/") || path.startsWith("/public/auth/") || path.startsWith("/admin/auth/") || path.startsWith("/setup/owner/");
}

authApiRoutes.get("/health", (c) => c.json({ ok: true, service: "auth-worker", configured: parseAuthConfig(c.env).ok }));
app.use("*", async (c, next) => {
  const timingStart = performance.now();
  try {
    await next();
  } finally {
    if (c.env.DEPLOYMENT_ENV !== "production" || c.req.header("x-v2-server-timing") === "1") c.header("Server-Timing", serverTiming(timingStart));
  }
});
app.use("*", async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  if (!origin || !needsBrowserCors(c.req.path)) {
    await next();
    return;
  }
  const parsed = await resolveAuthConfig(c.env, c.req.query("workspaceId") ?? undefined);
  const allowed = parsed.ok && parsed.config.trustedOrigins.includes(origin);
  const allowOrigin = () => {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Expose-Headers", "Content-Length");
    c.header("Vary", "Origin");
  };
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  c.header("Access-Control-Max-Age", "600");
  if (c.req.method === "OPTIONS") {
    if (allowed) allowOrigin();
    return c.body(null, allowed ? 204 : 403);
  }
  await next();
  if (allowed) allowOrigin();
});
authApiRoutes.get("/public/auth/login-config", async (c) => {
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
authApiRoutes.post("/admin/auth/methods", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const method = await new AuthRuntimeRepository(admin.config.db).upsertMethod(await c.req.json());
  return c.json({ method }, 201);
});
authApiRoutes.get("/admin/auth/methods", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const methods = await new AuthRuntimeRepository(admin.config.db).listMethods(c.req.query("workspaceId") ?? null, { github: Boolean(admin.config.github) });
  return c.json({ methods });
});
authApiRoutes.put("/admin/auth/methods/:methodId", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const body = await c.req.json() as Record<string, unknown>;
  const method = await new AuthRuntimeRepository(admin.config.db).upsertMethod({ ...body, providerId: body.providerId, type: body.type, title: body.title ?? c.req.param("methodId") });
  return c.json({ method });
});
authApiRoutes.post("/admin/auth/ui-contributions", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const contribution = await new AuthRuntimeRepository(admin.config.db).upsertUiContribution(await c.req.json());
  return c.json({ contribution }, 201);
});
authApiRoutes.get("/admin/auth/ui-contributions", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const contributions = await new AuthRuntimeRepository(admin.config.db).listUiContributions(c.req.query("workspaceId") ?? null);
  return c.json({ contributions });
});
authApiRoutes.put("/admin/auth/ui-contributions/:id", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const contribution = await new AuthRuntimeRepository(admin.config.db).upsertUiContribution({ ...await c.req.json() as Record<string, unknown>, contributionId: c.req.param("id") });
  return c.json({ contribution });
});
authApiRoutes.post("/admin/auth/policies", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const policy = await new AuthRuntimeRepository(admin.config.db).upsertPolicy(await c.req.json());
  return c.json({ policy }, 201);
});
authApiRoutes.get("/admin/auth/policy", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const policy = await new AuthRuntimeRepository(admin.config.db).publicPolicy(c.req.query("workspaceId") ?? null);
  return c.json({ policy });
});
authApiRoutes.put("/admin/auth/policy", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const body = await c.req.json();
  const policy = await new AuthRuntimeRepository(admin.config.db).upsertPolicy(body, { mailDeliveryAvailable: isInternalRequest(c) && (body as { mailDeliveryAvailable?: unknown }).mailDeliveryAvailable === true });
  return c.json({ policy });
});
authApiRoutes.get("/admin/auth/security-summary", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const summary = await new AuthRuntimeRepository(admin.config.db).securitySummary(c.req.query("workspaceId") ?? null, { github: Boolean(admin.config.github) });
  return c.json({ summary });
});
authApiRoutes.get("/admin/auth/sessions/summary", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const summary = await new AuthRuntimeRepository(admin.config.db).sessionsSummary();
  return c.json({ summary });
});
authApiRoutes.get("/admin/auth/security-bootstrap", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const repo = new AuthRuntimeRepository(admin.config.db);
  const workspaceId = c.req.query("workspaceId") ?? null;
  const [security, sessions] = await Promise.all([
    repo.securitySummary(workspaceId, { github: Boolean(admin.config.github) }),
    repo.sessionsSummary(),
  ]);
  return c.json({ summary: security, sessions });
});
authApiRoutes.post("/api/auth/sign-up/email", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  const policy = await new AuthRuntimeRepository(parsed.config.db).publicPolicy(null);
  if (policy.registrationMode !== "open") return c.json(errorResponse(failure("not_authorized", "Password registration is not open.")), 403);
  return createAuth(parsed.config).handler(new Request(new URL("/api/auth/sign-up/email", parsed.config.baseURL).toString(), {
    method: "POST",
    headers: { "content-type": "application/json", ...(c.req.header("origin") ? { origin: c.req.header("origin")! } : {}) },
    body: await c.req.text(),
  }));
});
function ownerSetupError(c: AuthContext, status: 400 | 403 | 404 | 409 | 422 | 503, code: AppErrorCode, message: string, details?: Record<string, unknown>) {
  return c.json(errorResponse(failure(code, message, details ? { details } : {})), status);
}
function ownerStatusError(c: AuthContext, setupStatus: string | undefined, emailMatches: boolean) {
  if (!setupStatus) return ownerSetupError(c, 404, "owner_setup_invalid_token", "Owner setup link is not available.");
  if (setupStatus === "expired") return ownerSetupError(c, 409, "owner_setup_expired", "Owner setup link has expired.");
  if (setupStatus === "consumed") return ownerSetupError(c, 409, "owner_setup_token_consumed", "Owner setup token has already been consumed.");
  if (setupStatus === "revoked") return ownerSetupError(c, 409, "owner_setup_token_revoked", "Owner setup token has been revoked.");
  if (setupStatus !== "pending") return ownerSetupError(c, 409, "owner_setup_invalid_token", "Owner setup token is not pending.");
  if (!emailMatches) return ownerSetupError(c, 403, "owner_setup_email_mismatch", "Owner setup token is not valid for this email.");
  return null;
}
async function parseBetterAuthError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return { raw: null, message: `Better Auth request failed: ${response.status}`, code: undefined as string | undefined };
  try {
    const payload = JSON.parse(text) as { code?: unknown; error?: unknown; message?: unknown };
    const code = typeof payload.code === "string" ? payload.code : undefined;
    const message = typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string"
        ? payload.error
        : `Better Auth request failed: ${response.status}`;
    return { raw: payload, message, code };
  } catch {
    return { raw: text, message: text, code: undefined as string | undefined };
  }
}
authApiRoutes.post("/setup/owner/sign-up/email", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  if (!parsed.config.core) return c.json(errorResponse(failure("dependency_unavailable", "Core service binding is required for owner setup.")), 503);
  const parsedBody = ownerSetupSignupRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsedBody.success) return ownerSetupError(c, 400, "owner_setup_invalid_token", "A valid owner setup token, email and password are required.");
  const body = parsedBody.data;
  const token = body.token;
  const email = body.email.trim().toLowerCase();
  const statusResponse = await parsed.config.core.fetch(`https://core.internal/setup/owner?token=${encodeURIComponent(token)}`);
  if (!statusResponse.ok) return ownerSetupError(c, 404, "owner_setup_invalid_token", "Owner setup link is not available.");
  const status = await statusResponse.json() as { setup?: { ownerEmail?: string; status?: string } };
  const statusError = ownerStatusError(c, status.setup?.status, status.setup?.ownerEmail?.toLowerCase() === email);
  if (statusError) return statusError;
  const existingUser = await parsed.config.db.prepare("SELECT id, email, name FROM user WHERE lower(email) = lower(?) LIMIT 1").bind(email).first<{ id: string; email: string; name: string | null }>();
  if (existingUser) {
    return ownerSetupError(c, 409, "owner_account_already_exists", "Owner account already exists. Sign in with the authorized owner email to activate this workspace.", { email });
  }
  const signUpHeaders = new Headers({ "content-type": "application/json" });
  const origin = c.req.header("origin");
  if (origin && parsed.config.trustedOrigins.includes(origin)) signUpHeaders.set("origin", origin);
  const signUpRequest = new Request(new URL("/api/auth/sign-up/email", parsed.config.baseURL).toString(), {
    method: "POST",
    headers: signUpHeaders,
    body: JSON.stringify({ email, password: body.password, name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : email }),
  });
  const response = await createAuth(parsed.config).handler(signUpRequest);
  if (!response.ok) {
    const betterAuth = await parseBetterAuthError(response);
    const passwordLike = response.status === 422 || /password/i.test(`${betterAuth.code ?? ""} ${betterAuth.message}`);
    return ownerSetupError(
      c,
      response.status === 422 ? 422 : 409,
      passwordLike ? "owner_password_invalid" : "owner_signup_failed",
      passwordLike ? "Owner password does not satisfy authentication policy." : "Owner account could not be created.",
      { betterAuthStatus: response.status, betterAuthBody: betterAuth.raw },
    );
  }
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
  if (!consumeResponse.ok) return ownerSetupError(c, 409, "owner_membership_activation_failed", "Owner account was created but workspace membership could not be finalized. Retry with the same setup link.");
  return response;
});
authApiRoutes.post("/api/auth/sign-in/email", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  const body = authSignInEmailRequestSchema.parse(await c.req.json());
  const response = await createAuth(parsed.config).handler(new Request(new URL("/api/auth/sign-in/email", parsed.config.baseURL).toString(), {
    method: "POST",
    headers: { "content-type": "application/json", ...(c.req.header("origin") ? { origin: c.req.header("origin")! } : {}) },
    body: JSON.stringify(body),
  }));
  return response;
});
authApiRoutes.post("/api/auth/sign-out", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  return createAuth(parsed.config).handler(new Request(new URL("/api/auth/sign-out", parsed.config.baseURL).toString(), { method: "POST", headers: { cookie: c.req.header("cookie") ?? "", authorization: c.req.header("authorization") ?? "", ...(c.req.header("origin") ? { origin: c.req.header("origin")! } : {}) } }));
});
authApiRoutes.post("/api/auth/update-user", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  const body = authUpdateUserRequestSchema.parse(await c.req.json());
  return createAuth(parsed.config).handler(new Request(new URL("/api/auth/update-user", parsed.config.baseURL).toString(), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: c.req.header("cookie") ?? "", authorization: c.req.header("authorization") ?? "" },
    body: JSON.stringify(body),
  }));
});
authApiRoutes.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  return createAuth(parsed.config).handler(c.req.raw);
});
app.route("/", authApiRoutes);
export type AuthApi = typeof authApiRoutes;
export default app;
