import { z } from "zod";

export const workspaceIdSchema = z.string().min(1);
export const settingScopeSchema = z.union([z.literal("platform"), z.string().regex(/^plugin:[a-zA-Z0-9._-]+$/)]);
export const pluginActivationRequestSchema = z.object({ workspaceId: workspaceIdSchema, pluginId: z.string().min(1) });
export const pluginInstallRequestSchema = z.object({ workspaceId: workspaceIdSchema, bundle: z.unknown(), approved: z.boolean().default(false) });
export const toolExecutionRequestSchema = z.object({ workspaceId: workspaceIdSchema, toolId: z.string().min(1), input: z.unknown().optional(), approved: z.boolean().default(false) });
export const toolExecutionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("executed"), toolId: z.string(), result: z.unknown().optional() }),
  z.object({ status: z.literal("approval-required"), toolId: z.string(), risk: z.string() }),
  z.object({ status: z.literal("denied"), toolId: z.string(), reason: z.string() }),
]);
export const settingWriteRequestSchema = z.object({ workspaceId: workspaceIdSchema, scope: settingScopeSchema, key: z.string().min(1), value: z.unknown() });
export const zoneStateSchema = z.object({ id: z.string().min(1), title: z.string(), accepts: z.array(z.string()) });
export const placementStateSchema = z.object({ surfaceId: z.string(), zoneId: z.string(), order: z.number().int().nonnegative() });
export const workspaceLayoutSchema = z.object({ zones: z.array(zoneStateSchema), placements: z.array(placementStateSchema) });
export const layoutWriteRequestSchema = z.object({ workspaceId: workspaceIdSchema, layout: workspaceLayoutSchema });

export type ToolExecutionRequest = z.output<typeof toolExecutionRequestSchema>;
export type ToolExecutionResult = z.output<typeof toolExecutionResultSchema>;
export type SettingScope = z.output<typeof settingScopeSchema>;
export type WorkspaceLayout = z.output<typeof workspaceLayoutSchema>;
