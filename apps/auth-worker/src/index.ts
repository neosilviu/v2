import { Hono, type Context } from "hono";
import { deleteCookie, setSignedCookie } from "hono/cookie";
import { errorResponse, failure } from "@v2/feedback-runtime";
import {
  authSignInEmailRequestSchema,
  authSignUpEmailRequestSchema,
  authUpdateUserRequestSchema,
  ownerSetupSignupRequestSchema,
} from "@v2/auth-contracts";
import type { AppErrorCode } from "@v2/rpc-contracts";
import {
  createAuth,
  isAuthAdmin,
  parseAuthConfig,
  resolveAuthConfig,
  type AuthEnv,
} from "./auth";
import { AuthRuntimeRepository } from "./runtime-config";

let authApiRoutes = new Hono<{ Bindings: AuthEnv }>();
let app = new Hono<{ Bindings: AuthEnv }>();
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
  return (
    path.startsWith("/api/auth/") ||
    path.startsWith("/public/auth/") ||
    path.startsWith("/admin/auth/") ||
    path.startsWith("/setup/owner/")
  );
}

function resolveSecretRef(env: AuthEnv, ref: string | null | undefined) {
  if (!ref?.startsWith("env:")) return null;
  const key = ref.slice(4);
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function verifyTurnstileToken(
  c: AuthContext,
  token: string,
  secret: string,
) {
  const body = new URLSearchParams({ secret, response: token });
  const remoteIp = c.req.header("cf-connecting-ip");
  if (remoteIp) body.set("remoteip", remoteIp);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!response.ok) return false;
  const result = (await response.json().catch(() => null)) as {
    success?: unknown;
  } | null;
  return result?.success === true;
}

async function requireTurnstile(
  c: AuthContext,
  config: ResolvedAuthConfig,
  token: string | undefined,
) {
  const workspaceId = c.req.query("workspaceId") ?? config.workspaceId;
  const policy = await new AuthRuntimeRepository(config.db).publicPolicy(
    workspaceId,
  );
  if (!policy.turnstileEnabled) return null;
  if (!policy.turnstileSiteKey || !policy.turnstileSecretRef)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Turnstile is enabled but not fully configured.",
        ),
      ),
      503,
    );
  if (!token)
    return c.json(
      errorResponse(
        failure("validation_failed", "Turnstile verification is required."),
      ),
      403,
    );
  const secret = resolveSecretRef(c.env, policy.turnstileSecretRef);
  if (!secret)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Turnstile secret reference cannot be resolved server-side.",
        ),
      ),
      503,
    );
  if (!(await verifyTurnstileToken(c, token, secret)))
    return c.json(
      errorResponse(
        failure("not_authorized", "Turnstile verification failed."),
      ),
      403,
    );
  return null;
}

