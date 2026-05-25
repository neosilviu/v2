import { Hono } from "hono";
import { cors } from "hono/cors";
import { createChannelRequestSchema, createProviderBindingRequestSchema, createRunRequestSchema, providerDiscoveryRequestSchema, providerTestRequestSchema, sendMessageRequestSchema, setChannelProviderRequestSchema } from "@v2/agent-contracts";
import type { ProviderContribution } from "@v2/plugin-contracts";
import type { AgentEnv } from "./env";
import { detectProviderModels, testProvider } from "./provider-runtime";
import { AgentRepository } from "./repository";

const app = new Hono<{ Bindings: AgentEnv }>();
app.use("*", cors({ origin: "*" }));
async function provider(env: AgentEnv, workspaceId: string, providerId: string) { const response = await env.CORE.fetch(`https://core.internal/runtime/providers?workspaceId=${encodeURIComponent(workspaceId)}`); const payload = await response.json() as { providers: ProviderContribution[] }; return payload.providers.find((item) => item.id === providerId); }
app.get("/health", (c) => c.json({ ok: true, service: "agent-ai-worker" }));
app.get("/workspaces/:workspaceId/channels", async (c) => c.json({ channels: await new AgentRepository(c.env.AGENT_DB).listChannels(c.req.param("workspaceId")) }));
app.post("/channels", async (c) => { const request = createChannelRequestSchema.parse(await c.req.json()); return c.json({ channel: await new AgentRepository(c.env.AGENT_DB).createChannel(request.workspaceId, request.title, request.providerId ?? null) }, 201); });
app.put("/channels/:channelId/provider", async (c) => { const request = setChannelProviderRequestSchema.parse(await c.req.json()); await new AgentRepository(c.env.AGENT_DB).setChannelProvider(c.req.param("channelId"), request.providerId); return c.json({ saved: true }); });
app.get("/workspaces/:workspaceId/providers", async (c) => c.json({ providers: await new AgentRepository(c.env.AGENT_DB).listProviders(c.req.param("workspaceId")) }));
app.post("/providers", async (c) => { const request = createProviderBindingRequestSchema.parse(await c.req.json()); return c.json({ provider: await new AgentRepository(c.env.AGENT_DB).createProvider(request.workspaceId, request.contributionId, request.title, request.model) }, 201); });
app.post("/providers/:providerId/detect-models", async (c) => { const request = providerDiscoveryRequestSchema.parse(await c.req.json()); const definition = await provider(c.env, request.workspaceId, c.req.param("providerId")); if (!definition) return c.json({ error: "Provider not contributed by an active plugin" }, 404); return c.json({ models: await detectProviderModels(c.env, definition, request.credentials) }); });
app.post("/providers/:providerId/test", async (c) => { const request = providerTestRequestSchema.parse(await c.req.json()); const definition = await provider(c.env, request.workspaceId, c.req.param("providerId")); if (!definition) return c.json({ error: "Provider not contributed by an active plugin" }, 404); return c.json(await testProvider(c.env, definition, request.credentials, request.modelId)); });
app.get("/channels/:channelId/messages", async (c) => c.json({ messages: await new AgentRepository(c.env.AGENT_DB).listMessages(c.req.param("channelId")) }));
app.post("/messages", async (c) => { const request = sendMessageRequestSchema.parse(await c.req.json()); return c.json({ message: await new AgentRepository(c.env.AGENT_DB).addMessage(request.channelId, "user", request.content), status: "stored" }, 201); });
app.post("/runs", async (c) => { const request = createRunRequestSchema.parse(await c.req.json()); const channel = (await new AgentRepository(c.env.AGENT_DB).listChannels(request.workspaceId)).find((item) => item.id === request.channelId); if (!channel) return c.json({ error: "Channel not found" }, 404); return c.json({ run: await new AgentRepository(c.env.AGENT_DB).createRun(channel.id, channel.providerId) }, 201); });
export default app;
