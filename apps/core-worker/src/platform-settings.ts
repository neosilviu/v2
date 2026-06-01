import { ui, type SettingsSection } from "@v2/ui-schema";

const field = ui.field;
const column = ui.column;
const permissionField = field({ id: "permission", label: "Permission", type: "text", required: true });

const users = ui.table({
  id: "security.users",
  title: "Users",
  description: "Global Auth identities. Superadmin accounts are protected platform identities and are not workspace roles; workspace access is configured separately through Memberships.",
  dataSourceId: "platform.settings.users.list",
  columns: [
    column({ id: "name", label: "Name", field: "name" }),
    column({ id: "email", label: "Email", field: "email" }),
    column({ id: "accountType", label: "Account", field: "accountType", type: "badge" }),
    column({ id: "protected", label: "Protected", field: "protected", type: "badge" }),
    column({ id: "emailVerified", label: "Verified", field: "emailVerified", type: "badge" }),
    column({ id: "passkeys", label: "Passkeys", field: "passkeys" }),
    column({ id: "sessions", label: "Sessions", field: "sessions" }),
    column({ id: "createdAt", label: "Created", field: "createdAt", type: "date" }),
  ],
  rowActions: [
    ui.rowAction("platform.settings.users.view", "View", { access: "permission-gated", requiredPermission: "auth.read" }),
    ui.rowAction("platform.settings.users.edit", "Edit", { access: "permission-gated", requiredPermission: "auth.admin" }),
    ui.rowAction("platform.settings.users.impersonate", "Impersonate", { variant: "primary", access: "permission-gated", requiredPermission: "workspace.impersonate", confirmation: { title: "Impersonate user", message: "Only platform Superadmin may impersonate normal users. Superadmin accounts are protected targets and cannot be impersonated. This action is audited.", reasonRequired: true, fields: [field({ id: "reason", label: "Reason", type: "textarea", required: true })] }, effects: [{ type: "toast", message: "Impersonation started" }, { type: "navigate", to: "/" }] }),
    ui.rowAction("platform.settings.users.disable", "Disable", { variant: "danger", access: "permission-gated", requiredPermission: "auth.admin", confirmation: { title: "Disable user", message: "Protected Superadmin accounts cannot be disabled. Normal users will be blocked from signing in." } }),
    ui.rowAction("platform.settings.users.delete", "Delete", { variant: "danger", access: "permission-gated", requiredPermission: "auth.admin", confirmation: { title: "Delete user", message: "Protected Superadmin accounts cannot be deleted. This action is destructive and audited." } }),
  ],
});

const authentication = ui.form({
  id: "security.authentication",
  title: "Security controls",
  description: "Control password registration, email verification and passkey availability for the workspace.",
  dataSourceId: "platform.settings.security.bootstrap",
  fields: [
    field({ id: "registrationMode", label: "Registration policy", type: "select", required: true, options: [{ value: "disabled", label: "Disabled" }, { value: "open", label: "Open" }, { value: "invitation-only", label: "Invitation only" }, { value: "admin-created", label: "Admin created" }] }),
    field({ id: "requireEmailVerification", label: "Require email verification", type: "boolean" }),
    field({ id: "allowPasskeyRegistration", label: "Allow passkey registration", type: "boolean" }),
    field({ id: "allowPasskeySignin", label: "Allow passkey sign-in", type: "boolean" }),
  ],
  actions: [ui.submit("platform.settings.security.policy.save", "auth.admin", "Save security policy")],
});

const roles = ui.crud({
  id: "security.roles",
  title: "Workspace roles",
  description: "Workspace roles are Owner, Admin, Editor and Viewer plus optional custom roles. Superadmin is a protected platform account, not a role, and is intentionally hidden here.",
  dataSourceId: "platform.settings.rbac.roles",
  entity: { singular: "Role", plural: "Roles", titleField: "name" },
  operations: { create: "platform.settings.rbac.role.create", update: "platform.settings.rbac.role.update", delete: "platform.settings.rbac.role.delete" },
  columns: [
    column({ id: "name", label: "Role", field: "name" }),
    column({ id: "systemKey", label: "Type", field: "systemKey" }),
    column({ id: "description", label: "Description", field: "description" }),
    column({ id: "permissions", label: "Permissions", field: "permissions" }),
  ],
  fields: [
    field({ id: "name", label: "Name", type: "text", required: true }),
    field({ id: "description", label: "Description", type: "textarea" }),
  ],
});