authApiRoutes = authApiRoutes.get("/health", (c) =>
  c.json({
    ok: true,
    service: "auth-worker",
    configured: parseAuthConfig(c.env).ok,
  }),
);
app = app.use("*", async (c, next) => {
  const timingStart = performance.now();
  try {
    await next();
  } finally {
    if (
      c.env.DEPLOYMENT_ENV !== "production" ||
      c.req.header("x-v2-server-timing") === "1"
    )
      c.header("Server-Timing", serverTiming(timingStart));
  }
});
app = app.use("*", async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  if (!origin || !needsBrowserCors(c.req.path)) {
    await next();
    return;
  }
  const parsed = await resolveAuthConfig(
    c.env,
    c.req.query("workspaceId") ?? undefined,
  );
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
authApiRoutes = authApiRoutes.get("/public/auth/login-config", async (c) => {
  const parsed = await resolveAuthConfig(
    c.env,
    c.req.query("workspaceId") ?? undefined,
  );
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  const config = await new AuthRuntimeRepository(
    parsed.config.db,
  ).publicLoginConfig(c.req.query("workspaceId") ?? null, {
    github: Boolean(parsed.config.github),
  });
  return c.json(config);
});
authApiRoutes = authApiRoutes.get("/public/auth/profile", async (c) => {
  const parsed = await resolveAuthConfig(
    c.env,
    c.req.query("workspaceId") ?? undefined,
  );
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  const current = await currentAuthSession(c, parsed.config);
  const userId = typeof current?.user?.id === "string" ? current.user.id : "";
  if (!userId)
    return c.json(
      errorResponse(
        failure("not_authenticated", "Authentication is required."),
      ),
      401,
    );
  const repo = new AuthRuntimeRepository(
    parsed.config.db,
    new Set(parsed.config.adminEmails),
  );
  const users = await repo.listUsers();
  const profile = users.find((user) => user.id === userId);
  if (!profile)
    return c.json(
      errorResponse(
        failure("not_found", "Current user profile could not be loaded."),
      ),
      404,
    );
  return c.json({
    profile: {
      ...profile,
      passkeys: await repo.listPasskeys(userId),
      activeSessions: await repo.listSessions(
        userId,
        current?.session?.id ?? null,
      ),
    },
  });
});
authApiRoutes = authApiRoutes.get("/api/auth/get-session", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  const response = await createAuth(parsed.config).handler(c.req.raw);
  if (!response.ok) return response;
  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as {
    user?: { id?: unknown; email?: unknown } | null;
  } | null;
  const userId = typeof payload?.user?.id === "string" ? payload.user.id : "";
  if (!userId) return response;
  const disabled = await parsed.config.db
    .prepare("SELECT disabled_at FROM user WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<{ disabled_at: number | string | null }>();
  if (!disabled?.disabled_at) return response;
  return c.json(
    errorResponse(failure("not_authorized", "Account is disabled.")),
    401,
  );
});
async function requireAdmin(c: AuthContext) {
  const parsed = await resolveAuthConfig(
    c.env,
    c.req.query("workspaceId") ?? undefined,
  );
  if (!parsed.ok)
    return {
      ok: false as const,
      response: c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      ),
    };
  if (isInternalRequest(c)) return { ok: true as const, config: parsed.config };
  if (!(await isAuthAdmin(parsed.config, c.req.raw.headers)))
    return {
      ok: false as const,
      response: c.json(
        errorResponse(
          failure("not_authorized", "Auth administrator access is required."),
        ),
        403,
      ),
    };
  return { ok: true as const, config: parsed.config };
}
authApiRoutes = authApiRoutes.post("/admin/auth/methods", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const method = await new AuthRuntimeRepository(admin.config.db).upsertMethod(
    await c.req.json(),
  );
  return c.json({ method }, 201);
});
authApiRoutes = authApiRoutes.get("/admin/auth/methods", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const methods = await new AuthRuntimeRepository(admin.config.db).listMethods(
    c.req.query("workspaceId") ?? null,
    { github: Boolean(admin.config.github) },
  );
  return c.json({ methods });
});
authApiRoutes = authApiRoutes.put(
  "/admin/auth/methods/:methodId",
  async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return admin.response;
    const body = (await c.req.json()) as Record<string, unknown>;
    const method = await new AuthRuntimeRepository(
      admin.config.db,
    ).upsertMethod({
      ...body,
      providerId: body.providerId,
      type: body.type,
      title: body.title ?? c.req.param("methodId"),
    });
    return c.json({ method });
  },
);
authApiRoutes = authApiRoutes.post(
  "/admin/auth/ui-contributions",
  async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return admin.response;
    const contribution = await new AuthRuntimeRepository(
      admin.config.db,
    ).upsertUiContribution(await c.req.json());
    return c.json({ contribution }, 201);
  },
);
authApiRoutes = authApiRoutes.get("/admin/auth/ui-contributions", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const contributions = await new AuthRuntimeRepository(
    admin.config.db,
  ).listUiContributions(c.req.query("workspaceId") ?? null);
  return c.json({ contributions });
});
authApiRoutes = authApiRoutes.put(
  "/admin/auth/ui-contributions/:id",
  async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return admin.response;
    const contribution = await new AuthRuntimeRepository(
      admin.config.db,
    ).upsertUiContribution({
      ...((await c.req.json()) as Record<string, unknown>),
      contributionId: c.req.param("id"),
    });
    return c.json({ contribution });
  },
);
authApiRoutes = authApiRoutes.post("/admin/auth/policies", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const policy = await new AuthRuntimeRepository(admin.config.db).upsertPolicy(
    await c.req.json(),
  );
  return c.json({ policy }, 201);
});
authApiRoutes = authApiRoutes.get("/admin/auth/policy", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const policy = await new AuthRuntimeRepository(admin.config.db).publicPolicy(
    c.req.query("workspaceId") ?? null,
  );
  return c.json({ policy });
});
authApiRoutes = authApiRoutes.put("/admin/auth/policy", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const body = await c.req.json();
  const policy = await new AuthRuntimeRepository(admin.config.db).upsertPolicy(
    body,
    {
      mailDeliveryAvailable:
        isInternalRequest(c) &&
        (body as { mailDeliveryAvailable?: unknown }).mailDeliveryAvailable ===
          true,
    },
  );
  return c.json({ policy });
});
authApiRoutes = authApiRoutes.get("/admin/auth/security-summary", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const summary = await new AuthRuntimeRepository(
    admin.config.db,
  ).securitySummary(c.req.query("workspaceId") ?? null, {
    github: Boolean(admin.config.github),
  });
  return c.json({ summary });
});
authApiRoutes = authApiRoutes.get("/admin/auth/sessions/summary", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const summary = await new AuthRuntimeRepository(
    admin.config.db,
  ).sessionsSummary();
  return c.json({ summary });
});
authApiRoutes = authApiRoutes.get("/admin/auth/sessions", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin.ok) return admin.response;
  const sessions = await new AuthRuntimeRepository(
    admin.config.db,
    new Set(admin.config.adminEmails),
  ).listActiveSessions();
  return c.json({ sessions });
});
authApiRoutes = authApiRoutes.get(
  "/admin/auth/security-bootstrap",
  async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return admin.response;
    const repo = new AuthRuntimeRepository(
      admin.config.db,
      new Set(admin.config.adminEmails),
    );
    const workspaceId = c.req.query("workspaceId") ?? null;
    const [security, sessions] = await Promise.all([
      repo.securitySummary(workspaceId, {
        github: Boolean(admin.config.github),
      }),
      repo.sessionsSummary(),
    ]);
    return c.json({ summary: security, sessions });
  },
);
authApiRoutes = authApiRoutes.get(
  "/admin/auth/impersonation-sessions",
  async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return admin.response;
    return c.json({
      sessions: await new AuthRuntimeRepository(
        admin.config.db,
        new Set(admin.config.adminEmails),
      ).listImpersonationSessions(c.req.query("workspaceId") ?? null),
    });
  },
);
authApiRoutes = authApiRoutes.get("/internal/auth/users", async (c) => {
  if (!isInternalRequest(c))
    return c.json(
      errorResponse(
        failure(
          "not_authorized",
          "Internal user administration requires a service binding.",
        ),
      ),
      403,
    );
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  return c.json({
    users: await new AuthRuntimeRepository(
      parsed.config.db,
      new Set(parsed.config.adminEmails),
    ).listUsers(),
  });
});
authApiRoutes = authApiRoutes.post(
  "/internal/auth/users/:userId/disable",
  async (c) => {
    if (!isInternalRequest(c))
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Internal user administration requires a service binding.",
          ),
        ),
        403,
      );
    const parsed = await resolveAuthConfig(c.env);
    if (!parsed.ok)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      );
    const repo = new AuthRuntimeRepository(
      parsed.config.db,
      new Set(parsed.config.adminEmails),
    );
    const userId = c.req.param("userId");
    const user = await repo.userById(userId);
    if (!user)
      return c.json(
        errorResponse(failure("not_found", "User is not available.")),
        404,
      );
    if (user.isPlatformAdmin)
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Platform superadmin accounts cannot be disabled.",
          ),
        ),
        403,
      );
    return c.json({ user: await repo.disableUser(userId) });
  },
);
authApiRoutes = authApiRoutes.delete(
  "/internal/auth/users/:userId",
  async (c) => {
    if (!isInternalRequest(c))
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Internal user administration requires a service binding.",
          ),
        ),
        403,
      );
    const parsed = await resolveAuthConfig(c.env);
    if (!parsed.ok)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      );
    const repo = new AuthRuntimeRepository(
      parsed.config.db,
      new Set(parsed.config.adminEmails),
    );
    const userId = c.req.param("userId");
    const user = await repo.userById(userId);
    if (!user)
      return c.json(
        errorResponse(failure("not_found", "User is not available.")),
        404,
      );
    if (user.isPlatformAdmin)
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Platform superadmin accounts cannot be deleted.",
          ),
        ),
        403,
      );
    await repo.deleteUser(userId);
    return c.body(null, 204);
  },
);
authApiRoutes = authApiRoutes.get(
  "/internal/auth/security-bootstrap",
  async (c) => {
    if (!isInternalRequest(c))
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Internal security lookup requires a service binding.",
          ),
        ),
        403,
      );
    const parsed = await resolveAuthConfig(
      c.env,
      c.req.query("workspaceId") ?? undefined,
    );
    if (!parsed.ok)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      );
    const repo = new AuthRuntimeRepository(
      parsed.config.db,
      new Set(parsed.config.adminEmails),
    );
    const workspaceId = c.req.query("workspaceId") ?? null;
    const [summary, sessions] = await Promise.all([
      repo.securitySummary(workspaceId, {
        github: Boolean(parsed.config.github),
      }),
      repo.sessionsSummary(),
    ]);
    return c.json({ summary, sessions });
  },
);
type ResolvedAuthConfig = Extract<
  Awaited<ReturnType<typeof resolveAuthConfig>>,
  { ok: true }
