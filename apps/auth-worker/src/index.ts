import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth, parseAuthConfig, type AuthEnv } from "./auth";

const app = new Hono<{ Bindings: AuthEnv }>();

app.get("/health", (c) => {
  const parsed = parseAuthConfig(c.env);
  return c.json({ ok: true, service: "auth-worker", configured: parsed.ok });
});

app.use("/api/auth/*", cors({
  origin: (origin, c) => {
    if (!origin) return null;
    const parsed = parseAuthConfig(c.env as AuthEnv);
    if (!parsed.ok) return null;
    return parsed.config.trustedOrigins.includes(origin) ? origin : null;
  },
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}));

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const parsed = parseAuthConfig(c.env);
  if (!parsed.ok) return c.json({ error: { code: "auth_not_configured", message: "Authentication service is not configured" } }, 500);
  return createAuth(parsed.config).handler(c.req.raw);
});

export default app;
