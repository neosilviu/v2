import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import {
  createChannelRequestSchema,
  createProviderBindingRequestSchema,
  createRunRequestSchema,
  createToolCallRequestSchema,
  refreshToolCallRequestSchema,
  sendMessageRequestSchema,
  setChannelProviderRequestSchema,
  type AgentToolCall,
} from "@v2/agent-contracts";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { providerChatResultSchema } from "@v2/provider-contracts";
import { toolApprovalSchema, toolExecutionResultSchema, type ToolApproval } from "@v2/rpc-contracts";
import { allowedOrigins, isInternalRequest, readSession, type AgentSessionUser } from "./access";
import type { AgentAiEnv } from "./env";
import { createKnowledgeRoutes } from "./knowledge-routes";
import { createProviderRoutes } from "./provider-routes";
import { AgentRepository } from "./repository";

type Variables = { user: AgentSessionUser | null; internal: boolean };
type AppBinding = { Bindings: AgentAiEnv; Variables: Variables };
type AppContext = Context<AppBinding>;

const app = new Hono<AppBinding>();
const terminalToolStatuses = new Set(["completed", "denied", "failed"]);

app.use("*", cors({ origin: (origin, c) => allowedOrigins(c.env).includes(origin) ? origin : "", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "OPTIONS"], credentials: true, maxAge: 600 }));
app.use("*", async (c, next) => { const internal = isInternalRequest(c.req.raw); c.set("internal", internal); c.set("user", internal || c.req.path === "/health" ? null : await readSession(c.env, c.req.raw.headers)); await next(); });
app.use("*", async (c, next) => c.req.path === "/health" || c.get("internal") || c.get("user") ? next() : c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401));
app.onError((error, c) => { const validation = error instanceof Error && error.name === "ZodError"; return c.json(errorResponse(failure(validation ? "validation_failed" : "internal_error", validation ? "Request validation failed." : "An unexpected error occurred.")), validation ? 400 : 500); });

async function getCoreApproval(c: AppContext, workspaceId: string, approvalId: string): Promise<ToolApproval | null> {
  const response = await c.env.CORE.fetch(`https://core.internal/tool-approvals/${encodeURIComponent(approvalId)}?workspaceId=${encodeURIComponent(workspaceId)}`);
  if (!response.ok) return null;
  const payload = await response.json() as { approval?: unknown };
  return toolApprovalSchema.parse(payload.approval);
}

async function executeViaCore(c: AppContext, repository: AgentRepository, workspaceId: string, toolCall: AgentToolCall, approvalId?: string): Promise<AgentToolCall> {
  await repository.markToolCallExecuting(toolCall.id);
  const response = await c.env.CORE.fetch("https://core.internal/tools/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId, toolId: toolCall.toolId, input: toolCall.input, ...(approvalId ? { approvalId } : {}) }),
  });
  const result = toolExecutionResultSchema.parse(await response.json());
  if (result.status === "approval-required") await repository.markToolCallApprovalRequired(toolCall.id, result.approvalId);
  if (result.status === "executed") await repository.completeToolCall(toolCall.id, result);
  if (result.status === "denied") await repository.markToolCallDenied(toolCall.id, result.reason, result);
  return await repository.getToolCall(toolCall.id) ?? toolCall;
}

async function refreshToolCall(c: AppContext, repository: AgentRepository, workspaceId: string, toolCall: AgentToolCall, suppliedApprovalId?: string): Promise<AgentToolCall> {
  if (terminalToolStatuses.has(toolCall.status)) return toolCall;
  const approvalId = toolCall.approvalId ?? suppliedApprovalId;
  if (!approvalId) return executeViaCore(c, repository, workspaceId, toolCall);
  if (toolCall.approvalId && suppliedApprovalId && toolCall.approvalId !== suppliedApprovalId) {
    await repository.markToolCallDenied(toolCall.id, "Approval does not match this tool call.");
    return await repository.getToolCall(toolCall.id) ?? toolCall;
  }
  const approval = await getCoreApproval(c, workspaceId, approvalId);
  if (!approval) {
    await repository.markToolCallDenied(toolCall.id, "Approval is not available.");
    return await repository.getToolCall(toolCall.id) ?? toolCall;
  }
  if (approval.status === "pending") return toolCall;
  if (approval.status === "denied") {
    await repository.markToolCallDenied(toolCall.id, "Approval was denied.");
    return await repository.getToolCall(toolCall.id) ?? toolCall;
  }
  if (approval.status === "consumed") {
    await repository.markToolCallDenied(toolCall.id, "Approval has already been consumed.");
    return await repository.getToolCall(toolCall.id) ?? toolCall;
  }
  await repository.markToolCallApproved(toolCall.id);
  return executeViaCore(c, repository, workspaceId, toolCall, approval.id);
}