>["config"];
async function currentAuthSession(c: AuthContext, config: ResolvedAuthConfig) {
  const headers = new Headers();
  const cookie = c.req.header("cookie");
  const authorization = c.req.header("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  const response = await createAuth(config).handler(
    new Request(new URL("/api/auth/get-session", config.baseURL).toString(), {
      headers,
    }),
  );
  if (!response.ok) return null;
  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as {
    session?: {
      id?: string;
      userId?: string;
      impersonatedBy?: string | null;
    } | null;
    user?: { id?: string; email?: string; name?: string | null } | null;
  } | null;
  const userId = typeof payload?.user?.id === "string" ? payload.user.id : "";
  if (userId) {
    const disabled = await config.db
      .prepare("SELECT disabled_at FROM user WHERE id = ? LIMIT 1")
      .bind(userId)
      .first<{ disabled_at: number | string | null }>();
    if (disabled?.disabled_at) return null;
  }
  return payload;
}

authApiRoutes = authApiRoutes.get(
  "/internal/auth/impersonation/current",
  async (c) => {
    if (!isInternalRequest(c))
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Internal impersonation lookup requires a service binding.",
          ),
        ),
        403,
      );
    const parsed = await resolveAuthConfig(c.env);
    if (!parsed.ok)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      );
    const current = await currentAuthSession(c, parsed.config);
    const sessionId =
      typeof current?.session?.id === "string" ? current.session.id : "";
    if (!sessionId) return c.json({ impersonation: null });
    const impersonation = await new AuthRuntimeRepository(
      parsed.config.db,
    ).activeImpersonationForSession(sessionId);
    return c.json({ impersonation });
  },
);

