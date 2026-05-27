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
const toolLoopSystemPrompt = `You can request one runtime tool by responding only with JSON: {"toolCall":{"toolId":"tool.id","input":{}}}. If no tool is needed, respond normally. After a tool result is provided, write the final assistant response.`;

app.use("*", cors({ origin: (origin, c) => allowedOrigins(c.env).includes(origin) ? origin : "", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "OPTIONS"], credentials: true, maxAge: 600 }));
app.use("*", async (c, next) => { const internal = isInternalRequest(c.req.raw); c.set("internal", internal); c.set("user", c.req.path === "/health" ? null : await readSession(c.env, c.req.raw.headers)); await next(); });
app.use("*", async (c, next) => c.req.path === "/health" || c.get("user") ? next() : c.json(errorResponse(failure("not_authenticated", "Authentication is required.")), 401));
app.onError((error, c) => { const validation = error instanceof Error && error.name === "ZodError"; return c.json(errorResponse(failure(validation ? "validation_failed" : "internal_error", validation ? "Request validation failed." : "An unexpected error occurred.")), validation ? 400 : 500); });

async function getCoreApproval(c: AppContext, workspaceId: string, approvalId: string): Promise<ToolApproval | null> {
  const response = await c.env.CORE.fetch(`https://core.internal/tool-approvals/${encodeURIComponent(approvalId)}?workspaceId=${encodeURIComponent(workspaceId)}`, { headers: delegatedHeaders(c) });
  if (!response.ok) return null;
  const payload = await response.json() as { approval?: unknown };
  return toolApprovalSchema.parse(payload.approval);
}

async function executeViaCore(c: AppContext, repository: AgentRepository, workspaceId: string, toolCall: AgentToolCall, approvalId?: string): Promise<AgentToolCall> {
  await repository.markToolCallExecuting(toolCall.id);
  const response = await c.env.CORE.fetch("https://core.internal/tools/execute", {
    method: "POST",
    headers: { ...Object.fromEntries(delegatedHeaders(c)), "content-type": "application/json" },
    body: JSON.stringify({ workspaceId, toolId: toolCall.toolId, input: toolCall.input, ...(approvalId ? { approvalId } : {}) }),
  });
  const result = toolExecutionResultSchema.parse(await response.json());
  if (result.status === "approval-required") await repository.markToolCallApprovalRequired(toolCall.id, result.approvalId);
  if (result.status === "executed") await repository.completeToolCall(toolCall.id, result);
  if (result.status === "denied") await repository.markToolCallDenied(toolCall.id, result.reason, result);
  return await repository.getToolCall(toolCall.id) ?? toolCall;
}

function extractModelToolCall(content: string): { toolId: string; input: unknown } | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const source = fenced ?? trimmed;
  if (!source.startsWith("{")) return null;
  try {
    const payload = JSON.parse(source) as { toolCall?: unknown; tool_calls?: unknown };
    const call = (payload.toolCall ?? (Array.isArray(payload.tool_calls) ? payload.tool_calls[0] : null)) as { toolId?: unknown; tool_id?: unknown; input?: unknown; arguments?: unknown } | null;
    const toolId = typeof call?.toolId === "string" ? call.toolId : typeof call?.tool_id === "string" ? call.tool_id : "";
    if (!toolId.trim()) return null;
    return { toolId: toolId.trim(), input: call?.input ?? call?.arguments ?? null };
  } catch {
    return null;
  }
}

