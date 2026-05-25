import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { createChannelRequestSchema, createProviderBindingRequestSchema, createRunRequestSchema, sendMessageRequestSchema, setChannelProviderRequestSchema } from "@v2/agent-contracts";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { allowedOrigins, isInternalRequest, readSession, type AgentSessionUser } from "./access";
import type { AgentAiEnv } from "./env";
import { createKnowledgeRoutes } from "./knowledge-routes";
import { createProviderRoutes } from "./provider-routes";
import { AgentRepository } from "./repository";

type Variables = { user: AgentSessionUser | null; internal: boolean };
type AppBinding = { Bindings: AgentAiEnv; Variables: Variables };
type AppContext = Context<AppBinding>;
const app = new Hono<AppBinding>();

app.use("*", cors({
  origin: (origin, c) => allowedOrigins(c.env).includes(origin) ? origin : "",
  allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "OPTIONS"], credentials: true, maxAge: 600,
}));
app.use("*", async (c, next) => {
  const internal = isInternalRequest(c.req.raw);
  c.set("internal", internal);
  c.set("user", internal || c.req.path === "/health" ? null : await readSession(c.env, c.req.raw.headers));
  await next();
});
app.use("*", async (c, next) => {
  if (c.req.path === "/health" || c.get("internal") || c.get("user")) return next();
  return c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401);
});
app.onError((error, c) => {
  const validation = error instanceof Error && error.name === "ZodError";
  return c.json(errorResponse(failure(validation ? "validation_failed" : "internal_error", validation ? "Request validation failed." : "An unexpected error occurred.")), validation ? 400 : 500);
});

app.route("/provider-runtime", createProviderRoutes());
app.route("/knowledge", createKnowledgeRoutes());
app.get("/health", (c) => c.json({ ok: true, service: "agent-ai" }));
app.get("/workspaces/:workspaceId/channels", async (c) => c.json({ channels: await new AgentRepository(c.env.AGENT_DB).listChannels(c.req.param("workspaceId")) }));
app.post("/channels", async (c) => { const input = createChannelRequestSchema.parse(await c.req.json()); return c.json({ channel: await new AgentRepository(c.env.AGENT_DB).createChannel(input.workspaceId, input.title, input.providerId ?? null) }, 201); });
app.put("/channels/:channelId/provider", async (c) => { const input = setChannelProviderRequestSchema.parse(await c.req.json()); await new AgentRepository(c.env.AGENT_DB).setChannelProvider(c.req.param("channelId"), input.providerId); return c.json({ saved: true }); });
app.get("/workspaces/:workspaceId/providers", async (c) => c.json({ providers: await new AgentRepository(c.env.AGENT_DB).listProviders(c.req.param("workspaceId")) }));
app.post("/providers", async (c) => { const input = createProviderBindingRequestSchema.parse(await c.req.json()); return c.json({ provider: await new AgentRepository(c.env.AGENT_DB).createProvider(input.workspaceId, input.contributionId, input.title, input.model) }, 201); });
app.get("/channels/:channelId/messages", async (c) => c.json({ messages: await new AgentRepository(c.env.AGENT_DB).listMessages(c.req.param("channelId")) }));
app.post("/messages", async (c) => { const input = sendMessageRequestSchema.parse(await c.req.json()); return c.json({ message: await new AgentRepository(c.env.AGENT_DB).addMessage(input.channelId, "user", input.content), status: "stored" }, 201); });
app.post("/runs", async (c) => { const input = createRunRequestSchema.parse(await c.req.json()); const channel = (await new AgentRepository(c.env.AGENT_DB).listChannels(input.workspaceId)).find((item) => item.id === input.channelId); if (!channel) return c.json(errorResponse(failure("not_found", "Channel is not available.")), 404); return c.json({ run: await new AgentRepository(c.env.AGENT_DB).createRun(channel.id, channel.providerId) }, 201); });
export default app;
export type AgentApp = typeof app;
