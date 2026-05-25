import { z } from "zod";

export const workspaceIdSchema = z.string().min(1);
export const settingScopeSchema = z.union([z.literal("platform"), z.string().regex(/^plugin:[a-zA-Z0-9._-]+$/)]);
export const pluginActivationRequestSchema = z.object({ workspaceId: workspaceIdSchema, pluginId: z.string().min(1) });
export const pluginInstallRequestSchema = z.object({ workspaceId: workspaceIdSchema, bundle: z.unknown(), approved: z.boolean().default(false) });
export const capabilityGrantRequestSchema = z.object({ workspaceId: workspaceIdSchema, pluginId: z.string().min(1), capabilities: z.array(z.string().min(1)) });
export const toolExecutionRequestSchema = z.object({ workspaceId: workspaceIdSchema, toolId: z.string().min(1), input: z.unknown().optional(), approvalId: z.string().min(1).optional() });
export const toolApprovalLookupRequestSchema = z.object({ workspaceId: workspaceIdSchema, approvalId: z.string().min(1) });
export const toolApprovalDecisionRequestSchema = z.object({ workspaceId: workspaceIdSchema, approvalId: z.string().min(1), decision: z.enum(["approved", "denied"]) });
export const toolApprovalSchema = z.object({ id: z.string().min(1), workspaceId: workspaceIdSchema, pluginId: z.string().min(1), toolId: z.string().min(1), risk: z.string().min(1), status: z.enum(["pending", "approved", "denied", "consumed"]), requestedAt: z.string(), decidedAt: z.string().nullable(), consumedAt: z.string().nullable() });
export const toolExecutionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("executed"), toolId: z.string(), approvalId: z.string().optional(), result: z.unknown().optional() }),
  z.object({ status: z.literal("approval-required"), toolId: z.string(), risk: z.string(), approvalId: z.string() }),
  z.object({ status: z.literal("denied"), toolId: z.string(), reason: z.string() }),
]);
export const settingWriteRequestSchema = z.object({ workspaceId: workspaceIdSchema, scope: settingScopeSchema, key: z.string().min(1), value: z.unknown() });
export const zoneStateSchema = z.object({ id: z.string().min(1), title: z.string(), accepts: z.array(z.string()) });
export const placementStateSchema = z.object({ surfaceId: z.string(), zoneId: z.string(), order: z.number().int().nonnegative() });
export const workspaceLayoutSchema = z.object({ zones: z.array(zoneStateSchema), placements: z.array(placementStateSchema) });
export const layoutWriteRequestSchema = z.object({ workspaceId: workspaceIdSchema, layout: workspaceLayoutSchema });

export const appErrorCodeSchema = z.enum(["validation_failed", "not_authenticated", "not_authorized", "not_found", "conflict", "approval_required", "dependency_unavailable", "rate_limited", "internal_error"]);
export const appErrorSchema = z.object({ code: appErrorCodeSchema, message: z.string().min(1), requestId: z.string().min(1).optional(), fieldErrors: z.record(z.string(), z.array(z.string())).optional(), details: z.record(z.string(), z.unknown()).optional(), retryable: z.boolean().default(false) });
export const errorResponseSchema = z.object({ error: appErrorSchema });
export const notificationLevelSchema = z.enum(["info", "success", "warning", "error"]);
export const notificationSchema = z.object({ id: z.string().min(1), level: notificationLevelSchema, title: z.string().min(1), message: z.string().optional(), source: z.string().min(1).default("platform"), dismissible: z.boolean().default(true), createdAt: z.string(), action: z.object({ label: z.string().min(1), commandId: z.string().min(1) }).optional() });
export type ToolExecutionRequest = z.output<typeof toolExecutionRequestSchema>;
export type ToolApprovalLookupRequest = z.output<typeof toolApprovalLookupRequestSchema>;
export type ToolApprovalDecisionRequest = z.output<typeof toolApprovalDecisionRequestSchema>;
export type ToolApproval = z.output<typeof toolApprovalSchema>;
export type ToolExecutionResult = z.output<typeof toolExecutionResultSchema>;
export type SettingScope = z.output<typeof settingScopeSchema>;
export type WorkspaceLayout = z.output<typeof workspaceLayoutSchema>;
export type AppErrorCode = z.output<typeof appErrorCodeSchema>;
export type AppError = z.output<typeof appErrorSchema>;
export type ErrorResponse = z.output<typeof errorResponseSchema>;
export type Notification = z.output<typeof notificationSchema>;
export type NotificationLevel = z.output<typeof notificationLevelSchema>;
