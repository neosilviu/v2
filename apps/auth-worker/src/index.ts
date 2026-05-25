import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { createAuth, parseAuthConfig, type AuthEnv } from "./auth";

const app = new Hono<{ Bindings: AuthEnv }>();

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
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const parsed = parseAuthConfig(c.env);
  if (!parsed.ok) return c.json(errorResponse(failure("dependency_unavailable", "Authentication service is not configured.")), 503);
  return createAuth(parsed.config).handler(c.req.raw);
});

export default app;
