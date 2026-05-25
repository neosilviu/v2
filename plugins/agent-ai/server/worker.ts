import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { createChannelRequestSchema, createProviderBindingRequestSchema, createRunRequestSchema, sendMessageRequestSchema, setChannelProviderRequestSchema } from "@v2/agent-contracts";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { providerChatResultSchema } from "@v2/provider-contracts";
import { allowedOrigins, isInternalRequest, readSession, type AgentSessionUser } from "./access";
import type { AgentAiEnv } from "./env";
import { createKnowledgeRoutes } from "./knowledge-routes";
import { createProviderRoutes } from "./provider-routes";
import { AgentRepository } from "./repository";

type Variables = { user: AgentSessionUser | null; internal: boolean };
type AppBinding = { Bindings: AgentAiEnv; Variables: Variables };
type AppContext = Context<AppBinding>;
const app = new Hono<AppBinding>();
app.use("*", cors({ origin: (origin, c) => allowedOrigins(c.env).includes(origin) ? origin : "", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "OPTIONS"], credentials: true, maxAge: 600 }));
app.use("*", async (c, next) => { const internal = isInternalRequest(c.req.raw); c.set("internal", internal); c.set("user", internal || c.req.path === "/health" ? null : await readSession(c.env, c.req.raw.headers)); await next(); });
app.use("*", async (c, next) => c.req.path === "/health" || c.get("internal") || c.get("user") ? next() : c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401));
app.onError((error, c) => { const validation = error instanceof Error && error.name === "ZodError"; return c.json(errorResponse(failure(validation ? "validation_failed" : "internal_error", validation ? "Request validation failed." : "An unexpected error occurred.")), validation ? 400 : 500); });
app.route("/provider-runtime", createProviderRoutes()); app.route("/knowledge", createKnowledgeRoutes()); app.get("/health", (c) => c.json({ ok: true, service: "agent-ai" }));
app.get("/workspaces/:workspaceId/channels", async (c) => c.json({ channels: await new AgentRepository(c.env.AGENT_DB).listChannels(c.req.param("workspaceId")) }));
app.post("/channels", async (c) => { const input = createChannelRequestSchema.parse(await c.req.json()); return c.json({ channel: await new AgentRepository(c.env.AGENT_DB).createChannel(input.workspaceId, input.title, input.providerId ?? null) }, 201); });
app.put("/channels/:channelId/provider", async (c) => { const input = setChannelProviderRequestSchema.parse(await c.req.json()); await new AgentRepository(c.env.AGENT_DB).setChannelProvider(c.req.param("channelId"), input.providerId); return c.json({ saved: true }); });
app.get("/workspaces/:workspaceId/providers", async (c) => c.json({ providers: await new AgentRepository(c.env.AGENT_DB).listProviders(c.req.param("workspaceId")) }));
app.post("/providers", async (c) => { const input = createProviderBindingRequestSchema.parse(await c.req.json()); return c.json({ provider: await new AgentRepository(c.env.AGENT_DB).createProvider(input.workspaceId, input.contributionId, input.connectionId, input.title, input.model) }, 201); });
app.get("/channels/:channelId/messages", async (c) => c.json({ messages: await new AgentRepository(c.env.AGENT_DB).listMessages(c.req.param("channelId")) }));
app.post("/messages", async (c) => { const input = sendMessageRequestSchema.parse(await c.req.json()); return c.json({ message: await new AgentRepository(c.env.AGENT_DB).addMessage(input.channelId, "user", input.content), status: "stored" }, 201); });
app.post("/runs", async (c) => {
  const input = createRunRequestSchema.parse(await c.req.json()); const repository = new AgentRepository(c.env.AGENT_DB);
  const channel = (await repository.listChannels(input.workspaceId)).find((item) => item.id === input.channelId);
  if (!channel) return c.json(errorResponse(failure("not_found", "Channel is not available.")), 404);
  if (!channel.providerId) return c.json(errorResponse(failure("conflict", "Select a provider connection before starting a run.")), 409);
  const binding = await repository.getProvider(channel.providerId);
  if (!binding?.connectionId) return c.json(errorResponse(failure("conflict", "Provider connection is not configured for this channel.")), 409);
  const run = await repository.createRun(channel.id, binding.id);
  try {
    const messages = (await repository.listMessages(channel.id)).filter((message) => message.role === "system" || message.role === "user" || message.role === "assistant").map((message) => ({ role: message.role as "system" | "user" | "assistant", content: message.content }));
    const response = await c.env.PROVIDER_RUNTIME.fetch(`https://providers.internal/connections/${encodeURIComponent(binding.connectionId)}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelId: binding.model, messages }) });
    if (!response.ok) throw new Error("Provider execution failed.");
    const result = providerChatResultSchema.parse(await response.json());
    const message = await repository.addMessage(channel.id, "assistant", result.content);
    await repository.completeRun(run.id, message.id);
    return c.json({ run: { ...run, status: "completed" }, message, modelId: result.modelId }, 201);
  } catch {
    await repository.failRun(run.id, "Provider execution failed.");
    return c.json(errorResponse(failure("dependency_unavailable", "The selected provider could not complete this run.", { retryable: true })), 502);
  }
});
export default app; export type AgentApp = typeof app;
