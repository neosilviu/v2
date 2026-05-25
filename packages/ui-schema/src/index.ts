import { z } from "zod";

export const templateIdSchema = z.enum([
  "admin.dashboard",
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

export const dataSourceDefinitionSchema = z.object({
  id: operationIdSchema,
  title: z.string().min(1).optional(),
  kind: z.enum(["static", "query", "resource"]).default("static"),
  resource: operationIdSchema.optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  access: accessModeSchema.default("private"),
});

export const actionDefinitionSchema = z.object({
  id: operationIdSchema,
  title: z.string().min(1),
  commandId: operationIdSchema,
  intent: z.enum(["navigate", "submit", "execute", "approve", "deny"]).default("execute"),
  variant: z.enum(["default", "primary", "danger"]).default("default"),
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

export const columnDefinitionSchema = z.object({
  id: operationIdSchema,
  label: z.string().min(1),
  field: operationIdSchema,
  type: z.enum(["text", "number", "status", "date", "badge"]).default("text"),
  sortable: z.boolean().default(false),
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
  path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/),
  pageId: operationIdSchema,
  access: accessModeSchema.default("public-candidate"),
});

export type TemplateId = z.output<typeof templateIdSchema>;
export type AccessMode = z.output<typeof accessModeSchema>;
export type DataSourceDefinition = z.output<typeof dataSourceDefinitionSchema>;
export type ActionDefinition = z.output<typeof actionDefinitionSchema>;
export type FieldDefinition = z.output<typeof fieldDefinitionSchema>;
export type ColumnDefinition = z.output<typeof columnDefinitionSchema>;
export type SlotContribution = z.output<typeof slotContributionSchema>;
export type DeclarativePageContribution = z.output<typeof declarativePageContributionSchema>;
export type PublicRouteContribution = z.output<typeof publicRouteContributionSchema>;
