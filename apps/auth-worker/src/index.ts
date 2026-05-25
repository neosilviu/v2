import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "auth-worker" }));
app.all("/api/auth/*", (c) => c.json({ ok: false, message: "Better Auth boundary placeholder" }, 501));

export default app;
