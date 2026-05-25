import { Hono } from "hono";
import { cors } from "hono/cors";
import { createChannelRequestSchema, sendMessageRequestSchema } from "@v2/agent-contracts";
import type { AgentEnv } from "./env";
import { AgentRepository } from "./repository";

const app = new Hono<{ Bindings: AgentEnv }>();
app.use("*", cors({ origin: "*" }));
app.get("/health", (c) => c.json({ ok: true, service: "agent-ai-worker" }));
app.get("/workspaces/:workspaceId/channels", async (c) => c.json({ channels: await new AgentRepository(c.env.AGENT_DB).listChannels(c.req.param("workspaceId")) }));
app.post("/channels", async (c) => {
  const request = createChannelRequestSchema.parse(await c.req.json());
  const channel = await new AgentRepository(c.env.AGENT_DB).createChannel(request.workspaceId, request.title, request.providerId ?? null);
  return c.json({ channel }, 201);
});
app.get("/channels/:channelId/messages", async (c) => c.json({ messages: await new AgentRepository(c.env.AGENT_DB).listMessages(c.req.param("channelId")) }));
app.post("/messages", async (c) => {
  const request = sendMessageRequestSchema.parse(await c.req.json());
  const repo = new AgentRepository(c.env.AGENT_DB);
  const message = await repo.addMessage(request.channelId, "user", request.content);
  return c.json({ message, status: "stored" }, 201);
});

export default app;
