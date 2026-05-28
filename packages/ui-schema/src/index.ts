import { z } from "zod";

export const templateIdSchema = z.enum([
  "admin.dashboard",
  "admin.crud",
  "admin.table",
  "admin.detail",
  "admin.form",
  "admin.settings",
  "admin.approvals",
  "admin.chat",
  "auth.login",
  "public.contentPage",
  "public.productGrid",
  "public.productDetail",
  "public.cart",
  "public.checkout",
  "public.chat",
]);

export const accessModeSchema = z.enum(["private", "public-candidate", "authenticated", "permission-gated"]);
export const operationIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
export const publicRoutePatternSchema = z.string().regex(/^\/$|^\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*)(?:\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*$/);

export const dataSourceDefinitionSchema = z.object({
  id: operationIdSchema,
  title: z.string().min(1).optional(),
  kind: z.enum(["static", "query", "resource"]).default("static"),
  resource: operationIdSchema.optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  access: accessModeSchema.default("private"),
});

export const fieldDefinitionSchema = z.object({
  id: operationIdSchema,
  label: z.string().min(1),
  type: z.enum(["text", "email", "password", "number", "boolean", "select", "textarea", "color", "date"]),
  required: z.boolean().default(false),
  readOnly: z.boolean().default(false),
  autocomplete: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
});

export const actionDefinitionSchema = z.object({
  id: operationIdSchema,
  title: z.string().min(1),
  commandId: operationIdSchema,
  intent: z.enum(["navigate", "submit", "execute", "approve", "deny"]).default("execute"),
  variant: z.enum(["default", "primary", "danger"]).default("default"),
  access: accessModeSchema.default("private"),
  risk: z.enum(["safe", "reversible", "sensitive", "dangerous"]).default("safe"),
  placement: z.enum(["header", "row", "bulk", "form"]).default("header"),
  requiredPermission: operationIdSchema.optional(),
  confirmation: z.object({
    title: z.string().min(1),
    message: z.string().min(1).optional(),
    reasonRequired: z.boolean().default(false),
    fields: z.array(fieldDefinitionSchema).default([]),
  }).optional(),
  effects: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("refresh") }),
    z.object({ type: z.literal("toast"), title: z.string().min(1).optional(), message: z.string().min(1).optional() }),
    z.object({ type: z.literal("navigate"), to: z.string().min(1) }),
    z.object({ type: z.literal("closeDialog") }),
  ])).default([]),
});

export const columnDefinitionSchema = z.object({
  id: operationIdSchema,
  label: z.string().min(1),
  field: operationIdSchema,
  type: z.enum(["text", "number", "status", "date", "badge"]).default("text"),
  sortable: z.boolean().default(false),
});

export const crudDefinitionSchema = z.object({
  entityLabel: z.string().min(1),
  entityLabelPlural: z.string().min(1),
  rowIdField: operationIdSchema.default("id"),
  rowTitleField: operationIdSchema.optional(),
  listEmptyMessage: z.string().min(1).optional(),
  createActionId: operationIdSchema,
  updateActionId: operationIdSchema,
  deleteActionId: operationIdSchema,
  rowActions: z.array(actionDefinitionSchema).default([]),
  bulkActions: z.array(actionDefinitionSchema).default([]),
});

export const settingsSectionSchema = z.object({
  id: operationIdSchema,
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  kind: z.enum(["summary", "form", "table", "crud", "actions"]).default("form"),
  dataSourceId: operationIdSchema.optional(),
  fields: z.array(fieldDefinitionSchema).default([]),
  columns: z.array(columnDefinitionSchema).default([]),
  actions: z.array(actionDefinitionSchema).default([]),
  rowActions: z.array(actionDefinitionSchema).default([]),
  bulkActions: z.array(actionDefinitionSchema).default([]),
  crud: crudDefinitionSchema.optional(),
});

export const safeRichTextBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string(), tone: z.enum(["default", "muted", "accent"]).default("default") }),
  z.object({ type: z.literal("heading"), text: z.string(), level: z.enum(["h1", "h2", "h3"]).default("h2") }),
  z.object({ type: z.literal("metric"), label: z.string(), value: z.string(), detail: z.string().optional() }),
  z.object({ type: z.literal("image"), src: z.string().url(), alt: z.string().default("") }),
]);

export const slotContributionSchema = z.object({
  id: operationIdSchema,
  slot: operationIdSchema,
  blocks: z.array(safeRichTextBlockSchema).default([]),
  displayOrder: z.number().int().default(0),
});

