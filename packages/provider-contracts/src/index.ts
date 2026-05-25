import { z } from "zod";

export const connectionOperationSchema = z.object({ connectionId: z.string().min(1), modelId: z.string().min(1).optional() });
export const providerChatMessageSchema = z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().trim().min(1).max(50000) });
export const providerChatRequestSchema = z.object({ modelId: z.string().min(1).optional(), messages: z.array(providerChatMessageSchema).min(1).max(100) });
export const providerChatResultSchema = z.object({ providerId: z.string().min(1), modelId: z.string().min(1), content: z.string() });

export type ConnectionOperation = z.output<typeof connectionOperationSchema>;
export type ProviderChatMessage = z.output<typeof providerChatMessageSchema>;
export type ProviderChatRequest = z.output<typeof providerChatRequestSchema>;
export type ProviderChatResult = z.output<typeof providerChatResultSchema>;
