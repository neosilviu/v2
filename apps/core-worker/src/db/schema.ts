import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const installedPlugins = sqliteTable("installed_plugins", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  manifestJson: text("manifest_json").notNull(),
  packageObjectKey: text("package_object_key"),
  packageSha256: text("package_sha256"),
  packageSizeBytes: integer("package_size_bytes"),
  packageFormat: text("package_format"),
  workerIsolation: text("worker_isolation").notNull().default("none"),
  uiMode: text("ui_mode").notNull().default("declarative"),
  installedAt: text("installed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pluginPackages = sqliteTable("plugin_packages", {
  pluginId: text("plugin_id").primaryKey().references(() => installedPlugins.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  format: text("format").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  objectKeyIdx: uniqueIndex("plugin_packages_object_key_idx").on(table.objectKey),
  shaIdx: index("plugin_packages_sha_idx").on(table.sha256),
}));

export const pluginCapabilities = sqliteTable("plugin_capabilities", {
  pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }),
  capabilityId: text("capability_id").notNull(),
  description: text("description"),
  risk: text("risk").notNull().default("safe"),
}, (table) => ({
  pk: primaryKey({ columns: [table.pluginId, table.capabilityId] }),
}));

export const workspacePlugins = sqliteTable("workspace_plugins", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  activatedAt: text("activated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deactivatedAt: text("deactivated_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  pk: primaryKey({ columns: [table.workspaceId, table.pluginId] }),
  workspaceIdx: index("workspace_plugins_workspace_idx").on(table.workspaceId, table.active),
}));

export const workspaceCapabilityGrants = sqliteTable("workspace_capability_grants", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  pluginId: text("plugin_id").notNull().references(() => installedPlugins.id, { onDelete: "cascade" }),
  capabilityId: text("capability_id").notNull(),
  grantedAt: text("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  pk: primaryKey({ columns: [table.workspaceId, table.pluginId, table.capabilityId] }),
  workspaceIdx: index("workspace_capability_grants_workspace_idx").on(table.workspaceId),
}));

export const workspaceSettings = sqliteTable("workspace_settings", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  key: text("key").notNull(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  pk: primaryKey({ columns: [table.workspaceId, table.scope, table.key] }),
}));

export const workspaceLayouts = sqliteTable("workspace_layouts", {
  workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  layoutJson: text("layout_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  payloadJson: text("payload_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  workspaceIdx: index("audit_events_workspace_idx").on(table.workspaceId, table.createdAt),
  actionIdx: index("audit_events_action_idx").on(table.action),
}));

export const workspaceRelations = relations(workspaces, ({ many, one }) => ({
  plugins: many(workspacePlugins),
  settings: many(workspaceSettings),
  layout: one(workspaceLayouts),
  auditEvents: many(auditEvents),
}));

export const installedPluginRelations = relations(installedPlugins, ({ many, one }) => ({
  package: one(pluginPackages),
  capabilities: many(pluginCapabilities),
  activations: many(workspacePlugins),
  grants: many(workspaceCapabilityGrants),
}));
