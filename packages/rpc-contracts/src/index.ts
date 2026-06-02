import { z } from "zod";

export const workspaceIdSchema = z.string().min(1);
export const settingScopeSchema = z.union([
  z.literal("platform"),
  z.string().regex(/^plugin:[a-zA-Z0-9._-]+$/),
]);
export const pluginActivationRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  pluginId: z.string().min(1),
});
export const pluginInstallRequestSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    bundle: z.unknown().optional(),
    approvalId: z.string().min(1).optional(),
  })
  .refine((value) => value.bundle !== undefined || value.approvalId, {
    message: "A plugin bundle or approvalId is required.",
  });
export const capabilityGrantRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  pluginId: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
});
export const toolExecutionRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  toolId: z.string().min(1),
  input: z.unknown().optional(),
  approvalId: z.string().min(1).optional(),
});
export const toolApprovalLookupRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  approvalId: z.string().min(1),
});
export const toolApprovalDecisionRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "denied"]),
});
export const toolApprovalSchema = z.object({
  id: z.string().min(1),
  workspaceId: workspaceIdSchema,
  pluginId: z.string().min(1),
  toolId: z.string().min(1),
  risk: z.string().min(1),
  status: z.enum([
    "pending",
    "approved",
    "executing",
    "denied",
    "consumed",
    "failed",
  ]),
  requestedAt: z.string(),
  decidedAt: z.string().nullable(),
  consumedAt: z.string().nullable(),
});
export const approvalRequestKindSchema = z.enum([
  "tool_execute",
  "plugin_install",
  "plugin_update",
  "plugin_publish",
  "public_publish",
  "auth_config_publish",
]);
export const approvalRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "consumed",
  "revoked",
]);
export const approvalRequestDecisionSchema = z.enum(["approved", "denied"]);
export const approvalRequestSchema = z.object({
  id: z.string().min(1),
  workspaceId: workspaceIdSchema,
  kind: approvalRequestKindSchema,
  subjectId: z.string().min(1),
  pluginId: z.string().min(1).nullable(),
  risk: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  status: approvalRequestStatusSchema,
  requestedBy: z.string().nullable(),
  decidedBy: z.string().nullable(),
  requestedAt: z.string(),
  decidedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  consumedAt: z.string().nullable(),
  reason: z.string().nullable(),
});
export const approvalRequestDecisionRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  decision: approvalRequestDecisionSchema,
  reason: z.string().max(1000).optional(),
});
export const workspacePublicationSchema = z.object({
  id: z.string().min(1),
  workspaceId: workspaceIdSchema,
  pluginId: z.string().min(1),
  contributionKind: z.enum(["route", "surface", "tool"]),
  publicationType: z.enum(["route", "surface", "tool", "content"]).optional(),
  contributionId: z.string().min(1),
  publicPath: z.string().min(1),
  routePattern: z.string().min(1).optional(),
  routeKind: z.enum(["exact", "parameterized"]).optional(),
  routePriority: z.number().int().optional(),
  parameterNames: z.array(z.string()).optional(),
  title: z.string().min(1),
  templateId: z.string().min(1).optional(),
  status: z.enum(["draft", "published", "unpublished", "disabled"]),
  policyId: z.string().nullable(),
  access: z.enum(["anonymous", "authenticated"]),
  authenticationMode: z.enum(["anonymous", "customer", "verified"]).optional(),
  createdAt: z.string().optional(),
  publishedAt: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
});
export const workspacePublicationListSchema = z.object({
  publications: z.array(workspacePublicationSchema),
});
export const workspacePublicationCreateRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  pluginId: z.string().min(1),
  contributionKind: z.enum(["route", "surface", "tool"]),
  contributionId: z.string().min(1),
  publicPath: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  access: z.enum(["anonymous", "authenticated"]).optional(),
});
export const workspacePublicationUpdateRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  title: z.string().min(1).optional(),
  publicPath: z.string().min(1).optional(),
  status: z.enum(["draft", "published", "unpublished", "disabled"]).optional(),
  access: z.enum(["anonymous", "authenticated"]).optional(),
  authenticationMode: z.enum(["anonymous", "customer", "verified"]).optional(),
});
export const workspaceMemberSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email().optional(),
    name: z.string().nullable().optional(),
  }),
  status: z.enum(["active", "invited", "disabled"]),
  roles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      systemKey: z.string().nullable(),
    }),
  ),
  permissions: z.array(z.string()),
  overrides: z
    .array(
      z.object({ permission: z.string(), effect: z.enum(["allow", "deny"]) }),
    )
    .default([]),
});
export const workspaceMemberListSchema = z.object({
  members: z.array(workspaceMemberSchema),
});
export const workspaceRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  systemKey: z.string().nullable(),
  description: z.string().nullable(),
  permissions: z.array(z.string()),
});
export const workspaceRoleListSchema = z.object({
  roles: z.array(workspaceRoleSchema),
});
export const workspaceMemberOverrideSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  permission: z.string(),
  effect: z.enum(["allow", "deny"]),
});
export const workspaceMemberOverrideListSchema = z.object({
  overrides: z.array(workspaceMemberOverrideSchema),
});
export const workspacePlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["active", "draft", "disabled"]),
  limits: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const workspacePlanListSchema = z.object({
  plans: z.array(workspacePlanSchema),
});
export const userPlanAssignmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  planId: z.string(),
  status: z.enum(["active", "scheduled", "expired", "disabled"]),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const userPlanAssignmentListSchema = z.object({
  assignments: z.array(userPlanAssignmentSchema),
});
export const auditEventSchema = z.object({
  id: z.string().min(1),
  workspaceId: workspaceIdSchema.nullable(),
  actorId: z.string().nullable(),
  action: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export const auditEventListSchema = z.object({
  events: z.array(auditEventSchema),
});
export const toolExecutionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("executed"),
    toolId: z.string(),
    approvalId: z.string().optional(),
    result: z.unknown().optional(),
  }),
  z.object({
    status: z.literal("approval-required"),
    toolId: z.string(),
    risk: z.string(),
    approvalId: z.string(),
  }),
  z.object({
    status: z.literal("denied"),
    toolId: z.string(),
    reason: z.string(),
  }),
]);
export const settingWriteRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  scope: settingScopeSchema,
  key: z.string().min(1),
  value: z.unknown(),
});
export const zoneStateSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  accepts: z.array(z.string()),
});
export const placementStateSchema = z.object({
  surfaceId: z.string(),
  zoneId: z.string(),
  order: z.number().int().nonnegative(),
});
export const workspaceLayoutSchema = z.object({
  zones: z.array(zoneStateSchema),
  placements: z.array(placementStateSchema),
});
export const layoutWriteRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  layout: workspaceLayoutSchema,
});