export const declarativePageContributionSchema = z.object({
  id: operationIdSchema,
  title: z.string().min(1),
  templateId: templateIdSchema,
  access: accessModeSchema.default("private"),
  crud: crudDefinitionSchema.optional(),
  dataSources: z.array(dataSourceDefinitionSchema).default([]),
  actions: z.array(actionDefinitionSchema).default([]),
  fields: z.array(fieldDefinitionSchema).default([]),
  columns: z.array(columnDefinitionSchema).default([]),
  slots: z.array(slotContributionSchema).default([]),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const publicRouteContributionSchema = z.object({
  id: operationIdSchema,
  title: z.string().min(1),
  path: publicRoutePatternSchema,
  pageId: operationIdSchema,
  access: accessModeSchema.default("public-candidate"),
});

export const settingsTabContributionSchema = z.object({
  id: operationIdSchema,
  pluginId: operationIdSchema,
  label: z.string().min(1),
  icon: z.string().min(1).optional(),
  displayOrder: z.number().int().default(0),
  category: z.enum(["platform", "plugin"]),
  requiredPermission: operationIdSchema.optional(),
  panelContributionId: operationIdSchema,
  status: z.enum(["active", "disabled"]).default("active"),
});

export const settingsPanelContributionSchema = z.object({
  id: operationIdSchema,
  pluginId: operationIdSchema,
  tabId: operationIdSchema,
  templateId: z.enum(["admin.settings", "admin.crud", "admin.table", "admin.form", "admin.dashboard"]),
  schema: declarativePageContributionSchema,
  dataSources: z.array(dataSourceDefinitionSchema).default([]),
  actions: z.array(actionDefinitionSchema).default([]),
  sections: z.array(settingsSectionSchema).default([]),
  requiredPermission: operationIdSchema.optional(),
});

export const platformSettingsTabIds = [
  "platform.settings.general",
  "platform.settings.audit",
  "platform.settings.security",
  "platform.settings.plans",
  "platform.settings.domains",
  "platform.settings.plugins",
  "platform.settings.interface",
  "platform.settings.mail",
] as const;
export const platformSettingsTabIdSchema = z.enum(platformSettingsTabIds);
export const runtimeDataRequestSchema = z.object({
  workspaceId: z.string().min(1),
  contributionId: operationIdSchema,
  dataSourceId: operationIdSchema,
  routeParams: z.record(z.string(), z.string()).default({}),
  queryParams: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
});
export const runtimeActionRequestSchema = z.object({
  workspaceId: z.string().min(1),
  contributionId: operationIdSchema,
  actionId: operationIdSchema,
  input: z.unknown().optional(),
  routeParams: z.record(z.string(), z.string()).default({}),
  approvalId: z.string().min(1).optional(),
});
export const runtimeResultEnvelopeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), data: z.unknown().nullable().default(null), error: z.null().default(null), approvalId: z.string().nullable().default(null), auditEventId: z.string().nullable().default(null) }),
  z.object({ status: z.literal("denied"), data: z.null().default(null), error: z.string(), approvalId: z.string().nullable().default(null), auditEventId: z.string().nullable().default(null) }),
  z.object({ status: z.literal("approval-required"), data: z.null().default(null), error: z.string().nullable().default(null), approvalId: z.string(), auditEventId: z.string().nullable().default(null) }),
  z.object({ status: z.literal("unavailable"), data: z.null().default(null), error: z.string(), approvalId: z.string().nullable().default(null), auditEventId: z.string().nullable().default(null) }),
]);

export type TemplateId = z.output<typeof templateIdSchema>;
export type AccessMode = z.output<typeof accessModeSchema>;
export type DataSourceDefinition = z.output<typeof dataSourceDefinitionSchema>;
export type ActionDefinition = z.output<typeof actionDefinitionSchema>;
export type FieldDefinition = z.output<typeof fieldDefinitionSchema>;
export type ColumnDefinition = z.output<typeof columnDefinitionSchema>;
export type CrudDefinition = z.output<typeof crudDefinitionSchema>;
export type SlotContribution = z.output<typeof slotContributionSchema>;
export type DeclarativePageContribution = z.output<typeof declarativePageContributionSchema>;
export type PublicRouteContribution = z.output<typeof publicRouteContributionSchema>;
export type PublicRoutePattern = z.output<typeof publicRoutePatternSchema>;
export type SettingsTabContribution = z.output<typeof settingsTabContributionSchema>;
export type SettingsPanelContribution = z.output<typeof settingsPanelContributionSchema>;
export type SettingsSection = z.output<typeof settingsSectionSchema>;
export type PlatformSettingsTabId = z.output<typeof platformSettingsTabIdSchema>;
export type RuntimeDataRequest = z.output<typeof runtimeDataRequestSchema>;
export type RuntimeActionRequest = z.output<typeof runtimeActionRequestSchema>;
export type RuntimeResultEnvelope = z.output<typeof runtimeResultEnvelopeSchema>;

