import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
const now = sql`CURRENT_TIMESTAMP`;
export const providerConnections = sqliteTable(
  "provider_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    providerId: text("provider_id").notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: ["configured", "unavailable", "disabled"] })
      .notNull()
      .default("unavailable"),
    secretBindingRef: text("secret_binding_ref"),
    defaultModelId: text("default_model_id"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("provider_connections_workspace_idx").on(table.workspaceId),
    uniqueIndex("provider_connections_title_idx").on(
      table.workspaceId,
      table.title,
    ),
  ],
);
export const providerModelSnapshots = sqliteTable(
  "provider_model_snapshots",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => providerConnections.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    title: text("title").notNull(),
    capabilitiesJson: text("capabilities_json").notNull().default("[]"),
    detectedAt: text("detected_at").notNull().default(now),
  },
  (table) => [
    index("provider_models_connection_idx").on(table.connectionId),
    uniqueIndex("provider_models_model_idx").on(
      table.connectionId,
      table.modelId,
    ),
  ],
);
export type ProviderConnectionRow = typeof providerConnections.$inferSelect;
