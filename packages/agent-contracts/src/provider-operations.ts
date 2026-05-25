import { z } from "zod";

export const providerConnectionOperationSchema = z.object({
  workspaceId: z.string().min(1),
  connectionId: z.string().min(1),
});

export const providerConnectionTestSchema = providerConnectionOperationSchema.extend({
  modelId: z.string().min(1).optional(),
});

export type ProviderConnectionOperation = z.output<typeof providerConnectionOperationSchema>;
export type ProviderConnectionTest = z.output<typeof providerConnectionTestSchema>;
