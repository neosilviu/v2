import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
const now = sql`CURRENT_TIMESTAMP`;
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status", { enum: ["unprovisioned", "provisioning", "active", "suspended"] }).notNull().default("unprovisioned"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});
export const workspaceMembers = sqliteTable("workspace_members", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  email: text("email"),
  status: text("status", { enum: ["active", "invited", "disabled"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId] }), index("workspace_members_email_idx").on(table.workspaceId, table.email), index("workspace_members_status_idx").on(table.workspaceId, table.status)]);
export const workspaceRoles = sqliteTable("workspace_roles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  systemKey: text("system_key"),
  description: text("description"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [uniqueIndex("workspace_roles_system_idx").on(table.workspaceId, table.systemKey), index("workspace_roles_workspace_idx").on(table.workspaceId)]);
export const workspaceRolePermissions = sqliteTable("workspace_role_permissions", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  roleId: text("role_id").notNull().references(() => workspaceRoles.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
  createdAt: text("created_at").notNull().default(now),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.roleId, table.permission] }), index("workspace_role_permissions_permission_idx").on(table.workspaceId, table.permission)]);
export const workspaceMemberRoles = sqliteTable("workspace_member_roles", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  roleId: text("role_id").notNull().references(() => workspaceRoles.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(now),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId, table.roleId] }), index("workspace_member_roles_user_idx").on(table.workspaceId, table.userId)]);
export const workspaceInvitations = sqliteTable("workspace_invitations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  roleId: text("role_id").references(() => workspaceRoles.id, { onDelete: "set null" }),
  status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] }).notNull().default("pending"),
  tokenHash: text("token_hash"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [index("workspace_invitations_workspace_idx").on(table.workspaceId, table.status), index("workspace_invitations_email_idx").on(table.workspaceId, table.email)]);
export const serviceIdentities = sqliteTable("service_identities", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["internal-worker", "runtime-bridge", "local-node"] }).notNull(),
  status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
  credentialRef: text("credential_ref"),
  capabilitiesJson: text("capabilities_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [index("service_identities_workspace_idx").on(table.workspaceId, table.status), index("service_identities_kind_idx").on(table.workspaceId, table.kind)]);
export const workspaceDomains = sqliteTable("workspace_domains", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull(),
  kind: text("kind", { enum: ["admin", "auth", "website", "storefront", "public-chat"] }).notNull(),
  status: text("status", { enum: ["draft", "verifying", "verified", "active", "disabled"] }).notNull().default("draft"),
  verificationMethod: text("verification_method", { enum: ["manual", "dns-txt", "dns-cname"] }).notNull().default("manual"),
  verificationTokenHash: text("verification_token_hash"),
  verificationInstructionsJson: text("verification_instructions_json"),
  publicationId: text("publication_id"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now),
  verifiedAt: text("verified_at"),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [uniqueIndex("workspace_domains_hostname_idx").on(table.workspaceId, table.hostname), index("workspace_domains_status_idx").on(table.workspaceId, table.status), index("workspace_domains_kind_idx").on(table.workspaceId, table.kind)]);
export const pluginCatalog = sqliteTable("plugin_catalog", { pluginId: text("plugin_id").primaryKey(), name: text("name").notNull(), version: text("version").notNull(), manifestJson: text("manifest_json").notNull(), category: text("category").notNull(), demoAvailable: integer("demo_available", { mode: "boolean" }).notNull().default(false), source: text("source").notNull().default("official"), createdAt: text("created_at").notNull().default(now), updatedAt: text("updated_at").notNull().default(now) }, (table) => [index("plugin_catalog_source_idx").on(table.source), index("plugin_catalog_category_idx").on(table.category)]);
export const pluginCatalogReleases = sqliteTable("plugin_catalog_releases", { id: text("id").primaryKey(), pluginId: text("plugin_id").notNull().references(() => pluginCatalog.pluginId, { onDelete: "cascade" }), version: text("version").notNull(), manifestJson: text("manifest_json").notNull(), packageObjectKey: text("package_object_key").notNull(), sha256: text("sha256").notNull(), sizeBytes: integer("size_bytes").notNull(), format: text("format").notNull(), workerIsolation: text("worker_isolation").notNull().default("none"), uiMode: text("ui_mode").notNull().default("declarative"), status: text("status", { enum: ["draft", "published", "deprecated"] }).notNull().default("draft"), source: text("source").notNull().default("official"), createdAt: text("created_at").notNull().default(now), publishedAt: text("published_at"), updatedAt: text("updated_at").notNull().default(now) }, (table) => [uniqueIndex("plugin_catalog_releases_identity_idx").on(table.pluginId, table.version, table.sha256), index("plugin_catalog_releases_plugin_status_idx").on(table.pluginId, table.status), index("plugin_catalog_releases_source_idx").on(table.source)]);
export const installedPlugins = sqliteTable("installed_plugins", { id: text("id").primaryKey(), name: text("name").notNull(), version: text("version").notNull(), manifestJson: text("manifest_json").notNull(), packageObjectKey: text("package_object_key"), packageSha256: text("package_sha256"), packageSizeBytes: integer("package_size_bytes"), packageFormat: text("package_format"), workerIsolation: text("worker_isolation").notNull().default("none"), uiMode: text("ui_mode").notNull().default("declarative"), installedAt: text("installed_at").notNull().default(now), updatedAt: text("updated_at").notNull().default(now) });
export const pluginPackages = sqliteTable("plugin_packages", { id: text("id").primaryKey(), pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }), version: text("version").notNull(), objectKey: text("object_key").notNull(), sha256: text("sha256").notNull(), sizeBytes: integer("size_bytes").notNull(), format: text("format").notNull(), createdAt: text("created_at").notNull().default(now) }, (table) => [uniqueIndex("plugin_packages_identity_idx").on(table.pluginId, table.version, table.sha256), uniqueIndex("plugin_packages_object_key_idx").on(table.objectKey)]);
export const pluginUiContributions = sqliteTable("plugin_ui_contributions", {
  id: text("id").primaryKey(),
  pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }),
  contributionId: text("contribution_id").notNull(),
  contributionType: text("contribution_type", { enum: ["surface", "page", "route", "slot", "menu"] }).notNull(),
  accessMode: text("access_mode", { enum: ["private", "authenticated", "permission-gated", "public-candidate"] }).notNull().default("private"),
  zoneId: text("zone_id"),
  templateId: text("template_id").notNull(),
  schemaJson: text("schema_json").notNull(),
  requiredPermission: text("required_permission"),
  version: text("version").notNull(),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [uniqueIndex("plugin_ui_contributions_identity_idx").on(table.pluginId, table.contributionId, table.version), index("plugin_ui_contributions_plugin_idx").on(table.pluginId), index("plugin_ui_contributions_template_idx").on(table.templateId)]);