/**
 * Lightweight builders compile terse UI declarations into the validated runtime schema.
 * Storage, permission enforcement and execution remain backend responsibilities.
 */
export const ui = {
  field(value: z.input<typeof fieldDefinitionSchema>): FieldDefinition {
    return fieldDefinitionSchema.parse(value);
  },
  column(value: z.input<typeof columnDefinitionSchema>): ColumnDefinition {
    return columnDefinitionSchema.parse(value);
  },
  action(value: z.input<typeof actionDefinitionSchema>): ActionDefinition {
    return actionDefinitionSchema.parse(value);
  },
  submit(commandId: string, permission?: string, title = "Save"): ActionDefinition {
    return actionDefinitionSchema.parse({
      id: commandId,
      title,
      commandId,
      intent: "submit",
      variant: "primary",
      placement: "form",
      ...(permission ? { access: "permission-gated", requiredPermission: permission } : {}),
      effects: [{ type: "toast", message: `${title} successful` }, { type: "refresh" }],
    });
  },
  rowAction(commandId: string, title: string, options: Partial<z.input<typeof actionDefinitionSchema>> = {}): ActionDefinition {
    return actionDefinitionSchema.parse({ id: commandId, commandId, title, placement: "row", ...options });
  },
  form(value: Omit<z.input<typeof settingsSectionSchema>, "kind">): SettingsSection {
    return settingsSectionSchema.parse({ ...value, kind: "form" });
  },
  table(value: Omit<z.input<typeof settingsSectionSchema>, "kind">): SettingsSection {
    return settingsSectionSchema.parse({ ...value, kind: "table" });
  },
  crud(value: Omit<z.input<typeof settingsSectionSchema>, "kind" | "crud"> & { entity: { singular: string; plural?: string; rowId?: string; titleField?: string }; operations: { create: string; update?: string; delete: string } }): SettingsSection {
    const { entity, operations, ...section } = value;
    return settingsSectionSchema.parse({
      ...section,
      kind: "crud",
      crud: {
        entityLabel: entity.singular,
        entityLabelPlural: entity.plural ?? `${entity.singular}s`,
        rowIdField: entity.rowId ?? "id",
        ...(entity.titleField ? { rowTitleField: entity.titleField } : {}),
        createActionId: operations.create,
        updateActionId: operations.update ?? operations.create,
        deleteActionId: operations.delete,
      },
    });
  },
  panel(value: {
    id: string;
    pluginId?: string;
    label: string;
    icon?: string;
    order: number;
    permission?: string;
    sections: SettingsSection[];
    category?: "platform" | "plugin";
  }): { tab: SettingsTabContribution & { ownerName: string; orderIndex: number }; panel: SettingsPanelContribution } {
    const pluginId = value.pluginId ?? "platform";
    const panelId = `${value.id}.panel`;
    const tab = settingsTabContributionSchema.parse({
      id: value.id,
      pluginId,
      label: value.label,
      ...(value.icon ? { icon: value.icon } : {}),
      displayOrder: value.order,
      category: value.category ?? "platform",
      ...(value.permission ? { requiredPermission: value.permission } : {}),
      panelContributionId: panelId,
      status: "active",
    });
    const schema = declarativePageContributionSchema.parse({
      id: panelId,
      title: value.label,
      templateId: "admin.settings",
      access: value.permission ? "permission-gated" : "private",
      slots: [{ id: `${value.id}.header`, slot: "header", blocks: [{ type: "text", text: `Manage ${value.label.toLowerCase()} for this workspace.`, tone: "muted" }] }],
      data: {},
    });
    const panel = settingsPanelContributionSchema.parse({
      id: panelId,
      pluginId,
      tabId: value.id,
      templateId: "admin.settings",
      schema,
      sections: value.sections,
      ...(value.permission ? { requiredPermission: value.permission } : {}),
    });
    return { tab: { ...tab, ownerName: pluginId === "platform" ? "Platform" : pluginId, orderIndex: value.order }, panel };
  },
};
