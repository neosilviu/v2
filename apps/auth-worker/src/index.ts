import { Hono } from "hono";
import { createAuth, type AuthEnv } from "./auth";

const app = new Hono<{ Bindings: AuthEnv }>();
app.get("/health", (c) => c.json({ ok: true, service: "auth-worker" }));
app.on(["POST", "GET"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
export default app;