export const pluginCapabilities = sqliteTable("plugin_capabilities", { pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }), capabilityId: text("capability_id").notNull(), description: text("description"), risk: text("risk").notNull().default("safe") }, (table) => [primaryKey({ columns: [table.pluginId, table.capabilityId] })]);
export const workspacePlugins = sqliteTable("workspace_plugins", { workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }), active: integer("active", { mode: "boolean" }).notNull().default(true), activatedAt: text("activated_at"), deactivatedAt: text("deactivated_at"), updatedAt: text("updated_at").notNull().default(now) }, (table) => [primaryKey({ columns: [table.workspaceId, table.pluginId] }), index("workspace_plugins_workspace_idx").on(table.workspaceId, table.active)]);
export const workspaceUiActivations = sqliteTable("workspace_ui_activations", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }),
  contributionId: text("contribution_id").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  zoneOverride: text("zone_override"),
  orderIndex: integer("order_index").notNull().default(0),
  configurationJson: text("configuration_json"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.pluginId, table.contributionId] }), index("workspace_ui_activations_workspace_idx").on(table.workspaceId, table.enabled)]);
export const workspaceCapabilityGrants = sqliteTable("workspace_capability_grants", { workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }), capabilityId: text("capability_id").notNull(), grantedAt: text("granted_at").notNull().default(now) }, (table) => [primaryKey({ columns: [table.workspaceId, table.pluginId, table.capabilityId] })]);
export const toolApprovals = sqliteTable("tool_approvals", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }), toolId: text("tool_id").notNull(), risk: text("risk").notNull(), inputJson: text("input_json"), status: text("status", { enum: ["pending", "approved", "denied", "consumed"] }).notNull().default("pending"), requestedBy: text("requested_by"), decidedBy: text("decided_by"), requestedAt: text("requested_at").notNull().default(now), decidedAt: text("decided_at"), consumedAt: text("consumed_at") }, (table) => [index("tool_approvals_workspace_status_idx").on(table.workspaceId, table.status, table.requestedAt), index("tool_approvals_tool_idx").on(table.toolId, table.requestedAt)]);
export const approvalRequests = sqliteTable("approval_requests", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["tool_execute", "plugin_install", "plugin_update", "plugin_publish", "public_publish", "auth_config_publish"] }).notNull(),
  subjectId: text("subject_id").notNull(),
  pluginId: text("plugin_id"),
  risk: text("risk").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status", { enum: ["pending", "approved", "denied", "expired", "consumed", "revoked"] }).notNull().default("pending"),
  requestedBy: text("requested_by"),
  decidedBy: text("decided_by"),
  requestedAt: text("requested_at").notNull().default(now),
  decidedAt: text("decided_at"),
  expiresAt: text("expires_at"),
  consumedAt: text("consumed_at"),
  reason: text("reason"),
}, (table) => [index("approval_requests_workspace_status_idx").on(table.workspaceId, table.status, table.requestedAt), index("approval_requests_kind_subject_idx").on(table.kind, table.subjectId), index("approval_requests_plugin_idx").on(table.pluginId, table.status)]);
export const workspaceSettings = sqliteTable("workspace_settings", { workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), scope: text("scope").notNull(), key: text("key").notNull(), valueJson: text("value_json").notNull(), updatedAt: text("updated_at").notNull().default(now) }, (table) => [primaryKey({ columns: [table.workspaceId, table.scope, table.key] })]);
export const workspaceLayouts = sqliteTable("workspace_layouts", { workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }), layoutJson: text("layout_json").notNull(), updatedAt: text("updated_at").notNull().default(now) });
export const publicAccessPolicies = sqliteTable("public_access_policies", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), name: text("name").notNull(), access: text("access", { enum: ["anonymous", "authenticated"] }).notNull().default("anonymous"), authenticationMode: text("authentication_mode", { enum: ["anonymous", "customer", "verified"] }).notNull().default("anonymous"), rulesJson: text("rules_json"), allowedOperationsJson: text("allowed_operations_json").notNull().default("[]"), rateLimitPolicy: text("rate_limit_policy"), cachePolicy: text("cache_policy"), enabled: integer("enabled", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull().default(now), updatedAt: text("updated_at").notNull().default(now) }, (table) => [index("public_access_policies_workspace_idx").on(table.workspaceId), index("public_access_policies_enabled_idx").on(table.workspaceId, table.enabled)]);
export const workspacePublications = sqliteTable("workspace_publications", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }), contributionKind: text("contribution_kind", { enum: ["route", "surface", "tool"] }).notNull().default("route"), publicationType: text("publication_type", { enum: ["route", "surface", "tool", "content"] }).notNull().default("route"), contributionId: text("contribution_id").notNull(), publicPath: text("public_path").notNull(), routePattern: text("route_pattern").notNull().default("/"), routePriority: integer("route_priority").notNull().default(0), routeKind: text("route_kind", { enum: ["exact", "parameterized"] }).notNull().default("exact"), parameterNamesJson: text("parameter_names_json"), title: text("title").notNull().default("Published page"), templateId: text("template_id").notNull().default("public.contentPage"), schemaJson: text("schema_json").notNull().default("{}"), status: text("status", { enum: ["draft", "published", "unpublished", "disabled"] }).notNull().default("draft"), policyId: text("policy_id").references(() => publicAccessPolicies.id, { onDelete: "set null" }), createdAt: text("created_at").notNull().default(now), publishedAt: text("published_at"), updatedAt: text("updated_at").notNull().default(now) }, (table) => [uniqueIndex("workspace_publications_path_idx").on(table.workspaceId, table.publicPath), index("workspace_publications_plugin_idx").on(table.workspaceId, table.pluginId), index("workspace_publications_status_idx").on(table.workspaceId, table.status), index("workspace_publications_route_idx").on(table.workspaceId, table.routeKind, table.status)]);
export const workspaceThemeTokens = sqliteTable("workspace_theme_tokens", { workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), tokenKey: text("token_key").notNull(), tokenValue: text("token_value").notNull(), scope: text("scope", { enum: ["admin", "public", "both"] }).notNull().default("both"), updatedAt: text("updated_at").notNull().default(now) }, (table) => [primaryKey({ columns: [table.workspaceId, table.tokenKey, table.scope] })]);
export const auditEvents = sqliteTable("audit_events", { id: text("id").primaryKey(), workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }), actorId: text("actor_id"), action: text("action").notNull(), payloadJson: text("payload_json"), createdAt: text("created_at").notNull().default(now) }, (table) => [index("audit_events_workspace_idx").on(table.workspaceId, table.createdAt), index("audit_events_action_idx").on(table.action)]);
