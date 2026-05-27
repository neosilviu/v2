import { z } from "zod";
import { authMethodSchema, authPolicySchema, authPublicLoginConfigSchema, authUiContributionSchema } from "@v2/auth-contracts";
import { mailProviderConfigureSchema, mailProviderPublicSummarySchema, mailProviderTestRequestSchema, mailTemplateSchema } from "@v2/mail-contracts";
import { pluginManifestSchema, toolSchema, surfaceSchema, pluginBundleSchema } from "@v2/plugin-contracts";
import { approvalRequestDecisionRequestSchema, approvalRequestSchema, errorResponseSchema, layoutWriteRequestSchema, toolApprovalDecisionRequestSchema, toolApprovalSchema, toolExecutionRequestSchema, toolExecutionResultSchema, workspaceLayoutSchema } from "@v2/rpc-contracts";
import { runtimeActionRequestSchema, runtimeDataRequestSchema, runtimeResultEnvelopeSchema, settingsPanelContributionSchema, settingsTabContributionSchema } from "@v2/ui-schema";

const emptySchema = z.object({}).strict();
const anyRecordSchema = z.record(z.string(), z.unknown());
const workspaceParamSchema = z.object({ workspaceId: z.string().min(1) });
const pluginParamSchema = z.object({ pluginId: z.string().min(1) });
const domainParamSchema = z.object({ workspaceId: z.string().min(1), domainId: z.string().min(1) });
const providerParamSchema = z.object({ workspaceId: z.string().min(1), providerId: z.string().min(1) });

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
export const ownerSetupStatusSchema = z.object({ setup: z.object({ workspaceId: z.string(), ownerEmail: z.string(), status: z.string(), expiresAt: z.string() }) });
export const ownerSetupConsumeResponseSchema = z.object({ status: z.literal("consumed"), workspaceId: z.string() });
export const ownerSetupSignupRequestSchema = z.object({ token: z.string().min(24), email: z.string().email(), name: z.string().min(1), password: z.string().min(8) });
export const ownerSetupSignupResponseSchema = z.object({ user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable().optional() }).optional() }).passthrough();
export const signInEmailRequestSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const signInEmailResponseSchema = z.object({ user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable().optional() }).optional() }).passthrough();
export const updateUserRequestSchema = z.object({ name: z.string().nullable() });
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
  verificationInstructions: anyRecordSchema.nullable(),
  publicationId: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: z.string(),
  verifiedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export const domainCreateRequestSchema = z.object({
  hostname: z.string().min(1),
  kind: workspaceDomainSchema.shape.kind,
  verificationMethod: workspaceDomainSchema.shape.verificationMethod,
  isPrimary: z.boolean().optional(),
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
export const authPolicyWriteRequestSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  registrationMode: authPolicySchema.shape.registrationMode,
  requireEmailVerification: z.boolean(),
  allowPasskeyRegistration: z.boolean(),
  allowPasskeySignin: z.boolean(),
});
export const authMethodWriteRequestSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  type: authMethodSchema.shape.type,
  providerId: z.string().nullable().optional(),
  title: z.string(),
  status: authMethodSchema.shape.status,
  publicVisible: z.boolean(),
  displayOrder: z.number().int(),
});

export type ApiService = "core" | "auth";
export type ApiMethod = "GET" | "POST" | "PUT" | "HEAD";
export type AuthRequirement = "anonymous" | "session" | "admin" | "internal";
export type ApiEndpoint = {
  service: ApiService;
  operationId: string;
  method: ApiMethod;
  path: string;
  auth: AuthRequirement;
  params: z.ZodTypeAny;
  query: z.ZodTypeAny;
  body: z.ZodTypeAny;
  success: z.ZodTypeAny;
  error: z.ZodTypeAny;
  successStatus: number[];
  errorStatus: number[];
};
function endpoint(input: Omit<ApiEndpoint, "error"> & { error?: z.ZodTypeAny }): ApiEndpoint {
  return { ...input, error: input.error ?? errorResponseSchema };
}