const members = ui.table({
  id: "security.members",
  title: "Memberships",
  description: "Workspace memberships connect users to Owner, Admin, Editor and Viewer roles. Superadmin access is global and does not require membership.",
  dataSourceId: "platform.settings.rbac.members",
  columns: [
    column({ id: "user", label: "User", field: "user" }),
    column({ id: "status", label: "Status", field: "status", type: "badge" }),
    column({ id: "roles", label: "Roles", field: "roles" }),
    column({ id: "permissions", label: "Permissions", field: "permissions" }),
    column({ id: "overrides", label: "Overrides", field: "overrides" }),
    column({ id: "isLastOwner", label: "Last owner", field: "isLastOwner", type: "badge" }),
  ],
  rowActions: [
    ui.rowAction("platform.settings.rbac.member.impersonate", "Impersonate", { variant: "primary", access: "permission-gated", requiredPermission: "workspace.impersonate", confirmation: { title: "Impersonate member", message: "Only platform Superadmin may impersonate normal members. Superadmin cannot be impersonated and impersonation is always audited.", reasonRequired: true, fields: [field({ id: "reason", label: "Reason", type: "textarea", required: true })] }, effects: [{ type: "toast", message: "Impersonation started" }, { type: "closeDialog" }, { type: "navigate", to: "/" }] }),
    ui.rowAction("platform.settings.rbac.member.override.allow", "Allow permission", { access: "permission-gated", requiredPermission: "workspace.members.manage", confirmation: { title: "Allow permission", message: "Explicit overrides should be rare. They are audited and evaluated after role permissions.", fields: [permissionField] } }),
    ui.rowAction("platform.settings.rbac.member.override.deny", "Deny permission", { variant: "danger", access: "permission-gated", requiredPermission: "workspace.members.manage", confirmation: { title: "Deny permission", message: "Do not deny permissions on the last active Owner. This operation is audited.", fields: [permissionField] } }),
    ui.rowAction("platform.settings.rbac.member.override.remove", "Remove override", { access: "permission-gated", requiredPermission: "workspace.members.manage", confirmation: { title: "Remove override", fields: [permissionField] } }),
  ],
});

const permissions = ui.table({
  id: "security.permissions",
  title: "Permissions",
  description: "Permission catalogue with role assignments and explicit member override counts for this workspace. Superadmin bypass is global and not stored as a workspace permission.",
  dataSourceId: "platform.settings.permissions.list",
  columns: [
    column({ id: "name", label: "Permission", field: "name" }),
    column({ id: "category", label: "Category", field: "category" }),
    column({ id: "roleCount", label: "Roles", field: "roleCount" }),
    column({ id: "memberOverrideCount", label: "Overrides", field: "memberOverrideCount" }),
  ],
});

const workspaces = ui.crud({
  id: "security.workspaces",
  title: "Workspaces",
  description: "Tenant workspaces. Owners create and manage workspace access within plan limits; Superadmin can administer every workspace globally.",
  dataSourceId: "platform.settings.workspaces.list",
  entity: { singular: "Workspace", plural: "Workspaces", titleField: "name" },
  operations: { create: "platform.settings.workspaces.upsert", update: "platform.settings.workspaces.upsert", delete: "platform.settings.workspaces.delete" },
  columns: [
    column({ id: "id", label: "Workspace ID", field: "id" }),
    column({ id: "name", label: "Name", field: "name" }),
    column({ id: "status", label: "Status", field: "status", type: "badge" }),
    column({ id: "updatedAt", label: "Updated", field: "updatedAt", type: "date" }),
  ],
  fields: [
    field({ id: "id", label: "Workspace ID", type: "text" }),
    field({ id: "name", label: "Name", type: "text", required: true }),
    field({ id: "status", label: "Status", type: "select", required: true, options: [{ value: "unprovisioned", label: "Unprovisioned" }, { value: "provisioning", label: "Provisioning" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }] }),
  ],
});

