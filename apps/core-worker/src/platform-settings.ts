import { ui, type SettingsSection } from "@v2/ui-schema";

const field = ui.field;
const column = ui.column;
const allowPermissionField = field({ id: "permission", label: "Permission", type: "text", required: true });

const authentication = ui.form({
  id: "security.authentication",
  title: "Authentication & registration",
  description: "Control password registration, verification and passkey availability.",
  dataSourceId: "platform.settings.security.bootstrap",
  fields: [
    field({ id: "registrationMode", label: "Registration policy", type: "select", required: true, options: [{ value: "disabled", label: "Disabled" }, { value: "open", label: "Open" }, { value: "invitation-only", label: "Invitation only" }, { value: "admin-created", label: "Admin created" }] }),
    field({ id: "requireEmailVerification", label: "Require email verification", type: "boolean" }),
    field({ id: "allowPasskeyRegistration", label: "Allow passkey registration", type: "boolean" }),
    field({ id: "allowPasskeySignin", label: "Allow passkey sign-in", type: "boolean" }),
  ],
  actions: [ui.submit("platform.settings.security.policy.save", "auth.admin", "Save policy")],
});

const roles = ui.crud({
  id: "security.roles",
  title: "Roles & permissions",
  description: "Reusable access profiles assigned to workspace users.",
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
  title: "Users, roles & overrides",
  description: "Review member status, role access and start audited impersonation for support.",
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
  title: "Plans & limits",
  description: "Subscription plans that control workspace and feature entitlements.",
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
  description: "Connect workspace users to subscription plans and their active access state.",
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

const mailSections: SettingsSection[] = [
  ui.form({ id: "mail.provider", title: "Mail provider", description: "Transactional provider configuration and verification.", dataSourceId: "platform.settings.mail.summary", fields: [field({ id: "kind", label: "Provider kind", type: "select", required: true, options: [{ value: "transactional-http", label: "Transactional HTTP" }, { value: "smtp", label: "SMTP" }, { value: "mock-development-only", label: "Mock development only" }] }), field({ id: "label", label: "Label", type: "text", required: true }), field({ id: "fromName", label: "From name", type: "text", required: true }), field({ id: "fromEmail", label: "From email", type: "email", required: true }), field({ id: "replyToEmail", label: "Reply-to email", type: "email" }), field({ id: "configurationRef", label: "Secret reference", type: "text" })], actions: [ui.submit("platform.settings.mail.provider.save", "mail.configure", "Save provider")] }),
  ui.table({ id: "mail.providers", title: "Providers", dataSourceId: "platform.settings.mail.providers", columns: [column({ id: "label", label: "Label", field: "label" }), column({ id: "kind", label: "Kind", field: "kind" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "fromEmail", label: "From email", field: "fromEmail" })], rowActions: [ui.rowAction("platform.settings.mail.provider.activate", "Activate", { variant: "primary", access: "permission-gated", requiredPermission: "mail.configure" }), ui.rowAction("platform.settings.mail.provider.disable", "Disable", { variant: "danger", access: "permission-gated", requiredPermission: "mail.configure" })] }),
  ui.table({ id: "mail.templates", title: "Templates", dataSourceId: "platform.settings.mail.templates", columns: [column({ id: "templateKey", label: "Template", field: "templateKey" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "locale", label: "Locale", field: "locale" }), column({ id: "subjectTemplate", label: "Subject", field: "subjectTemplate" })] }),
  ui.table({ id: "mail.events", title: "Delivery events", dataSourceId: "platform.settings.mail.events", columns: [column({ id: "purpose", label: "Purpose", field: "purpose" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "templateKey", label: "Template", field: "templateKey" }), column({ id: "errorSafe", label: "Result", field: "errorSafe" })] }),
];

export function platformSettingsTabs() {
  const general = ui.panel({
    id: "platform.settings.general", label: "General", icon: "settings", order: 10, permission: "workspace.settings.read",
    sections: [
      ui.form({ id: "general.workspace", title: "Workspace settings", description: "Workspace name, language, timezone, currency and branding.", dataSourceId: "platform.settings.general.read", fields: [field({ id: "workspaceName", label: "Workspace name", type: "text", required: true }), field({ id: "language", label: "Language", type: "text" }), field({ id: "timezone", label: "Timezone", type: "text" }), field({ id: "defaultCurrency", label: "Default currency", type: "text" }), field({ id: "brandingName", label: "Brand name", type: "text" }), field({ id: "brandColor", label: "Brand color", type: "color" }), field({ id: "contactEmailPublic", label: "Public contact email", type: "email" }), field({ id: "contactPhonePublic", label: "Public contact phone", type: "text" })], actions: [ui.submit("platform.settings.general.save", "workspace.settings.write")] }),
      ...mailSections,
    ],
  });
  const access = ui.panel({ id: "platform.settings.security", label: "Users & Access", icon: "shield", order: 20, permission: "auth.read", sections: [authentication, members, roles, plans, assignments] });
  const marketplace = ui.panel({ id: "platform.settings.plugins", label: "Marketplace", icon: "package", order: 30, permission: "marketplace.read", sections: [
    ui.table({ id: "plugins.catalog", title: "Available applications", description: "Applications available to install and run in this workspace.", dataSourceId: "platform.settings.plugins.catalog", columns: [column({ id: "name", label: "Application", field: "name" }), column({ id: "category", label: "Category", field: "category" }), column({ id: "version", label: "Version", field: "version" }), column({ id: "installed", label: "Installed", field: "installed", type: "badge" })] }),
    ui.table({ id: "plugins.installed", title: "Installed applications", description: "Applications installed in this workspace and their runtime status.", dataSourceId: "platform.settings.plugins.list", columns: [column({ id: "id", label: "Application", field: "id" }), column({ id: "version", label: "Version", field: "version" }), column({ id: "active", label: "Status", field: "active", type: "badge" }), column({ id: "workerIsolation", label: "Runtime", field: "workerIsolation" })], rowActions: [ui.rowAction("platform.settings.plugins.activate", "Activate", { access: "permission-gated", requiredPermission: "plugin.activate" }), ui.rowAction("platform.settings.plugins.deactivate", "Deactivate", { variant: "danger", access: "permission-gated", requiredPermission: "plugin.activate" })] }),
  ] });
  const domains = ui.panel({ id: "platform.settings.domains", label: "Domains", icon: "globe", order: 40, permission: "domains.read", sections: [ui.crud({ id: "domains.manage", title: "Domains", dataSourceId: "platform.settings.domains.list", entity: { singular: "Domain", plural: "Domains", titleField: "hostname" }, operations: { create: "platform.settings.domains.create", delete: "platform.settings.domains.delete" }, columns: [column({ id: "hostname", label: "Hostname", field: "hostname" }), column({ id: "kind", label: "Kind", field: "kind" }), column({ id: "status", label: "Status", field: "status", type: "badge" }), column({ id: "verificationMethod", label: "Verification", field: "verificationMethod" }), column({ id: "publicationId", label: "Publication", field: "publicationId" })], fields: [field({ id: "hostname", label: "Hostname", type: "text", required: true }), field({ id: "kind", label: "Kind", type: "select", required: true, options: [{ value: "admin", label: "Admin" }, { value: "auth", label: "Auth" }, { value: "website", label: "Website" }, { value: "storefront", label: "Storefront" }, { value: "public-chat", label: "Public chat" }, { value: "mail", label: "Mail sender" }] }), field({ id: "verificationMethod", label: "Verification method", type: "select", required: true, options: [{ value: "manual", label: "Manual" }, { value: "dns-txt", label: "DNS TXT" }, { value: "dns-cname", label: "DNS CNAME" }] }), field({ id: "isPrimary", label: "Primary domain", type: "boolean" })], rowActions: [ui.rowAction("platform.settings.domains.verify", "Verify", { access: "permission-gated", requiredPermission: "domains.verify" }), ui.rowAction("platform.settings.domains.activate", "Activate", { access: "permission-gated", requiredPermission: "domains.write" }), ui.rowAction("platform.settings.domains.disable", "Disable", { variant: "danger", access: "permission-gated", requiredPermission: "domains.write" })] })] });
  const appearance = ui.panel({ id: "platform.settings.interface", label: "Appearance & Navigation", icon: "layout", order: 50, permission: "interface.read", sections: [ui.table({ id: "interface.builder", title: "Interface builder", description: "Navigation, layout, manual pages and UI contributions.", dataSourceId: "platform.settings.interface.summary", actions: [ui.submit("platform.settings.interface.save", "interface.write", "Save interface")] })] });
  const audit = ui.panel({ id: "platform.settings.audit", label: "Activity log", icon: "history", order: 60, permission: "audit.read", sections: [ui.table({ id: "audit.events", title: "Audit log", description: "Read-only workspace activity stream.", dataSourceId: "platform.settings.audit.events", columns: [column({ id: "actorId", label: "Actor", field: "actorId" }), column({ id: "action", label: "Action", field: "action" }), column({ id: "payload", label: "Target / result", field: "payload" }), column({ id: "createdAt", label: "Time", field: "createdAt", type: "date" })] })] });
  return [general, access, marketplace, domains, appearance, audit];
}

export default platformSettingsTabs;