app.route("/provider-runtime", createProviderRoutes());
app.route("/knowledge", createKnowledgeRoutes());
app.get("/health", (c) => c.json({ ok: true, service: "agent-ai" }));
app.get("/workspaces/:workspaceId/channels", async (c) => c.json({ channels: await new AgentRepository(c.env.AGENT_DB).listChannels(c.req.param("workspaceId")) }));
app.post("/channels", async (c) => { const input = createChannelRequestSchema.parse(await c.req.json()); return c.json({ channel: await new AgentRepository(c.env.AGENT_DB).createChannel(input.workspaceId, input.title, input.providerId ?? null) }, 201); });
app.put("/channels/:channelId/provider", async (c) => { const input = setChannelProviderRequestSchema.parse(await c.req.json()); await new AgentRepository(c.env.AGENT_DB).setChannelProvider(c.req.param("channelId"), input.providerId); return c.json({ saved: true }); });
app.get("/workspaces/:workspaceId/providers", async (c) => c.json({ providers: await new AgentRepository(c.env.AGENT_DB).listProviders(c.req.param("workspaceId")) }));
app.post("/providers", async (c) => { const input = createProviderBindingRequestSchema.parse(await c.req.json()); return c.json({ provider: await new AgentRepository(c.env.AGENT_DB).createProvider(input.workspaceId, input.contributionId, input.connectionId, input.title, input.model) }, 201); });
app.get("/channels/:channelId/messages", async (c) => c.json({ messages: await new AgentRepository(c.env.AGENT_DB).listMessages(c.req.param("channelId")) }));
app.post("/messages", async (c) => { const input = sendMessageRequestSchema.parse(await c.req.json()); return c.json({ message: await new AgentRepository(c.env.AGENT_DB).addMessage(input.channelId, "user", input.content), status: "stored" }, 201); });
app.get("/channels/:channelId/tool-calls", async (c) => c.json({ toolCalls: await new AgentRepository(c.env.AGENT_DB).listToolCallsForChannel(c.req.param("channelId")) }));
app.get("/runs/:runId/tool-calls", async (c) => c.json({ toolCalls: await new AgentRepository(c.env.AGENT_DB).listToolCallsForRun(c.req.param("runId")) }));
app.post("/tool-calls", async (c) => {
  const input = createToolCallRequestSchema.parse(await c.req.json());
  const repository = new AgentRepository(c.env.AGENT_DB);
  const channel = await repository.getChannel(input.channelId);
  if (!channel || channel.workspaceId !== input.workspaceId) return c.json(errorResponse(failure("not_found", "Channel is not available.")), 404);
  const run = input.runId ? await repository.getRun(input.runId) : await repository.createToolRun(channel.id);
  if (!run || run.channelId !== channel.id) return c.json(errorResponse(failure("not_found", "Run is not available for this channel.")), 404);
  const toolCall = await repository.createToolCall(run.id, channel.id, input.toolId, input.input);
  try {
    const updated = await executeViaCore(c, repository, input.workspaceId, toolCall, input.approvalId);
    return c.json({ toolCall: updated }, updated.status === "approval-required" ? 202 : 201);
  } catch {
    await repository.failToolCall(toolCall.id, "Core tool execution failed.");
    return c.json({ toolCall: await repository.getToolCall(toolCall.id) }, 502);
  }
});
app.post("/tool-calls/:toolCallId/refresh", async (c) => {
  const input = refreshToolCallRequestSchema.parse(await c.req.json());
  const repository = new AgentRepository(c.env.AGENT_DB);
  const toolCall = await repository.getToolCall(c.req.param("toolCallId"));
  if (!toolCall) return c.json(errorResponse(failure("not_found", "Tool call is not available.")), 404);
  try {
    return c.json({ toolCall: await refreshToolCall(c, repository, input.workspaceId, toolCall, input.approvalId) });
  } catch {
    await repository.failToolCall(toolCall.id, "Core tool execution failed.");
    return c.json({ toolCall: await repository.getToolCall(toolCall.id) }, 502);
  }
});
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
export default app;
export type AgentApp = typeof app;