const plans = ui.crud({
  id: "access.plans",
  title: "Workspace plans",
  description: "Plans define workspace creation and feature limits for Owners. Superadmin can assign and override plans.",
  dataSourceId: "platform.settings.plans.list",
  entity: { singular: "Plan", plural: "Plans", titleField: "name" },
  operations: { create: "platform.settings.plans.upsert", update: "platform.settings.plans.upsert", delete: "platform.settings.plans.delete" },
  columns: [
    column({ id: "id", label: "Plan ID", field: "id" }),
    column({ id: "name", label: "Name", field: "name" }),
    column({ id: "status", label: "Status", field: "status", type: "badge" }),
    column({ id: "limits", label: "Limits", field: "limits" }),
  ],
  fields: [
    field({ id: "id", label: "Plan ID", type: "text", required: true }),
    field({ id: "name", label: "Name", type: "text", required: true }),
    field({ id: "status", label: "Status", type: "select", required: true, options: [{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "disabled", label: "Disabled" }] }),
    field({ id: "limits", label: "Limits JSON", type: "textarea", required: true }),
  ],
});

const assignments = ui.crud({
  id: "access.assignments",
  title: "User plan assignments",
  description: "Assign an available workspace plan to a user account.",
  dataSourceId: "platform.settings.plans.assignments",
  entity: { singular: "Assignment", plural: "Assignments", titleField: "planId" },
  operations: { create: "platform.settings.plans.assignment.upsert", update: "platform.settings.plans.assignment.upsert", delete: "platform.settings.plans.assignment.delete" },
  columns: [
    column({ id: "userId", label: "User", field: "userId" }),
    column({ id: "planId", label: "Plan", field: "planId" }),
    column({ id: "status", label: "Status", field: "status", type: "badge" }),
    column({ id: "startsAt", label: "Starts", field: "startsAt", type: "date" }),
    column({ id: "endsAt", label: "Ends", field: "endsAt", type: "date" }),
  ],
  fields: [
    field({ id: "userId", label: "User ID", type: "text", required: true }),
    field({ id: "planId", label: "Plan ID", type: "text", required: true }),
    field({ id: "status", label: "Status", type: "select", required: true, options: [{ value: "active", label: "Active" }, { value: "scheduled", label: "Scheduled" }, { value: "expired", label: "Expired" }, { value: "disabled", label: "Disabled" }] }),
    field({ id: "startsAt", label: "Starts at", type: "date" }),
    field({ id: "endsAt", label: "Ends at", type: "date" }),
  ],
});

const invites = ui.crud({
  id: "security.invites",
  title: "Invites",
  description: "Invite users into this workspace and assign the initial membership role.",
  dataSourceId: "platform.settings.invites.list",
  entity: { singular: "Invite", plural: "Invites", titleField: "email" },
  operations: { create: "platform.settings.invites.create", delete: "platform.settings.invites.delete" },
  columns: [
    column({ id: "email", label: "Email", field: "email" }),
    column({ id: "roleName", label: "Role", field: "roleName" }),
    column({ id: "status", label: "Status", field: "status", type: "badge" }),
    column({ id: "expiresAt", label: "Expires", field: "expiresAt", type: "date" }),
    column({ id: "createdAt", label: "Created", field: "createdAt", type: "date" }),
  ],
  fields: [
    field({ id: "email", label: "Email", type: "email", required: true }),
    field({ id: "roleId", label: "Role ID", type: "text" }),
    field({ id: "expiresAt", label: "Expires at", type: "date" }),
  ],
  rowActions: [
    ui.rowAction("platform.settings.invites.revoke", "Revoke", { variant: "danger", access: "permission-gated", requiredPermission: "workspace.members.manage" }),
  ],
});

