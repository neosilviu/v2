import { z } from "zod";

export const workspaceIdSchema = z.string().min(1);
export const pluginActivationRequestSchema = z.object({ workspaceId: workspaceIdSchema, pluginId: z.string().min(1) });
export const pluginInstallRequestSchema = z.object({ workspaceId: workspaceIdSchema, bundle: z.unknown(), approved: z.boolean().default(false) });
export const toolExecutionRequestSchema = z.object({ workspaceId: workspaceIdSchema, toolId: z.string().min(1), input: z.unknown().optional(), approved: z.boolean().default(false) });
export const settingWriteRequestSchema = z.object({ workspaceId: workspaceIdSchema, scope: z.string().min(1), key: z.string().min(1), value: z.unknown() });
export type ToolExecutionRequest = z.output<typeof toolExecutionRequestSchema>;
