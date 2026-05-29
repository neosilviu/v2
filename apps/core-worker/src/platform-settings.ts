import { ui, type SettingsSection } from "@v2/ui-schema";

const field = ui.field;
const column = ui.column;
const allowPermissionField = field({ id: "permission", label: "Permission", type: "text", required: true });

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
  title: "Roles",
  description: "Reusable permission profiles assigned through workspace memberships.",
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
  description: "Workspace memberships connect users, roles and effective permission overrides.",
  dataSourceId: "platform.settings.rbac.members",
  columns: [
    column({ id: "user", label: "User", field: "user" }),
    column({ id: "status", label: "Status", field: "status", type: "badge" }),
    column({ id: "roles", label: "Roles", field: "roles" }),
    column({ id: "permissions", label: "Permissions", field: "permissions" }),
    column({ id: "overrides", label: "Overrides", field: "overrides" }),
  ],
  rowActions: [
    ui.rowAction("platform.settings.rbac.member.impersonate", "Impersonate", { variant: "primary", access: "permission-gated", requiredPermission: "workspace.impersonate", confirmation: { title: "Impersonate user", message: "You will switch into the selected user's view. This action is audited.", reasonRequired: true, fields: [field({ id: "reason", label: "Reason", type: "textarea", required: true })] }, effects: [{ type: "toast", message: "Impersonation started" }, { type: "closeDialog" }, { type: "navigate", to: "/" }] }),
    ui.rowAction("platform.settings.rbac.member.override.allow", "Allow permission", { access: "permission-gated", requiredPermission: "workspace.members.manage", confirmation: { title: "Allow permission", fields: [allowPermissionField] } }),
    ui.rowAction("platform.settings.rbac.member.override.deny", "Deny permission", { variant: "danger", access: "permission-gated", requiredPermission: "workspace.members.manage", confirmation: { title: "Deny permission", fields: [allowPermissionField] } }),
    ui.rowAction("platform.settings.rbac.member.override.remove", "Remove override", { access: "permission-gated", requiredPermission: "workspace.members.manage", confirmation: { title: "Remove override", fields: [allowPermissionField] } }),
  ],
});

const plans = ui.crud({
  id: "access.plans",
  title: "Workspace plans",
  description: "Plans and limits available for users and workspace access.",
  dataSourceId: "platform.settings.plans.list",
  entity: { singular: "Plan", plural: "Plans", titleField: "name" },
  operations: { create: "platform.settings.plans.upsert", delete: "platform.settings.plans.delete" },
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
  operations: { create: "platform.settings.plans.assignment.upsert", delete: "platform.settings.plans.assignment.delete" },
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
  ui.table({ id: "mail.providers", title: "Mail providers", dataSourceId: "platform.settings.mail.providers", columns: [column({ id: "label", label: "Label", field: "label" }), column({ id: "kind", label: "Kind", field: "kind" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "fromEmail", label: "From email", field: "fromEmail" })], rowActions: [ui.rowAction("platform.settings.mail.provider.activate", "Activate", { variant: "primary", access: "permission-gated", requiredPermission: "mail.configure" }), ui.rowAction("platform.settings.mail.provider.disable", "Disable", { variant: "danger", access: "permission-gated", requiredPermission: "mail.configure" })] }),
  ui.table({ id: "mail.templates", title: "Templates", dataSourceId: "platform.settings.mail.templates", columns: [column({ id: "templateKey", label: "Template", field: "templateKey" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "locale", label: "Locale", field: "locale" }), column({ id: "subjectTemplate", label: "Subject", field: "subjectTemplate" })] }),
  ui.table({ id: "mail.events", title: "Delivery events", dataSourceId: "platform.settings.mail.events", columns: [column({ id: "purpose", label: "Purpose", field: "purpose" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "templateKey", label: "Template", field: "templateKey" }), column({ id: "errorSafe", label: "Result", field: "errorSafe" })] }),
];

const domains = ui.crud({
  id: "domains.manage",
  title: "Domains",
  description: "Map public hosts to runtime routes and verify DNS ownership.",
  dataSourceId: "platform.settings.domains.list",
  entity: { singular: "Domain", plural: "Domains", titleField: "hostname" },
  operations: { create: "platform.settings.domains.create", delete: "platform.settings.domains.delete" },
  columns: [column({ id: "hostname", label: "Hostname", field: "hostname" }), column({ id: "kind", label: "Kind", field: "kind" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "verificationMethod", label: "Verification", field: "verificationMethod" }), column({ id: "publicationId", label: "Publication", field: "publicationId" })],
  fields: [field({ id: "hostname", label: "Hostname", type: "text", required: true }), field({ id: "kind", label: "Kind", type: "select", required: true, options: [{ value: "admin", label: "Admin" }, { value: "auth", label: "Auth" }, { value: "website", label: "Website" }, { value: "storefront", label: "Storefront" }, { value: "public-chat", label: "Public chat" }, { value: "mail", label: "Mail sender" }] }), field({ id: "verificationMethod", label: "Verification method", type: "select", required: true, options: [{ value: "manual", label: "Manual" }, { value: "dns-txt", label: "DNS TXT" }, { value: "dns-cname", label: "DNS CNAME" }] }), field({ id: "isPrimary", label: "Primary domain", type: "boolean" })],
  rowActions: [ui.rowAction("platform.settings.domains.verify", "Verify", { access: "permission-gated", requiredPermission: "domains.verify" }), ui.rowAction("platform.settings.domains.activate", "Activate", { access: "permission-gated", requiredPermission: "domains.write" }), ui.rowAction("platform.settings.domains.disable", "Disable", { variant: "danger", access: "permission-gated", requiredPermission: "domains.write" })],
});

export function platformSettingsTabs() {
  const general = ui.panel({ id: "platform.settings.general", label: "General", icon: "settings", order: 10, permission: "workspace.settings.read", sections: [workspaceSettings, ...mailSections, domains] });
  const security = ui.panel({ id: "platform.settings.security", label: "Security", icon: "shield", order: 20, permission: "auth.read", sections: [authentication, members, roles, plans, assignments] });
  const interfacePanel = ui.panel({ id: "platform.settings.interface", label: "Interface", icon: "layout", order: 30, permission: "interface.read", sections: [ui.table({ id: "interface.builder", title: "Interface builder", description: "Navigation, layout, manual pages and UI contributions.", dataSourceId: "platform.settings.interface.summary", actions: [ui.submit("platform.settings.interface.save", "interface.write", "Save interface")] })] });
  const audit = ui.panel({ id: "platform.settings.audit", label: "Audit", icon: "history", order: 40, permission: "audit.read", sections: [ui.table({ id: "audit.events", title: "Audit log", description: "Read-only workspace activity stream.", dataSourceId: "platform.settings.audit.events", columns: [column({ id: "actorId", label: "Actor", field: "actorId" }), column({ id: "action", label: "Action", field: "action" }), column({ id: "payload", label: "Target / result", field: "payload" }), column({ id: "createdAt", label: "Time", field: "createdAt", type: "date" })] })] });
  return [general, security, interfacePanel, audit];
}

export default platformSettingsTabs;