export const apiEndpoints = [
  endpoint({ service: "core", operationId: "coreSession", method: "GET", path: "/session", auth: "anonymous", params: emptySchema, query: emptySchema, body: emptySchema, success: coreSessionSchema, successStatus: [200], errorStatus: [503] }),
  endpoint({ service: "core", operationId: "workspaceBootstrapCurrent", method: "GET", path: "/workspaces/current/bootstrap", auth: "session", params: emptySchema, query: emptySchema, body: emptySchema, success: shellBootstrapSchema, successStatus: [200], errorStatus: [401, 403, 503] }),
  endpoint({ service: "core", operationId: "workspaceBootstrap", method: "GET", path: "/workspaces/{workspaceId}/bootstrap", auth: "session", params: workspaceParamSchema, query: emptySchema, body: emptySchema, success: shellBootstrapSchema, successStatus: [200], errorStatus: [401, 403, 503] }),
  endpoint({ service: "core", operationId: "ownerSetupStatus", method: "GET", path: "/setup/owner", auth: "anonymous", params: emptySchema, query: z.object({ token: z.string().min(24) }), body: emptySchema, success: ownerSetupStatusSchema, successStatus: [200], errorStatus: [404] }),
  endpoint({ service: "core", operationId: "ownerSetupConsume", method: "POST", path: "/setup/owner/consume", auth: "session", params: emptySchema, query: emptySchema, body: z.object({ token: z.string().min(24) }), success: ownerSetupConsumeResponseSchema, successStatus: [200], errorStatus: [400, 401, 403, 404, 409] }),
  endpoint({ service: "core", operationId: "currentRbac", method: "GET", path: "/workspaces/{workspaceId}/rbac/me", auth: "session", params: workspaceParamSchema, query: emptySchema, body: emptySchema, success: rbacMeSchema, successStatus: [200], errorStatus: [401, 403] }),
  endpoint({ service: "core", operationId: "saveLayout", method: "PUT", path: "/layouts", auth: "session", params: emptySchema, query: emptySchema, body: layoutWriteRequestSchema, success: z.object({ saved: z.boolean(), layout: workspaceLayoutSchema }), successStatus: [200], errorStatus: [400, 401, 403] }),
  endpoint({ service: "core", operationId: "settingsTab", method: "GET", path: "/workspaces/{workspaceId}/settings/tabs/{tabId}", auth: "session", params: z.object({ workspaceId: z.string(), tabId: z.string() }), query: emptySchema, body: emptySchema, success: runtimeSettingsTabResolutionSchema, successStatus: [200], errorStatus: [401, 403, 404] }),
  endpoint({ service: "core", operationId: "settingsTabOrder", method: "POST", path: "/workspaces/{workspaceId}/settings/tabs/order", auth: "session", params: workspaceParamSchema, query: emptySchema, body: z.object({ tabIds: z.array(z.string()) }), success: z.object({ saved: z.boolean() }), successStatus: [200], errorStatus: [400, 401, 403] }),
  endpoint({ service: "core", operationId: "runtimeData", method: "POST", path: "/runtime/ui/data", auth: "session", params: emptySchema, query: emptySchema, body: runtimeDataRequestSchema, success: runtimeResultEnvelopeSchema, successStatus: [200, 202], errorStatus: [400, 401, 403, 501, 503] }),
  endpoint({ service: "core", operationId: "runtimeAction", method: "POST", path: "/runtime/ui/actions", auth: "session", params: emptySchema, query: emptySchema, body: runtimeActionRequestSchema, success: runtimeResultEnvelopeSchema, successStatus: [200, 202], errorStatus: [400, 401, 403, 501, 503] }),
  endpoint({ service: "core", operationId: "activatePlugin", method: "POST", path: "/plugins/activate", auth: "session", params: emptySchema, query: emptySchema, body: z.object({ workspaceId: z.string(), pluginId: z.string() }), success: anyRecordSchema, successStatus: [200, 201], errorStatus: [400, 401, 403, 404, 409] }),
  endpoint({ service: "core", operationId: "deactivatePlugin", method: "POST", path: "/plugins/deactivate", auth: "session", params: emptySchema, query: emptySchema, body: z.object({ workspaceId: z.string(), pluginId: z.string() }), success: anyRecordSchema, successStatus: [200], errorStatus: [400, 401, 403, 404] }),
  endpoint({ service: "core", operationId: "generalSettings", method: "GET", path: "/workspaces/{workspaceId}/settings/general", auth: "session", params: workspaceParamSchema, query: emptySchema, body: emptySchema, success: z.object({ settings: anyRecordSchema }), successStatus: [200], errorStatus: [401, 403] }),
  endpoint({ service: "core", operationId: "saveGeneralSettings", method: "PUT", path: "/workspaces/{workspaceId}/settings/general", auth: "session", params: workspaceParamSchema, query: emptySchema, body: anyRecordSchema, success: z.object({ settings: anyRecordSchema }), successStatus: [200], errorStatus: [400, 401, 403] }),
  endpoint({ service: "core", operationId: "settingsScope", method: "GET", path: "/workspaces/{workspaceId}/settings/{scope}", auth: "session", params: z.object({ workspaceId: z.string(), scope: z.string() }), query: emptySchema, body: emptySchema, success: z.object({ settings: anyRecordSchema }), successStatus: [200], errorStatus: [400, 401, 403] }),
  endpoint({ service: "core", operationId: "securityBootstrap", method: "GET", path: "/workspaces/{workspaceId}/auth/security-bootstrap", auth: "session", params: workspaceParamSchema, query: emptySchema, body: emptySchema, success: authSecurityBootstrapSchema, successStatus: [200], errorStatus: [401, 403, 503] }),
  endpoint({ service: "core", operationId: "saveAuthPolicy", method: "PUT", path: "/workspaces/{workspaceId}/auth/policy", auth: "session", params: workspaceParamSchema, query: emptySchema, body: authPolicyWriteRequestSchema, success: z.object({ policy: authPolicySchema }), successStatus: [200], errorStatus: [400, 401, 403, 409, 503] }),
  endpoint({ service: "core", operationId: "saveAuthMethod", method: "PUT", path: "/workspaces/{workspaceId}/auth/methods/{methodId}", auth: "session", params: z.object({ workspaceId: z.string(), methodId: z.string() }), query: emptySchema, body: authMethodWriteRequestSchema, success: z.object({ method: authMethodSchema }), successStatus: [200], errorStatus: [400, 401, 403] }),
  endpoint({ service: "core", operationId: "authUiContributions", method: "GET", path: "/workspaces/{workspaceId}/auth/ui-contributions", auth: "session", params: workspaceParamSchema, query: emptySchema, body: emptySchema, success: z.object({ contributions: z.array(authUiContributionSchema) }), successStatus: [200], errorStatus: [401, 403] }),
  endpoint({ service: "core", operationId: "domains", method: "GET", path: "/workspaces/{workspaceId}/domains", auth: "session", params: workspaceParamSchema, query: emptySchema, body: emptySchema, success: z.object({ domains: z.array(workspaceDomainSchema) }), successStatus: [200], errorStatus: [401, 403] }),
  endpoint({ service: "core", operationId: "createDomain", method: "POST", path: "/workspaces/{workspaceId}/domains", auth: "session", params: workspaceParamSchema, query: emptySchema, body: domainCreateRequestSchema, success: z.object({ domains: z.array(workspaceDomainSchema) }), successStatus: [201], errorStatus: [400, 401, 403] }),
  endpoint({ service: "core", operationId: "verifyDomain", method: "POST", path: "/workspaces/{workspaceId}/domains/{domainId}/verify", auth: "session", params: domainParamSchema, query: emptySchema, body: emptySchema, success: z.object({ domains: z.array(workspaceDomainSchema) }), successStatus: [200], errorStatus: [400, 401, 403, 404] }),
  endpoint({ service: "core", operationId: "activateDomain", method: "POST", path: "/workspaces/{workspaceId}/domains/{domainId}/activate", auth: "session", params: domainParamSchema, query: emptySchema, body: emptySchema, success: z.object({ domains: z.array(workspaceDomainSchema) }), successStatus: [200], errorStatus: [400, 401, 403, 404] }),
  endpoint({ service: "core", operationId: "disableDomain", method: "POST", path: "/workspaces/{workspaceId}/domains/{domainId}/disable", auth: "session", params: domainParamSchema, query: emptySchema, body: emptySchema, success: z.object({ domains: z.array(workspaceDomainSchema) }), successStatus: [200], errorStatus: [401, 403, 404] }),
  endpoint({ service: "core", operationId: "mailSummary", method: "GET", path: "/workspaces/{workspaceId}/mail", auth: "session", params: workspaceParamSchema, query: emptySchema, body: emptySchema, success: mailSummarySchema, successStatus: [200], errorStatus: [401, 403] }),
  endpoint({ service: "core", operationId: "configureMailProvider", method: "POST", path: "/workspaces/{workspaceId}/mail/providers", auth: "session", params: workspaceParamSchema, query: emptySchema, body: mailProviderConfigureSchema, success: mailSummarySchema, successStatus: [201], errorStatus: [400, 401, 403] }),
  endpoint({ service: "core", operationId: "activateMailProvider", method: "POST", path: "/workspaces/{workspaceId}/mail/providers/{providerId}/activate", auth: "session", params: providerParamSchema, query: emptySchema, body: emptySchema, success: mailSummarySchema, successStatus: [200], errorStatus: [401, 403, 404] }),
  endpoint({ service: "core", operationId: "disableMailProvider", method: "POST", path: "/workspaces/{workspaceId}/mail/providers/{providerId}/disable", auth: "session", params: providerParamSchema, query: emptySchema, body: emptySchema, success: mailSummarySchema, successStatus: [200], errorStatus: [401, 403, 404] }),
  endpoint({ service: "core", operationId: "testMailProvider", method: "POST", path: "/workspaces/{workspaceId}/mail/providers/{providerId}/test", auth: "session", params: providerParamSchema, query: emptySchema, body: mailProviderTestRequestSchema, success: z.object({ ok: z.boolean(), status: z.string(), eventId: z.string().nullable().optional(), errorSafe: z.string().nullable().optional() }).passthrough(), successStatus: [200], errorStatus: [400, 401, 403] }),
  endpoint({ service: "core", operationId: "executeTool", method: "POST", path: "/tools/execute", auth: "session", params: emptySchema, query: emptySchema, body: toolExecutionRequestSchema, success: toolExecutionResultSchema, successStatus: [200, 202], errorStatus: [400, 401, 403, 404, 503] }),
  endpoint({ service: "core", operationId: "decideToolApproval", method: "POST", path: "/tool-approvals/decision", auth: "session", params: emptySchema, query: emptySchema, body: toolApprovalDecisionRequestSchema, success: z.object({ approval: toolApprovalSchema }), successStatus: [200], errorStatus: [400, 401, 403, 409] }),
  endpoint({ service: "core", operationId: "pendingToolApprovals", method: "GET", path: "/workspaces/{workspaceId}/tool-approvals", auth: "session", params: workspaceParamSchema, query: emptySchema, body: emptySchema, success: z.object({ approvals: z.array(toolApprovalSchema) }), successStatus: [200], errorStatus: [401, 403] }),
  endpoint({ service: "core", operationId: "pendingApprovalRequests", method: "GET", path: "/workspaces/{workspaceId}/approval-requests", auth: "session", params: workspaceParamSchema, query: emptySchema, body: emptySchema, success: z.object({ approvals: z.array(approvalRequestSchema) }), successStatus: [200], errorStatus: [401, 403] }),
  endpoint({ service: "core", operationId: "decideApprovalRequest", method: "POST", path: "/approval-requests/{approvalId}/decision", auth: "session", params: z.object({ approvalId: z.string() }), query: emptySchema, body: approvalRequestDecisionRequestSchema, success: z.object({ approval: approvalRequestSchema }), successStatus: [200], errorStatus: [400, 401, 403, 409] }),
  endpoint({ service: "core", operationId: "marketplacePlugins", method: "GET", path: "/marketplace/plugins", auth: "session", params: emptySchema, query: z.object({ workspaceId: z.string().optional() }), body: emptySchema, success: z.object({ plugins: z.array(marketplacePluginSchema) }), successStatus: [200], errorStatus: [401, 403] }),
  endpoint({ service: "core", operationId: "installMarketplacePlugin", method: "POST", path: "/marketplace/plugins/{pluginId}/install", auth: "session", params: pluginParamSchema, query: z.object({ workspaceId: z.string() }), body: z.object({ approvalId: z.string().optional() }).partial().optional().default({}), success: pluginInstallResultSchema, successStatus: [201, 202], errorStatus: [400, 401, 403, 404, 409, 502] }),
  endpoint({ service: "core", operationId: "approveInstall", method: "POST", path: "/plugins/install", auth: "session", params: emptySchema, query: emptySchema, body: z.object({ workspaceId: z.string(), approvalId: z.string() }), success: z.object({ status: z.string(), manifest: pluginManifestSchema }), successStatus: [200, 201], errorStatus: [400, 401, 403, 409] }),
  endpoint({ service: "core", operationId: "grantCapabilities", method: "POST", path: "/plugins/grants", auth: "session", params: emptySchema, query: emptySchema, body: z.object({ workspaceId: z.string(), pluginId: z.string(), capabilities: z.array(z.string()) }), success: z.object({ pluginId: z.string(), capabilities: z.array(z.string()) }), successStatus: [200], errorStatus: [400, 401, 403, 404] }),
  endpoint({ service: "core", operationId: "uploadPlugin", method: "POST", path: "/plugins/upload", auth: "session", params: emptySchema, query: z.object({ workspaceId: z.string() }), body: z.any(), success: z.object({ status: z.string(), manifest: pluginManifestSchema.optional(), approvalId: z.string().optional(), pluginId: z.string().optional(), version: z.string().optional(), sha256: z.string().optional(), sensitiveCapabilities: z.array(z.string()).optional() }), successStatus: [201, 202], errorStatus: [400, 401, 403, 413, 502] }),
  endpoint({ service: "core", operationId: "publishMarketplaceRelease", method: "POST", path: "/marketplace/plugins/{pluginId}/releases", auth: "session", params: pluginParamSchema, query: emptySchema, body: z.any(), success: z.object({ status: z.string(), bundle: pluginBundleSchema, sensitiveCapabilities: z.array(z.string()) }).passthrough(), successStatus: [201], errorStatus: [400, 401, 403, 413] }),
  endpoint({ service: "auth", operationId: "loginConfig", method: "GET", path: "/public/auth/login-config", auth: "anonymous", params: emptySchema, query: z.object({ workspaceId: z.string().optional() }), body: emptySchema, success: authPublicLoginConfigSchema, successStatus: [200], errorStatus: [503] }),
  endpoint({ service: "auth", operationId: "signInEmail", method: "POST", path: "/api/auth/sign-in/email", auth: "anonymous", params: emptySchema, query: emptySchema, body: signInEmailRequestSchema, success: signInEmailResponseSchema, successStatus: [200], errorStatus: [400, 401, 422] }),
  endpoint({ service: "auth", operationId: "signOut", method: "POST", path: "/api/auth/sign-out", auth: "session", params: emptySchema, query: emptySchema, body: emptySchema, success: z.unknown(), successStatus: [200], errorStatus: [401] }),
  endpoint({ service: "auth", operationId: "updateUser", method: "POST", path: "/api/auth/update-user", auth: "session", params: emptySchema, query: emptySchema, body: updateUserRequestSchema, success: z.unknown(), successStatus: [200], errorStatus: [400, 401, 422] }),
  endpoint({ service: "auth", operationId: "ownerSetupSignup", method: "POST", path: "/setup/owner/sign-up/email", auth: "anonymous", params: emptySchema, query: emptySchema, body: ownerSetupSignupRequestSchema, success: ownerSetupSignupResponseSchema, successStatus: [200], errorStatus: [400, 403, 404, 409, 422, 503] }),
] as const satisfies readonly ApiEndpoint[];

export type ApiEndpointDefinition = typeof apiEndpoints[number];
export type ApiOperationId = ApiEndpointDefinition["operationId"];
export function endpointByOperation(operationId: ApiOperationId) {
  const found = apiEndpoints.find((item) => item.operationId === operationId);
  if (!found) throw new Error(`Unknown API operation: ${operationId}`);
  return found;
}