const workspaceSettings = ui.form({
  id: "general.workspace",
  title: "Workspace settings",
  description: "Workspace name, language, timezone, currency and branding.",
  dataSourceId: "platform.settings.general.read",
  fields: [
    field({ id: "workspaceName", label: "Workspace name", type: "text", required: true }),
    field({ id: "language", label: "Language", type: "text" }),
    field({ id: "timezone", label: "Timezone", type: "text" }),
    field({ id: "defaultCurrency", label: "Default currency", type: "text" }),
    field({ id: "brandingName", label: "Brand name", type: "text" }),
    field({ id: "brandColor", label: "Brand color", type: "color" }),
    field({ id: "contactEmailPublic", label: "Public contact email", type: "email" }),
    field({ id: "contactPhonePublic", label: "Public contact phone", type: "text" }),
  ],
  actions: [ui.submit("platform.settings.general.save", "workspace.settings.write")],
});

const mailSections: SettingsSection[] = [
  ui.form({ id: "mail.provider", title: "Mail provider", description: "Configure delivery used for invites and account workflows.", dataSourceId: "platform.settings.mail.summary", fields: [field({ id: "kind", label: "Provider kind", type: "select", required: true, options: [{ value: "transactional-http", label: "Transactional HTTP" }, { value: "smtp", label: "SMTP" }, { value: "mock-development-only", label: "Mock development only" }] }), field({ id: "label", label: "Label", type: "text", required: true }), field({ id: "fromName", label: "From name", type: "text", required: true }), field({ id: "fromEmail", label: "From email", type: "email", required: true }), field({ id: "replyToEmail", label: "Reply-to email", type: "email" }), field({ id: "configurationRef", label: "Secret reference", type: "text" })], actions: [ui.submit("platform.settings.mail.provider.save", "mail.configure", "Save provider")] }),
  ui.table({ id: "mail.providers", title: "Mail providers", dataSourceId: "platform.settings.mail.providers", columns: [column({ id: "label", label: "Label", field: "label" }), column({ id: "kind", label: "Kind", field: "kind" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "fromEmail", label: "From email", field: "fromEmail" })], rowActions: [ui.rowAction("platform.settings.mail.provider.activate", "Activate", { variant: "primary", access: "permission-gated", requiredPermission: "mail.configure" }), ui.rowAction("platform.settings.mail.provider.disable", "Disable", { variant: "danger", access: "permission-gated", requiredPermission: "mail.configure" }), ui.rowAction("platform.settings.mail.provider.test", "Send test", { access: "permission-gated", requiredPermission: "mail.test", confirmation: { title: "Send test email", fields: [field({ id: "to", label: "Recipient", type: "email", required: true })] } })] }),
  ui.table({ id: "mail.templates", title: "Templates", dataSourceId: "platform.settings.mail.templates", columns: [column({ id: "key", label: "Template", field: "key" }), column({ id: "subject", label: "Subject", field: "subject" }), column({ id: "enabled", label: "Enabled", field: "enabled", type: "badge" }), column({ id: "updatedAt", label: "Updated", field: "updatedAt", type: "date" })] }),
  ui.table({ id: "mail.events", title: "Delivery events", dataSourceId: "platform.settings.mail.events", columns: [column({ id: "createdAt", label: "Created", field: "createdAt", type: "date" }), column({ id: "templateKey", label: "Template", field: "templateKey" }), column({ id: "recipient", label: "Recipient", field: "recipient" }), column({ id: "status", label: "Status", field: "status", type: "badge" })] }),
];

