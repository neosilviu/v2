import { z } from "zod";

export const channelSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  providerId: z.string().nullable().default(null),
  createdAt: z.string(),
});

export const messageSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string(),
  createdAt: z.string(),
});

export const providerBindingSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  contributionId: z.string().min(1),
  title: z.string().min(1),
  model: z.string().min(1),
  status: z.enum(["configured", "missing-secret", "disabled"]),
  createdAt: z.string(),
});

export const runSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  providerId: z.string().nullable(),
  status: z.enum(["queued", "running", "completed", "failed", "provider-required"]),
  createdAt: z.string(),
});

export const createChannelRequestSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  providerId: z.string().nullable().optional(),
});
export const setChannelProviderRequestSchema = z.object({ providerId: z.string().nullable() });
export const createProviderBindingRequestSchema = z.object({
  workspaceId: z.string().min(1),
  contributionId: z.string().min(1),
  title: z.string().min(1),
  model: z.string().min(1),
});
export const sendMessageRequestSchema = z.object({
  workspaceId: z.string().min(1),
  channelId: z.string().min(1),
  content: z.string().trim().min(1),
});
export const createRunRequestSchema = z.object({
  workspaceId: z.string().min(1),
  channelId: z.string().min(1),
});

export type AgentChannel = z.output<typeof channelSchema>;
export type AgentMessage = z.output<typeof messageSchema>;
export type AgentProviderBinding = z.output<typeof providerBindingSchema>;
export type AgentRun = z.output<typeof runSchema>;
