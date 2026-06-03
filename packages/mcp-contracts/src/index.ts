import { z } from "zod";

export const jsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);
export const mcpRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: jsonRpcIdSchema.optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});
export const mcpToolCallParamsSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
});
export type McpRequest = z.output<typeof mcpRequestSchema>;