export const platformSettingsTabs = [
  ui.settingsTab({ id: "platform.settings.general", label: "General", description: "Workspace profile, domains and mail runtime.", icon: "settings", order: 10, requiredPermission: "workspace.settings.read", sections: [workspaceSettings, ui.table({ id: "general.domains", title: "Domains", description: "Verified hostnames for admin, auth, website, storefront, chat and mail.", dataSourceId: "platform.settings.domains.list", columns: [column({ id: "hostname", label: "Hostname", field: "hostname" }), column({ id: "kind", label: "Kind", field: "kind" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "primary", label: "Primary", field: "primary", type: "badge" })] }), ...mailSections] }),
  ui.settingsTab({ id: "platform.settings.security", label: "Security", description: "Authentication, users, memberships, roles, permissions, sessions and audit.", icon: "shield", order: 20, requiredPermission: "auth.read", sections: [authentication, users, members, roles, permissions, invites, ui.table({ id: "security.sessions", title: "Sessions", dataSourceId: "platform.settings.sessions.list", columns: [column({ id: "user", label: "User", field: "user" }), column({ id: "device", label: "Device", field: "device" }), column({ id: "lastActive", label: "Last active", field: "lastActive", type: "date" }), column({ id: "expiresAt", label: "Expires", field: "expiresAt", type: "date" })] }), ui.table({ id: "security.audit", title: "Audit", description: "Security-sensitive changes and administrative activity.", dataSourceId: "platform.settings.audit.list", columns: [column({ id: "createdAt", label: "Time", field: "createdAt", type: "date" }), column({ id: "actor", label: "Actor", field: "actor" }), column({ id: "action", label: "Action", field: "action" }), column({ id: "target", label: "Target", field: "target" })] })] }),
  ui.settingsTab({ id: "platform.settings.plans", label: "Plans", description: "Workspace plans, limits and assignments.", icon: "credit-card", order: 30, requiredPermission: "plans.read", sections: [plans, assignments] }),
  ui.settingsTab({ id: "platform.settings.interface", label: "Interface", description: "Navigation, shell zones, menus and generated pages.", icon: "layout", order: 40, requiredPermission: "interface.read", sections: [ui.table({ id: "interface.navigation", title: "Navigation", dataSourceId: "platform.settings.interface.navigation", columns: [column({ id: "label", label: "Label", field: "label" }), column({ id: "section", label: "Section", field: "section" }), column({ id: "path", label: "Path", field: "path" }), column({ id: "visible", label: "Visible", field: "visible", type: "badge" })], rowActions: [ui.rowAction("platform.settings.interface.nav.edit", "Edit", { access: "permission-gated", requiredPermission: "interface.write" }), ui.rowAction("platform.settings.interface.nav.hide", "Hide", { access: "permission-gated", requiredPermission: "interface.write" })] }), ui.table({ id: "interface.zones", title: "Zones", dataSourceId: "platform.settings.interface.zones", columns: [column({ id: "zoneId", label: "Zone", field: "zoneId" }), column({ id: "surfaceCount", label: "Surfaces", field: "surfaceCount" })] })] }),
  ui.settingsTab({ id: "platform.settings.marketplace", label: "Marketplace", description: "Plugins, approvals and runtime deployments.", icon: "plug", order: 50, requiredPermission: "marketplace.read", sections: [ui.table({ id: "marketplace.plugins", title: "Installed plugins", dataSourceId: "platform.settings.marketplace.plugins", columns: [column({ id: "name", label: "Plugin", field: "name" }), column({ id: "version", label: "Version", field: "version" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "runtimeStatus", label: "Runtime", field: "runtimeStatus", type: "badge" })] }), ui.table({ id: "marketplace.approvals", title: "Approvals", dataSourceId: "platform.settings.approvals.list", columns: [column({ id: "kind", label: "Kind", field: "kind" }), column({ id: "risk", label: "Risk", field: "risk", type: "badge" }), column({ id: "requestedBy", label: "Requested by", field: "requestedBy" }), column({ id: "createdAt", label: "Created", field: "createdAt", type: "date" })] })] }),
  ui.settingsTab({ id: "platform.settings.workspaces", label: "Workspaces", description: "Tenant workspace registry, ownership and plan-aware creation.", icon: "building", order: 60, requiredPermission: "workspaces.read", sections: [workspaces] }),
];
