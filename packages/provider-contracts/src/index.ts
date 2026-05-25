import { z } from "zod";

export const connectionOperationSchema = z.object({ connectionId: z.string().min(1), modelId: z.string().min(1).optional() });
export const providerConnectionSchema = z.object({ id: z.string().min(1), workspaceId: z.string().min(1), providerId: z.string().min(1), title: z.string().min(1), status: z.enum(["configured", "unavailable", "disabled"]), defaultModelId: z.string().nullable() });
export const createWorkersAiConnectionSchema = z.object({ workspaceId: z.string().min(1), title: z.string().trim().min(1), modelId: z.string().trim().min(1).default("@cf/meta/llama-3.1-8b-instruct") });
export const providerChatMessageSchema = z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().trim().min(1).max(50000) });
export const providerChatRequestSchema = z.object({ modelId: z.string().min(1).optional(), messages: z.array(providerChatMessageSchema).min(1).max(100) });
export const providerChatResultSchema = z.object({ providerId: z.string().min(1), modelId: z.string().min(1), content: z.string() });
export type ConnectionOperation = z.output<typeof connectionOperationSchema>;
export type ProviderConnection = z.output<typeof providerConnectionSchema>;
export type CreateWorkersAiConnection = z.output<typeof createWorkersAiConnectionSchema>;
export type ProviderChatMessage = z.output<typeof providerChatMessageSchema>;
export type ProviderChatRequest = z.output<typeof providerChatRequestSchema>;
export type ProviderChatResult = z.output<typeof providerChatResultSchema>;
