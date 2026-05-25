import { z } from "zod";

export const workspaceIdSchema = z.string().min(1);
export const pluginActivationRequestSchema = z.object({ workspaceId: workspaceIdSchema, pluginId: z.string().min(1) });
export const toolExecutionRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  toolId: z.string().min(1),
  input: z.unknown().optional(),
  approved: z.boolean().default(false),
});
export const installManifestRequestSchema = z.object({ workspaceId: workspaceIdSchema, manifest: z.unknown() });

export type ToolExecutionRequest = z.output<typeof toolExecutionRequestSchema>;
