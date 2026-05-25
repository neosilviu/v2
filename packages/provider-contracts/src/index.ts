import { z } from "zod";

export const connectionOperationSchema = z.object({
  connectionId: z.string().min(1),
  modelId: z.string().min(1).optional(),
});

export type ConnectionOperation = z.output<typeof connectionOperationSchema>;