authApiRoutes = authApiRoutes.post(
  "/internal/auth/impersonation/start",
  async (c) => {
    if (!isInternalRequest(c))
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Internal impersonation start requires a service binding.",
          ),
        ),
        403,
      );
    const parsed = await resolveAuthConfig(c.env);
    if (!parsed.ok)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      );
    const body = (await c.req.json().catch(() => null)) as {
      expectedActorUserId?: unknown;
      subjectUserId?: unknown;
      workspaceId?: unknown;
      reason?: unknown;
      durationSeconds?: unknown;
    } | null;
    if (
      typeof body?.expectedActorUserId !== "string" ||
      typeof body?.subjectUserId !== "string" ||
      typeof body?.workspaceId !== "string" ||
      typeof body?.reason !== "string" ||
      !body.reason.trim()
    ) {
      return c.json(
        errorResponse(
          failure(
            "validation_failed",
            "expectedActorUserId, subjectUserId, workspaceId and reason are required.",
          ),
        ),
        400,
      );
    }
    const auth = createAuth(parsed.config);
    const context = await auth.$context;
    const current = await currentAuthSession(c, parsed.config);
    const actorSessionId =
      typeof current?.session?.id === "string" ? current.session.id : "";
    const actorUserId =
      typeof current?.user?.id === "string" ? current.user.id : "";
    if (!actorSessionId || !actorUserId)
      return c.json(
        errorResponse(
          failure("not_authenticated", "An active actor session is required."),
        ),
        401,
      );
    if (actorUserId !== body.expectedActorUserId)
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "The authenticated actor does not match the authorized actor.",
          ),
        ),
        403,
      );
    if (actorUserId === body.subjectUserId)
      return c.json(
        errorResponse(
          failure("validation_failed", "A user cannot impersonate themselves."),
        ),
        400,
      );
    const repo = new AuthRuntimeRepository(
      parsed.config.db,
      new Set(parsed.config.adminEmails),
    );
    const actor = await parsed.config.db
      .prepare("SELECT id, email FROM user WHERE id = ? LIMIT 1")
      .bind(actorUserId)
      .first<{ id: string; email: string }>();
    const subject = await parsed.config.db
      .prepare("SELECT id, email FROM user WHERE id = ? LIMIT 1")
      .bind(body.subjectUserId)
      .first<{ id: string; email: string }>();
    if (
      !actor ||
      !parsed.config.adminEmails.includes(actor.email.toLowerCase())
    )
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Only platform superadmin accounts may start impersonation.",
          ),
        ),
        403,
      );
    if (
      subject &&
      parsed.config.adminEmails.includes(subject.email.toLowerCase())
    )
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Platform superadmin accounts cannot be impersonated.",
          ),
        ),
        403,
      );
    if (
      current?.session?.impersonatedBy ||
      (await repo.activeImpersonationForSession(actorSessionId))
    ) {
      return c.json(
        errorResponse(
          failure("not_authorized", "Impersonation chaining is not allowed."),
        ),
        403,
      );
    }
    const session = await context.internalAdapter.createSession(
      body.subjectUserId,
      true,
      {
        impersonatedBy: actorUserId,
        expiresAt: new Date(
          Date.now() +
            (typeof body.durationSeconds === "number" &&
            Number.isFinite(body.durationSeconds)
              ? body.durationSeconds
              : 3600) *
              1000,
        ),
      },
      true,
    );
    if (!session)
      return c.json(
        errorResponse(
          failure(
            "internal_error",
            "Impersonation session could not be created.",
          ),
        ),
        500,
      );
    const token = String(session.token);
    const expiresAt =
      typeof session.expiresAt === "string"
        ? session.expiresAt
        : new Date(session.expiresAt as Date).toISOString();
    const impersonation = await repo.startImpersonation({
      actorUserId,
      actorSessionId,
      subjectUserId: body.subjectUserId,
      workspaceId: body.workspaceId,
      reason: body.reason.trim(),
      sessionId: session.id,
      expiresAt,
    });
    await setSignedCookie(
      c,
      context.authCookies.sessionToken.name,
      token,
      context.secret,
      context.authCookies.sessionToken.attributes,
    );
    return c.json({ impersonation }, 201);
  },
);

