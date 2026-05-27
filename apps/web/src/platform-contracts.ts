import { z } from "zod";
import { authMethodSchema, authPolicySchema, authPublicLoginConfigSchema, authUiContributionSchema } from "@v2/auth-contracts";
import { mailProviderConfigureSchema, mailProviderPublicSummarySchema, mailProviderTestResultSchema, mailTemplateSchema } from "@v2/mail-contracts";
import { pluginBundleSchema, pluginManifestSchema, pluginOperationSchema, publicRouteContributionSchema, publicSurfaceContributionSchema, publicToolContributionSchema, surfaceSchema, toolSchema } from "@v2/plugin-contracts";
import { approvalRequestSchema, auditEventSchema, toolApprovalSchema, toolExecutionResultSchema, workspaceLayoutSchema, workspacePublicationSchema } from "@v2/rpc-contracts";
import { declarativePageContributionSchema, runtimeResultEnvelopeSchema as uiRuntimeResultEnvelopeSchema, settingsPanelContributionSchema, settingsTabContributionSchema } from "@v2/ui-schema";

export const coreSessionSchema = z.object({
  authenticated: z.boolean(),
  isAdmin: z.boolean(),
  user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable() }).nullable(),
});

export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  roles: z.array(z.object({ name: z.string(), system_key: z.string().nullable() })),
  permissions: z.array(z.string()),
});

export const rbacMeSchema = z.object({
  user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable().optional() }).nullable(),
  roles: z.union([z.array(z.object({ name: z.string(), system_key: z.string().nullable() })), z.array(z.string())]),
  permissions: z.array(z.string()),
  recoveryAdmin: z.boolean().optional(),
  bootstrap: z.boolean().optional(),
});

export const runtimeSettingsTabSchema = settingsTabContributionSchema.extend({ ownerName: z.string(), orderIndex: z.number().int() });
export const runtimeSettingsTabResolutionSchema = z.object({ tab: runtimeSettingsTabSchema, panel: settingsPanelContributionSchema });

export const ownerSetupStatusSchema = z.object({ setup: z.object({ workspaceId: z.string(), ownerEmail: z.string(), status: z.string(), expiresAt: z.string() }) });
export const ownerSetupConsumeResponseSchema = z.object({ status: z.literal("consumed"), workspaceId: z.string() });

export const marketplacePluginSchema = z.object({
  manifest: pluginManifestSchema,
  category: z.string(),
  demoAvailable: z.boolean(),
  installed: z.boolean(),
  active: z.boolean(),
  source: z.string().optional(),
});
export const pluginInstallResultSchema = z.union([
  z.object({ status: z.literal("installed"), plugin: marketplacePluginSchema }),
  z.object({ status: z.literal("approval-required"), approvalId: z.string(), pluginId: z.string(), version: z.string(), sha256: z.string(), sensitiveCapabilities: z.array(z.string()) }),
]);

export const workspaceDomainSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  hostname: z.string(),
  kind: z.enum(["admin", "auth", "website", "storefront", "public-chat", "mail"]),
  status: z.enum(["draft", "verifying", "verified", "active", "disabled"]),
  verificationMethod: z.enum(["manual", "dns-txt", "dns-cname"]),
  verificationInstructions: z.record(z.string(), z.unknown()).nullable(),
  publicationId: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: z.string(),
  verifiedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const mailSummarySchema = z.object({
  providers: z.array(mailProviderPublicSummarySchema),
  templates: z.array(mailTemplateSchema),
  events: z.array(z.object({
    id: z.string(),
    provider_id: z.string().nullable(),
    template_key: z.string().nullable(),
    status: z.string(),
    purpose: z.string(),
    error_safe: z.string().nullable(),
    created_at: z.string(),
    completed_at: z.string().nullable(),
  })),
  activeProvider: mailProviderPublicSummarySchema.nullable(),
});

export const authSecuritySummarySchema = z.object({
  policy: authPolicySchema,
  methods: z.array(authMethodSchema),
  publishedLoginContributions: z.number(),
  serverSideAvailability: z.object({ password: z.boolean(), passkey: z.boolean(), github: z.boolean() }),
  emailDelivery: z.object({ verification: z.boolean(), passwordReset: z.boolean(), status: z.string() }),
  bootstrapAdmin: z.boolean(),
});

export const authSecurityBootstrapSchema = z.object({
  summary: authSecuritySummarySchema,
  sessions: z.object({ sessions: z.number(), passkeys: z.number() }),
  rbac: rbacMeSchema,
  mail: z.object({ activeTransactionalProvider: z.boolean() }),
});

export const shellBootstrapSchema = z.object({
  session: coreSessionSchema,
  workspaces: z.array(workspaceSummarySchema),
  currentWorkspace: workspaceSummarySchema,
  membership: rbacMeSchema,
  layout: workspaceLayoutSchema.nullable(),
  plugins: z.array(pluginManifestSchema),
  active: z.array(z.string()),
  tools: z.array(toolSchema),
  surfaces: z.array(surfaceSchema),
  settingsNavigation: z.object({ pluginTabs: z.array(runtimeSettingsTabSchema) }),
  featureAvailability: z.object({
    canReadMarketplace: z.boolean(),
    canInstallPlugins: z.boolean(),
    canActivatePlugins: z.boolean(),
    canUploadPlugins: z.boolean(),
  }),
});

export const runtimeResultEnvelopeSchema = uiRuntimeResultEnvelopeSchema;
export const workspacePublicationListSchema = z.object({ publications: z.array(workspacePublicationSchema) });
export const workspacePublicationEnvelopeSchema = z.object({ publication: workspacePublicationSchema });
export const auditEventListSchema = z.object({ events: z.array(auditEventSchema) });
export const approvalRequestListSchema = z.object({ approvals: z.array(approvalRequestSchema) });

export type CoreSession = z.output<typeof coreSessionSchema>;
export type WorkspaceSummary = z.output<typeof workspaceSummarySchema>;
export type RbacMe = z.output<typeof rbacMeSchema>;
export type RuntimeSettingsTab = z.output<typeof runtimeSettingsTabSchema>;
export type RuntimeSettingsTabResolution = z.output<typeof runtimeSettingsTabResolutionSchema>;
export type OwnerSetupStatus = z.output<typeof ownerSetupStatusSchema>;
export type OwnerSetupConsumeResponse = z.output<typeof ownerSetupConsumeResponseSchema>;
export type MarketplacePlugin = z.output<typeof marketplacePluginSchema>;
export type PluginInstallResult = z.output<typeof pluginInstallResultSchema>;
export type WorkspaceDomain = z.output<typeof workspaceDomainSchema>;
export type AuthSecuritySummary = z.output<typeof authSecuritySummarySchema>;
export type AuthSecurityBootstrap = z.output<typeof authSecurityBootstrapSchema>;
export type ShellBootstrap = z.output<typeof shellBootstrapSchema>;
export type WorkspacePublication = z.output<typeof workspacePublicationSchema>;
export type WorkspacePublicationList = z.output<typeof workspacePublicationListSchema>;
export type WorkspacePublicationEnvelope = z.output<typeof workspacePublicationEnvelopeSchema>;
export type AuditEvent = z.output<typeof auditEventSchema>;
export type AuditEventList = z.output<typeof auditEventListSchema>;
export type ApprovalRequestList = z.output<typeof approvalRequestListSchema>;
