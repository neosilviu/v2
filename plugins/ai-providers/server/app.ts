import { Hono } from "hono";
import { aiProvidersPlugin } from "../src/index";

const app = new Hono();
const providers = aiProvidersPlugin.contributes.providers.map((provider) => ({ id: provider.id, title: provider.title }));

app.get("/health", (c) => c.json({ ok: true, service: "ai-providers" }));
app.get("/providers", (c) => c.json({ providers }));

export default app;