export const appErrorCodeSchema = z.enum([
  "validation_failed",
  "not_authenticated",
  "not_authorized",
  "not_found",
  "conflict",
  "approval_required",
  "dependency_unavailable",
  "rate_limited",
  "internal_error",
  "owner_setup_invalid_token",
  "owner_setup_expired",
  "owner_setup_email_mismatch",
  "owner_setup_token_consumed",
  "owner_setup_token_revoked",
  "owner_account_already_exists",
  "owner_password_invalid",
  "owner_signup_failed",
  "owner_membership_activation_failed",
]);
export const appErrorSchema = z.object({
  code: appErrorCodeSchema,
  message: z.string().min(1),
  requestId: z.string().min(1).optional(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean().default(false),
});
export const errorResponseSchema = z.object({ error: appErrorSchema });
export const notificationLevelSchema = z.enum([
  "info",
  "success",
  "warning",
  "error",
]);
export const notificationSchema = z.object({
  id: z.string().min(1),
  level: notificationLevelSchema,
  title: z.string().min(1),
  message: z.string().optional(),
  source: z.string().min(1).default("platform"),
  dismissible: z.boolean().default(true),
  createdAt: z.string(),
  action: z
    .object({ label: z.string().min(1), commandId: z.string().min(1) })
    .optional(),
});
export type ToolExecutionRequest = z.output<typeof toolExecutionRequestSchema>;
export type ToolApprovalLookupRequest = z.output<
  typeof toolApprovalLookupRequestSchema
>;
export type ToolApprovalDecisionRequest = z.output<
  typeof toolApprovalDecisionRequestSchema
>;
export type ToolApproval = z.output<typeof toolApprovalSchema>;
export type ApprovalRequest = z.output<typeof approvalRequestSchema>;
export type ApprovalRequestKind = z.output<typeof approvalRequestKindSchema>;
export type ApprovalRequestDecisionRequest = z.output<
  typeof approvalRequestDecisionRequestSchema
>;
export type WorkspacePublication = z.output<typeof workspacePublicationSchema>;
export type WorkspacePublicationList = z.output<
  typeof workspacePublicationListSchema
>;
export type WorkspacePublicationCreateRequest = z.output<
  typeof workspacePublicationCreateRequestSchema
>;
export type WorkspacePublicationUpdateRequest = z.output<
  typeof workspacePublicationUpdateRequestSchema
>;
export type WorkspaceMember = z.output<typeof workspaceMemberSchema>;
export type WorkspaceMemberList = z.output<typeof workspaceMemberListSchema>;
export type WorkspaceRole = z.output<typeof workspaceRoleSchema>;
export type WorkspaceRoleList = z.output<typeof workspaceRoleListSchema>;
export type WorkspaceMemberOverride = z.output<
  typeof workspaceMemberOverrideSchema
>;
export type WorkspaceMemberOverrideList = z.output<
  typeof workspaceMemberOverrideListSchema
>;
export type WorkspacePlan = z.output<typeof workspacePlanSchema>;
export type WorkspacePlanList = z.output<typeof workspacePlanListSchema>;
export type UserPlanAssignment = z.output<typeof userPlanAssignmentSchema>;
export type UserPlanAssignmentList = z.output<
  typeof userPlanAssignmentListSchema
>;
export type AuditEvent = z.output<typeof auditEventSchema>;
export type AuditEventList = z.output<typeof auditEventListSchema>;
export type ToolExecutionResult = z.output<typeof toolExecutionResultSchema>;
export type SettingScope = z.output<typeof settingScopeSchema>;
export type WorkspaceLayout = z.output<typeof workspaceLayoutSchema>;
export type AppErrorCode = z.output<typeof appErrorCodeSchema>;
export type AppError = z.output<typeof appErrorSchema>;
export type ErrorResponse = z.output<typeof errorResponseSchema>;
export type Notification = z.output<typeof notificationSchema>;
export type NotificationLevel = z.output<typeof notificationLevelSchema>;
