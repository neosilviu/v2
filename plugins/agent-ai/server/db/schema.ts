import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`CURRENT_TIMESTAMP`;

export const agentChannels = sqliteTable("agent_channels", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  providerBindingId: text("provider_binding_id"),
  systemPrompt: text("system_prompt"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [index("agent_channels_workspace_idx").on(table.workspaceId)]);

export const agentMessages = sqliteTable("agent_messages", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => agentChannels.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "tool", "system"] }).notNull(),
  content: text("content").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull().default(now),
}, (table) => [index("agent_messages_channel_idx").on(table.channelId, table.createdAt)]);

export const agentProviderBindings = sqliteTable("agent_provider_bindings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  contributionId: text("contribution_id").notNull(),
  connectionId: text("connection_id"),
  title: text("title").notNull(),
  model: text("model").notNull(),
  status: text("status", { enum: ["configured", "unavailable", "disabled"] }).notNull().default("unavailable"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [
  index("agent_provider_bindings_workspace_idx").on(table.workspaceId),
  index("agent_provider_bindings_connection_idx").on(table.connectionId),
  uniqueIndex("agent_provider_binding_name_idx").on(table.workspaceId, table.title),
]);

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => agentChannels.id, { onDelete: "cascade" }),
  providerBindingId: text("provider_binding_id").references(() => agentProviderBindings.id),
  status: text("status", { enum: ["queued", "running", "completed", "failed", "provider-required"] }).notNull(),
  inputMessageId: text("input_message_id").references(() => agentMessages.id),
  outputMessageId: text("output_message_id").references(() => agentMessages.id),
  error: text("error"),
  createdAt: text("created_at").notNull().default(now),
  completedAt: text("completed_at"),
}, (table) => [index("agent_runs_channel_idx").on(table.channelId, table.createdAt)]);

export const agentKnowledgeSources = sqliteTable("agent_knowledge_sources", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["cloudflare-ai-search", "vectorize", "page-content", "manual"] }).notNull(),
  status: text("status", { enum: ["active", "disabled", "syncing", "error"] }).notNull().default("active"),
  resourceRef: text("resource_ref"),
  sourceUrl: text("source_url"),
  configurationJson: text("configuration_json"),
  lastSyncedAt: text("last_synced_at"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
}, (table) => [index("agent_knowledge_sources_workspace_idx").on(table.workspaceId)]);

export const agentToolCalls = sqliteTable("agent_tool_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull().references(() => agentChannels.id, { onDelete: "cascade" }),
  toolId: text("tool_id").notNull(),
  inputJson: text("input_json").notNull(),
  approvalId: text("approval_id"),
  status: text("status", { enum: ["pending", "approval-required", "approved", "executing", "completed", "denied", "failed"] }).notNull().default("pending"),
  resultJson: text("result_json"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
  completedAt: text("completed_at"),
}, (table) => [
  index("agent_tool_calls_run_idx").on(table.runId),
  index("agent_tool_calls_channel_idx").on(table.channelId, table.createdAt),
  index("agent_tool_calls_approval_idx").on(table.approvalId),
]);

export const agentResourceBindings = sqliteTable("agent_resource_bindings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  resourceType: text("resource_type", { enum: ["kv", "do", "r2", "vectorize", "ai-search"] }).notNull(),
  bindingName: text("binding_name").notNull(),
  purpose: text("purpose").notNull(),
  createdAt: text("created_at").notNull().default(now),
}, (table) => [uniqueIndex("agent_resource_binding_idx").on(table.workspaceId, table.resourceType, table.bindingName)]);

export type AgentChannelRow = typeof agentChannels.$inferSelect;
export type AgentMessageRow = typeof agentMessages.$inferSelect;
export type AgentProviderBindingRow = typeof agentProviderBindings.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type AgentKnowledgeSourceRow = typeof agentKnowledgeSources.$inferSelect;
export type AgentToolCallRow = typeof agentToolCalls.$inferSelect;
