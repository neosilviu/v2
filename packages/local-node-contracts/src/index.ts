import { z } from "zod";

export const runnerPairingStateSchema = z.enum(["unpaired", "pairing", "paired", "revoked"]);
export const runnerModuleStatusSchema = z.enum(["online", "offline", "not-configured", "error"]);

export const runnerModuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: runnerModuleStatusSchema,
  detail: z.string().optional(),
});

export const runnerHealthSchema = z.object({
  status: z.enum(["online", "offline", "mock-development-only", "not-configured"]),
  runnerVersion: z.string().nullable().default(null),
  paired: z.boolean().default(false),
  modules: z.array(runnerModuleSchema).default([]),
  checkedAt: z.string().optional(),
});

export const runnerChannelProviderSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["gmail", "whatsapp", "local-files", "print-center", "office", "archive"]),
  title: z.string().min(1),
  status: runnerModuleStatusSchema,
  role: z.enum(["customer-communication", "local-production", "document-source"]).default("customer-communication"),
});

export const channelSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  kind: z.enum(["gmail", "whatsapp"]),
  status: runnerModuleStatusSchema,
  displayName: z.string().min(1),
});

export const channelThreadSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  externalThreadId: z.string().min(1),
  subject: z.string().nullable().default(null),
  customerSafeRef: z.string().nullable().default(null),
  lastMessageAt: z.string().nullable().default(null),
});

export const channelMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  direction: z.enum(["inbound", "outbound"]),
  fromSafe: z.string().nullable().default(null),
  toSafe: z.array(z.string()).default([]),
  bodyPreview: z.string().nullable().default(null),
  receivedAt: z.string().nullable().default(null),
});

export const channelAttachmentSchema = z.object({
  id: z.string().min(1),
  messageId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().nullable().default(null),
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  localObjectRef: z.string().nullable().default(null),
});

export const outboundReplySchema = z.object({
  threadId: z.string().min(1),
  bodyText: z.string().min(1),
  attachmentRefs: z.array(z.string()).default([]),
});

export const deliveryReceiptSchema = z.object({
  id: z.string().min(1),
  outboundId: z.string().min(1),
  status: z.enum(["queued", "sent", "failed"]),
  safeError: z.string().nullable().default(null),
  createdAt: z.string().optional(),
});

export const runnerCommandSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["health", "pair", "disconnect", "module-status", "test-channel"]),
  input: z.record(z.string(), z.unknown()).default({}),
});

export const runnerCommandResultSchema = z.object({
  ok: z.boolean(),
  status: z.enum(["configured", "not-configured", "mock-development-only", "unavailable", "failed"]),
  message: z.string().optional(),
  health: runnerHealthSchema.optional(),
});

export type RunnerHealth = z.output<typeof runnerHealthSchema>;
export type RunnerModule = z.output<typeof runnerModuleSchema>;
export type RunnerPairingState = z.output<typeof runnerPairingStateSchema>;
export type RunnerChannelProvider = z.output<typeof runnerChannelProviderSchema>;
export type Channel = z.output<typeof channelSchema>;
export type ChannelThread = z.output<typeof channelThreadSchema>;
export type ChannelMessage = z.output<typeof channelMessageSchema>;
export type ChannelAttachment = z.output<typeof channelAttachmentSchema>;
export type OutboundReply = z.output<typeof outboundReplySchema>;
export type DeliveryReceipt = z.output<typeof deliveryReceiptSchema>;
export type RunnerCommand = z.output<typeof runnerCommandSchema>;
export type RunnerCommandResult = z.output<typeof runnerCommandResultSchema>;