function delegatedHeaders(c: AppContext) {
  const headers = new Headers();
  const cookie = c.req.header("cookie");
  const authorization = c.req.header("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  return headers;
}

async function providerMessages(repository: AgentRepository, channelId: string) {
  const messages = await repository.listMessages(channelId);
  return [
    { role: "system" as const, content: toolLoopSystemPrompt },
    ...messages.map((message) => ({
      role: message.role === "tool" ? "system" as const : message.role as "system" | "user" | "assistant",
      content: message.role === "tool" ? `Tool result:\n${message.content}` : message.content,
    })),
  ].filter((message) => message.role === "system" || message.role === "user" || message.role === "assistant");
}

async function callProvider(c: AppContext, binding: NonNullable<Awaited<ReturnType<AgentRepository["getProvider"]>>>, messages: Awaited<ReturnType<typeof providerMessages>>) {
  if (!binding.connectionId) throw new Error("Provider connection is not configured for this channel.");
  const response = await c.env.CORE.fetch("https://core.internal/tools/execute", {
    method: "POST",
    headers: { ...Object.fromEntries(delegatedHeaders(c)), "content-type": "application/json" },
    body: JSON.stringify({ workspaceId: binding.workspaceId, toolId: "providers.chat", input: { connectionId: binding.connectionId, modelId: binding.model, messages } }),
  });
  if (!response.ok) throw new Error("Provider execution failed.");
  const payload = await response.json() as { status?: string; result?: unknown };
  if (payload.status !== "executed") throw new Error("Provider execution was not completed.");
  return providerChatResultSchema.parse(payload.result);
}

async function continueRunAfterToolResult(c: AppContext, repository: AgentRepository, runId: string, binding: NonNullable<Awaited<ReturnType<AgentRepository["getProvider"]>>>, toolCall: AgentToolCall) {
  const freshRun = await repository.getRun(runId);
  if (!freshRun || freshRun.status === "completed") return null;
  await repository.addMessage(toolCall.channelId, "tool", JSON.stringify({ toolId: toolCall.toolId, result: toolCall.result ?? null }));
  const result = await callProvider(c, binding, await providerMessages(repository, toolCall.channelId));
  const message = await repository.addMessage(toolCall.channelId, "assistant", result.content);
  await repository.completeRun(runId, message.id);
  return { message, modelId: result.modelId };
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
    const updated = await refreshToolCall(c, repository, input.workspaceId, toolCall, input.approvalId);
    let continuation = null;
    if (updated.status === "completed") {
      const run = await repository.getRun(updated.runId);
      const binding = run?.providerId ? await repository.getProvider(run.providerId) : undefined;
      if (binding?.connectionId) continuation = await continueRunAfterToolResult(c, repository, updated.runId, binding, updated);
    }
    if (updated.status === "denied" || updated.status === "failed") await repository.failRun(updated.runId, updated.error ?? `Tool call ${updated.status}.`);
    return c.json({ toolCall: updated, continuation });
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
    const result = await callProvider(c, binding, await providerMessages(repository, channel.id));
    const requestedTool = extractModelToolCall(result.content);
    if (requestedTool) {
      const toolCall = await repository.createToolCall(run.id, channel.id, requestedTool.toolId, requestedTool.input);
      const updated = await executeViaCore(c, repository, input.workspaceId, toolCall);
      if (updated.status === "completed") {
        const continuation = await continueRunAfterToolResult(c, repository, run.id, binding, updated);
        if (continuation) return c.json({ run: { ...run, status: "completed" }, message: continuation.message, toolCall: updated, modelId: continuation.modelId }, 201);
      }
      if (updated.status === "approval-required") {
        const message = await repository.addMessage(channel.id, "assistant", `Tool approval required for ${updated.toolId}.`);
        return c.json({ run: { ...run, status: "running" }, message, toolCall: updated, modelId: result.modelId }, 202);
      }
      if (updated.status === "denied" || updated.status === "failed") {
        await repository.failRun(run.id, updated.error ?? "Tool call failed.");
        return c.json({ run: { ...run, status: "failed" }, toolCall: updated, modelId: result.modelId }, 502);
      }
    }
    const message = await repository.addMessage(channel.id, "assistant", result.content);
    await repository.completeRun(run.id, message.id);
    return c.json({ run: { ...run, status: "completed" }, message, modelId: result.modelId }, 201);
  } catch {
    await repository.failRun(run.id, "Provider execution failed.");
    return c.json(errorResponse(failure("dependency_unavailable", "The selected provider could not complete this run.", { retryable: true })), 502);
  }
});
export default app;
export type AgentAiApi = typeof app;
export type AgentApp = typeof app;
