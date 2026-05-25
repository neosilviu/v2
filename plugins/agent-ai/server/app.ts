import { Hono } from "hono";
import { cors } from "hono/cors";
import { createChannelRequestSchema, createProviderBindingRequestSchema, createRunRequestSchema, providerDiscoveryRequestSchema, providerTestRequestSchema, sendMessageRequestSchema, setChannelProviderRequestSchema } from "@v2/agent-contracts";
import type { ProviderContribution } from "@v2/plugin-contracts";
import type { AgentAiEnv } from "./env";
import { AgentRepository } from "./repository";

export function createAgentAiApp() {
  const app = new Hono<{ Bindings: AgentAiEnv }>();
  app.use("*", cors({ origin: "*" }));

  async function hasProvider(env: AgentAiEnv, workspaceId: string, providerId: string) {
    const response = await env.CORE.fetch(`https://core.internal/runtime/providers?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (!response.ok) return false;
    const payload = await response.json() as { providers: ProviderContribution[] };
    return payload.providers.some((provider) => provider.id === providerId);
  }

  app.get("/health", (c) => c.json({ ok: true, service: "agent-ai" }));
  app.get("/workspaces/:workspaceId/channels", async (c) => c.json({ channels: await new AgentRepository(c.env.AGENT_DB).listChannels(c.req.param("workspaceId")) }));
  app.post("/channels", async (c) => {
    const request = createChannelRequestSchema.parse(await c.req.json());
    return c.json({ channel: await new AgentRepository(c.env.AGENT_DB).createChannel(request.workspaceId, request.title, request.providerId ?? null) }, 201);
  });
  app.put("/channels/:channelId/provider", async (c) => {
    const request = setChannelProviderRequestSchema.parse(await c.req.json());
    await new AgentRepository(c.env.AGENT_DB).setChannelProvider(c.req.param("channelId"), request.providerId);
    return c.json({ saved: true });
  });
  app.get("/workspaces/:workspaceId/providers", async (c) => c.json({ providers: await new AgentRepository(c.env.AGENT_DB).listProviders(c.req.param("workspaceId")) }));
  app.post("/providers", async (c) => {
    const request = createProviderBindingRequestSchema.parse(await c.req.json());
    return c.json({ provider: await new AgentRepository(c.env.AGENT_DB).createProvider(request.workspaceId, request.contributionId, request.title, request.model) }, 201);
  });
  app.post("/providers/:providerId/detect-models", async (c) => {
    const request = providerDiscoveryRequestSchema.parse(await c.req.json());
    const providerId = c.req.param("providerId");
    if (!await hasProvider(c.env, request.workspaceId, providerId)) return c.json({ error: "Provider not available in workspace" }, 404);
    return c.env.PROVIDER_RUNTIME.fetch(`https://providers.internal/connections/${encodeURIComponent(providerId)}/detect-models`, { method: "POST" });
  });
  app.post("/providers/:providerId/test", async (c) => {
    const request = providerTestRequestSchema.parse(await c.req.json());
    const providerId = c.req.param("providerId");
    if (!await hasProvider(c.env, request.workspaceId, providerId)) return c.json({ error: "Provider not available in workspace" }, 404);
    return c.env.PROVIDER_RUNTIME.fetch(`https://providers.internal/connections/${encodeURIComponent(providerId)}/test`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelId: request.modelId })
    });
  });
  app.get("/channels/:channelId/messages", async (c) => c.json({ messages: await new AgentRepository(c.env.AGENT_DB).listMessages(c.req.param("channelId")) }));
  app.post("/messages", async (c) => {
    const request = sendMessageRequestSchema.parse(await c.req.json());
    return c.json({ message: await new AgentRepository(c.env.AGENT_DB).addMessage(request.channelId, "user", request.content), status: "stored" }, 201);
  });
  app.post("/runs", async (c) => {
    const request = createRunRequestSchema.parse(await c.req.json());
    const channel = (await new AgentRepository(c.env.AGENT_DB).listChannels(request.workspaceId)).find((item) => item.id === request.channelId);
    if (!channel) return c.json({ error: "Channel not found" }, 404);
    return c.json({ run: await new AgentRepository(c.env.AGENT_DB).createRun(channel.id, channel.providerId) }, 201);
  });
  return app;
}

export default createAgentAiApp();
