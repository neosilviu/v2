import { z } from "zod";
import { toolExecutionResultSchema } from "@v2/rpc-contracts";

export const channelSchema = z.object({ id: z.string().min(1), workspaceId: z.string().min(1), title: z.string().min(1), providerId: z.string().nullable().default(null), createdAt: z.string() });
export const messageSchema = z.object({ id: z.string().min(1), channelId: z.string().min(1), role: z.enum(["user", "assistant", "tool", "system"]), content: z.string(), createdAt: z.string() });
export const providerBindingSchema = z.object({ id: z.string().min(1), workspaceId: z.string().min(1), contributionId: z.string().min(1), connectionId: z.string().min(1).nullable(), title: z.string().min(1), model: z.string().min(1), status: z.enum(["configured", "unavailable", "disabled"]), createdAt: z.string() });
export const runSchema = z.object({ id: z.string().min(1), channelId: z.string().min(1), providerId: z.string().nullable(), status: z.enum(["queued", "running", "completed", "failed", "provider-required"]), createdAt: z.string() });
export const toolCallStatusSchema = z.enum(["pending", "approval-required", "approved", "executing", "completed", "denied", "failed"]);
export const toolCallSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  channelId: z.string().min(1),
  toolId: z.string().min(1),
  input: z.unknown(),
  approvalId: z.string().min(1).nullable(),
  status: toolCallStatusSchema,
  result: toolExecutionResultSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});
export const createChannelRequestSchema = z.object({ workspaceId: z.string().min(1), title: z.string().min(1), providerId: z.string().nullable().optional() });
export const setChannelProviderRequestSchema = z.object({ providerId: z.string().nullable() });
export const createProviderBindingRequestSchema = z.object({ workspaceId: z.string().min(1), contributionId: z.string().min(1), connectionId: z.string().min(1), title: z.string().min(1), model: z.string().min(1) });
export const providerDiscoveryRequestSchema = z.object({ workspaceId: z.string().min(1), connectionId: z.string().min(1) });
export const providerTestRequestSchema = providerDiscoveryRequestSchema.extend({ modelId: z.string().min(1).optional() });
export const sendMessageRequestSchema = z.object({ workspaceId: z.string().min(1), channelId: z.string().min(1), content: z.string().trim().min(1) });
export const createRunRequestSchema = z.object({ workspaceId: z.string().min(1), channelId: z.string().min(1) });
export const createToolCallRequestSchema = z.object({ workspaceId: z.string().min(1), channelId: z.string().min(1), runId: z.string().min(1).optional(), toolId: z.string().min(1), input: z.unknown().optional(), approvalId: z.string().min(1).optional() });
export const refreshToolCallRequestSchema = z.object({ workspaceId: z.string().min(1), approvalId: z.string().min(1).optional() });
export type AgentChannel = z.output<typeof channelSchema>;
export type AgentMessage = z.output<typeof messageSchema>;
export type AgentProviderBinding = z.output<typeof providerBindingSchema>;
export type AgentRun = z.output<typeof runSchema>;
export type AgentToolCallStatus = z.output<typeof toolCallStatusSchema>;
export type AgentToolCall = z.output<typeof toolCallSchema>;