authApiRoutes = authApiRoutes.post(
  "/internal/auth/impersonation/stop",
  async (c) => {
    if (!isInternalRequest(c))
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Internal impersonation stop requires a service binding.",
          ),
        ),
        403,
      );
    const parsed = await resolveAuthConfig(c.env);
    if (!parsed.ok)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      );
    const auth = createAuth(parsed.config);
    const context = await auth.$context;
    const current = await currentAuthSession(c, parsed.config);
    const impersonatedSessionId =
      typeof current?.session?.id === "string" ? current.session.id : "";
    if (!impersonatedSessionId)
      return c.json(
        errorResponse(
          failure(
            "not_authenticated",
            "An active impersonated session is required.",
          ),
        ),
        401,
      );
    const ended = await new AuthRuntimeRepository(
      parsed.config.db,
      new Set(parsed.config.adminEmails),
    ).stopImpersonationForSession(impersonatedSessionId);
    if (!ended)
      return c.json(
        errorResponse(
          failure(
            "not_found",
            "Active impersonation session is not available.",
          ),
        ),
        404,
      );
    if (ended.actorToken) {
      await setSignedCookie(
        c,
        context.authCookies.sessionToken.name,
        ended.actorToken,
        context.secret,
        context.authCookies.sessionToken.attributes,
      );
    } else {
      deleteCookie(
        c,
        context.authCookies.sessionToken.name,
        context.authCookies.sessionToken.attributes,
      );
    }
    return c.json({
      impersonation: ended.impersonation,
      restored: Boolean(ended.actorToken),
      reauthenticationRequired: !ended.actorToken,
    });
  },
);
authApiRoutes = authApiRoutes.post("/api/auth/sign-up/email", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  const parsed = await resolveAuthConfig(c.env, workspaceId ?? undefined);
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  const body = authSignUpEmailRequestSchema.parse(await c.req.json());
  const policy = await new AuthRuntimeRepository(parsed.config.db).publicPolicy(
    workspaceId ?? parsed.config.workspaceId,
  );
  if (policy.registrationMode !== "open")
    return c.json(
      errorResponse(
        failure("not_authorized", "Password registration is not open."),
      ),
      403,
    );
  const turnstileError = await requireTurnstile(
    c,
    parsed.config,
    body.turnstileToken,
  );
  if (turnstileError) return turnstileError;
  return createAuth(parsed.config).handler(
    new Request(
      new URL("/api/auth/sign-up/email", parsed.config.baseURL).toString(),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(c.req.header("origin")
            ? { origin: c.req.header("origin")! }
            : {}),
        },
        body: JSON.stringify({
          email: body.email,
          password: body.password,
          name: body.name,
        }),
      },
    ),
  );
});
function ownerSetupError(
  c: AuthContext,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 503,
  code: AppErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  return c.json(
    errorResponse(failure(code, message, details ? { details } : {})),
    status,
  );
}
function ownerStatusError(
  c: AuthContext,
  setupStatus: string | undefined,
  emailMatches: boolean,
) {
  if (!setupStatus)
    return ownerSetupError(
      c,
      404,
      "owner_setup_invalid_token",
      "Owner setup link is not available.",
    );
  if (setupStatus === "expired")
    return ownerSetupError(
      c,
      409,
      "owner_setup_expired",
      "Owner setup link has expired.",
    );
  if (setupStatus === "consumed")
    return ownerSetupError(
      c,
      409,
      "owner_setup_token_consumed",
      "Owner setup token has already been consumed.",
    );
  if (setupStatus === "revoked")
    return ownerSetupError(
      c,
      409,
      "owner_setup_token_revoked",
      "Owner setup token has been revoked.",
    );
  if (setupStatus !== "pending")
    return ownerSetupError(
      c,
      409,
      "owner_setup_invalid_token",
      "Owner setup token is not pending.",
    );
  if (!emailMatches)
    return ownerSetupError(
      c,
      403,
      "owner_setup_email_mismatch",
      "Owner setup token is not valid for this email.",
    );
  return null;
}
async function parseBetterAuthError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text)
    return {
      raw: null,
      message: `Better Auth request failed: ${response.status}`,
      code: undefined as string | undefined,
    };
  try {
    const payload = JSON.parse(text) as {
      code?: unknown;
      error?: unknown;
      message?: unknown;
    };
    const code = typeof payload.code === "string" ? payload.code : undefined;
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : `Better Auth request failed: ${response.status}`;
    return { raw: payload, message, code };
  } catch {
    return { raw: text, message: text, code: undefined as string | undefined };
  }
}
authApiRoutes = authApiRoutes.post("/setup/owner/sign-up/email", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  if (!parsed.config.core)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Core service binding is required for owner setup.",
        ),
      ),
      503,
    );
  const parsedBody = ownerSetupSignupRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsedBody.success)
    return ownerSetupError(
      c,
      400,
      "owner_setup_invalid_token",
      "A valid owner setup token, email and password are required.",
    );
  const body = parsedBody.data;
  const token = body.token;
  const email = body.email.trim().toLowerCase();
  const statusResponse = await parsed.config.core.fetch(
    `https://core.internal/setup/owner?token=${encodeURIComponent(token)}`,
  );
  if (!statusResponse.ok)
    return ownerSetupError(
      c,
      404,
      "owner_setup_invalid_token",
      "Owner setup link is not available.",
    );
  const status = (await statusResponse.json()) as {
    setup?: { ownerEmail?: string; status?: string };
  };
  const statusError = ownerStatusError(
    c,
    status.setup?.status,
    status.setup?.ownerEmail?.toLowerCase() === email,
  );
  if (statusError) return statusError;
  const existingUser = await parsed.config.db
    .prepare(
      "SELECT id, email, name FROM user WHERE lower(email) = lower(?) LIMIT 1",
    )
    .bind(email)
    .first<{ id: string; email: string; name: string | null }>();
  if (existingUser) {
    return ownerSetupError(
      c,
      409,
      "owner_account_already_exists",
      "Owner account already exists. Sign in with the authorized owner email to activate this workspace.",
      { email },
    );
  }
  const signUpHeaders = new Headers({ "content-type": "application/json" });
  const origin = c.req.header("origin");
  if (origin && parsed.config.trustedOrigins.includes(origin))
    signUpHeaders.set("origin", origin);
  const signUpRequest = new Request(
    new URL("/api/auth/sign-up/email", parsed.config.baseURL).toString(),
    {
      method: "POST",
      headers: signUpHeaders,
      body: JSON.stringify({
        email,
        password: body.password,
        name:
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : email,
      }),
    },
  );
  const response = await createAuth(parsed.config).handler(signUpRequest);
  if (!response.ok) {
    const betterAuth = await parseBetterAuthError(response);
    const passwordLike =
      response.status === 422 ||
      /password/i.test(`${betterAuth.code ?? ""} ${betterAuth.message}`);
    return ownerSetupError(
      c,
      response.status === 422 ? 422 : 409,
      passwordLike ? "owner_password_invalid" : "owner_signup_failed",
      passwordLike
        ? "Owner password does not satisfy authentication policy."
        : "Owner account could not be created.",
      { betterAuthStatus: response.status, betterAuthBody: betterAuth.raw },
    );
  }
  const payload = (await response
    .clone()
    .json()
    .catch(() => ({}))) as {
    user?: { id?: unknown; email?: unknown; name?: unknown };
  };
  const user =
    payload.user &&
    typeof payload.user.id === "string" &&
    typeof payload.user.email === "string"
      ? {
          id: payload.user.id,
          email: payload.user.email,
          ...(typeof payload.user.name === "string"
            ? { name: payload.user.name }
            : {}),
        }
      : await parsed.config.db
          .prepare(
            "SELECT id, email, name FROM user WHERE lower(email) = lower(?) LIMIT 1",
          )
          .bind(email)
          .first<{ id: string; email: string; name: string }>();
  if (!user)
    return c.json(
      errorResponse(failure("conflict", "Owner account was not created.")),
      409,
    );
  const consumeResponse = await parsed.config.core.fetch(
    "https://core.internal/internal/setup/owner/consume",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, user }),
    },
  );
  if (!consumeResponse.ok)
    return ownerSetupError(
      c,
      409,
      "owner_membership_activation_failed",
      "Owner account was created but workspace membership could not be finalized. Retry with the same setup link.",
    );
  return response;
});
authApiRoutes = authApiRoutes.post(
  "/setup/owner/activate-existing",
  async (c) => {
    const parsed = await resolveAuthConfig(c.env);
    if (!parsed.ok)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      );
    if (!parsed.config.core)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Core service binding is required for owner setup.",
          ),
        ),
        503,
      );
    const body = (await c.req.json().catch(() => null)) as {
      token?: unknown;
    } | null;
    const token = typeof body?.token === "string" ? body.token : "";
    if (token.length < 24)
      return ownerSetupError(
        c,
        400,
        "owner_setup_invalid_token",
        "A valid owner setup token is required.",
      );
    const current = await currentAuthSession(c, parsed.config);
    const user =
      current?.user &&
      typeof current.user.id === "string" &&
      typeof current.user.email === "string"
        ? {
            id: current.user.id,
            email: current.user.email,
            ...(typeof current.user.name === "string"
              ? { name: current.user.name }
              : {}),
          }
        : null;
    if (!user)
      return ownerSetupError(
        c,
        401,
        "not_authenticated",
        "Sign in with the authorized owner account before activating this workspace.",
      );
    const statusResponse = await parsed.config.core.fetch(
      `https://core.internal/setup/owner?token=${encodeURIComponent(token)}`,
    );
    if (!statusResponse.ok)
      return ownerSetupError(
        c,
        404,
        "owner_setup_invalid_token",
        "Owner setup link is not available.",
      );
    const status = (await statusResponse.json()) as {
      setup?: { ownerEmail?: string; status?: string };
    };
    const statusError = ownerStatusError(
      c,
      status.setup?.status,
      status.setup?.ownerEmail?.toLowerCase() ===
        user.email.trim().toLowerCase(),
    );
    if (statusError) return statusError;
    const consumeResponse = await parsed.config.core.fetch(
      "https://core.internal/internal/setup/owner/consume",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, user }),
      },
    );
    if (!consumeResponse.ok) {
      const consumeBody = (await consumeResponse.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      if (consumeBody?.error?.code === "owner_setup_token_consumed")
        return ownerSetupError(
          c,
          409,
          "owner_setup_token_consumed",
          "Owner setup token has already been consumed.",
        );
      if (
        consumeBody?.error?.code === "owner_setup_email_mismatch" ||
        consumeResponse.status === 403
      )
        return ownerSetupError(
          c,
          403,
          "owner_setup_email_mismatch",
          "Owner setup token is not valid for this email.",
        );
      return ownerSetupError(
        c,
        409,
        "owner_membership_activation_failed",
        "Workspace membership could not be finalized. Retry with the same setup link.",
      );
    }
    return c.json(await consumeResponse.json());
  },
);
authApiRoutes = authApiRoutes.post("/api/auth/sign-in/email", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  const body = authSignInEmailRequestSchema.parse(await c.req.json());
  const turnstileError = await requireTurnstile(
    c,
    parsed.config,
    body.turnstileToken,
  );
  if (turnstileError) return turnstileError;
  const user = await new AuthRuntimeRepository(
    parsed.config.db,
    new Set(parsed.config.adminEmails),
  ).userByEmail(body.email);
  if (user?.disabledAt)
    return c.json(
      errorResponse(failure("not_authorized", "Account is disabled.")),
      403,
    );
  const response = await createAuth(parsed.config).handler(
    new Request(
      new URL("/api/auth/sign-in/email", parsed.config.baseURL).toString(),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(c.req.header("origin")
            ? { origin: c.req.header("origin")! }
            : {}),
        },
        body: JSON.stringify({ email: body.email, password: body.password }),
      },
    ),
  );
  return response;
});
authApiRoutes = authApiRoutes.post("/api/auth/sign-out", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  return createAuth(parsed.config).handler(
    new Request(
      new URL("/api/auth/sign-out", parsed.config.baseURL).toString(),
      {
        method: "POST",
        headers: {
          cookie: c.req.header("cookie") ?? "",
          authorization: c.req.header("authorization") ?? "",
          ...(c.req.header("origin")
            ? { origin: c.req.header("origin")! }
            : {}),
        },
      },
    ),
  );
});
authApiRoutes = authApiRoutes.post("/api/auth/update-user", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  const body = authUpdateUserRequestSchema.parse(await c.req.json());
  const current = await currentAuthSession(c, parsed.config);
  const userId = typeof current?.user?.id === "string" ? current.user.id : "";
  if (!userId)
    return c.json(
      errorResponse(
        failure("not_authenticated", "Authentication is required."),
      ),
      401,
    );
  const existing = await parsed.config.db
    .prepare(
      "SELECT id, email, name, language, location, timezone FROM user WHERE id = ? LIMIT 1",
    )
    .bind(userId)
    .first<{
      id: string;
      email: string;
      name: string;
      language: string | null;
      location: string | null;
      timezone: string | null;
    }>();
  if (!existing)
    return c.json(
      errorResponse(
        failure("not_found", "Current user profile could not be loaded."),
      ),
      404,
    );
  const nextName =
    typeof body.name === "string" ? body.name.trim() : existing.name.trim();
  if (!nextName)
    return c.json(
      errorResponse(
        failure("validation_failed", "A display name is required."),
      ),
      400,
    );
  const nextLanguage =
    typeof body.language === "string"
      ? body.language.trim() || null
      : existing.language;
  const nextLocation =
    typeof body.location === "string"
      ? body.location.trim() || null
      : existing.location;
  const nextTimezone =
    typeof body.timezone === "string"
      ? body.timezone.trim() || null
      : existing.timezone;
  await parsed.config.db
    .prepare(
      "UPDATE user SET name = ?, language = ?, location = ?, timezone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(nextName, nextLanguage, nextLocation, nextTimezone, userId)
    .run();
  const updated = await parsed.config.db
    .prepare(
      "SELECT id, email, name, language, location, timezone FROM user WHERE id = ? LIMIT 1",
    )
    .bind(userId)
    .first<{
      id: string;
      email: string;
      name: string;
      language: string | null;
      location: string | null;
      timezone: string | null;
    }>();
  return c.json({
    user: updated ?? {
      ...existing,
      name: nextName,
      language: nextLanguage,
      location: nextLocation,
      timezone: nextTimezone,
    },
  });
});
authApiRoutes = authApiRoutes.get("/api/auth/profile/sessions", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  const current = await currentAuthSession(c, parsed.config);
  const userId = typeof current?.user?.id === "string" ? current.user.id : "";
  if (!userId)
    return c.json(
      errorResponse(
        failure("not_authenticated", "Authentication is required."),
      ),
      401,
    );
  const repo = new AuthRuntimeRepository(
    parsed.config.db,
    new Set(parsed.config.adminEmails),
  );
  return c.json({
    sessions: await repo.listSessions(userId, current?.session?.id ?? null),
  });
});
authApiRoutes = authApiRoutes.post(
  "/api/auth/profile/sessions/revoke",
  async (c) => {
    const parsed = await resolveAuthConfig(c.env);
    if (!parsed.ok)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      );
    const body = (await c.req.json().catch(() => null)) as {
      sessionId?: unknown;
    } | null;
    const sessionId =
      typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId)
      return c.json(
        errorResponse(failure("validation_failed", "sessionId is required.")),
        400,
      );
    const current = await currentAuthSession(c, parsed.config);
    const userId = typeof current?.user?.id === "string" ? current.user.id : "";
    const currentSessionId =
      typeof current?.session?.id === "string" ? current.session.id : "";
    if (!userId || !currentSessionId)
      return c.json(
        errorResponse(
          failure("not_authenticated", "Authentication is required."),
        ),
        401,
      );
    const auth = createAuth(parsed.config);
    const context = await auth.$context;
    const repo = new AuthRuntimeRepository(
      parsed.config.db,
      new Set(parsed.config.adminEmails),
    );
    const result = await repo.revokeSession(
      userId,
      sessionId,
      currentSessionId,
    );
    if (!result.revoked)
      return c.json(
        errorResponse(failure("not_found", "Session could not be found.")),
        404,
      );
    if (result.currentSessionRevoked)
      deleteCookie(
        c,
        context.authCookies.sessionToken.name,
        context.authCookies.sessionToken.attributes,
      );
    return c.json({
      revoked: true,
      currentSessionRevoked: result.currentSessionRevoked,
    });
  },
);
authApiRoutes = authApiRoutes.post(
  "/api/auth/profile/sessions/revoke-others",
  async (c) => {
    const parsed = await resolveAuthConfig(c.env);
    if (!parsed.ok)
      return c.json(
        errorResponse(
          failure(
            "dependency_unavailable",
            "Authentication service is not configured.",
          ),
        ),
        503,
      );
    const current = await currentAuthSession(c, parsed.config);
    const userId = typeof current?.user?.id === "string" ? current.user.id : "";
    const currentSessionId =
      typeof current?.session?.id === "string" ? current.session.id : "";
    if (!userId || !currentSessionId)
      return c.json(
        errorResponse(
          failure("not_authenticated", "Authentication is required."),
        ),
        401,
      );
    const repo = new AuthRuntimeRepository(
      parsed.config.db,
      new Set(parsed.config.adminEmails),
    );
    const result = await repo.revokeOtherSessions(userId, currentSessionId);
    return c.json(result);
  },
);
authApiRoutes = authApiRoutes.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const parsed = await resolveAuthConfig(c.env);
  if (!parsed.ok)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Authentication service is not configured.",
        ),
      ),
      503,
    );
  const response = await createAuth(parsed.config).handler(c.req.raw);
  if (!response.ok) return response;
  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as {
    user?: { id?: unknown; email?: unknown } | null;
  } | null;
  const userId = typeof payload?.user?.id === "string" ? payload.user.id : "";
  if (!userId) return response;
  const disabled = await parsed.config.db
    .prepare("SELECT disabled_at FROM user WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<{ disabled_at: number | string | null }>();
  if (!disabled?.disabled_at) return response;
  return c.json(
    errorResponse(failure("not_authorized", "Account is disabled.")),
    401,
  );
});
app = app.route("/", authApiRoutes);
export type AuthApi = typeof authApiRoutes;
export default app;
