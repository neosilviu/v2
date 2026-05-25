import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`CURRENT_TIMESTAMP`;
export const websitePages = sqliteTable("website_pages", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), slug: text("slug").notNull(), title: text("title").notNull(), status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"), seoTitle: text("seo_title"), seoDescription: text("seo_description"), publishedAt: text("published_at"), createdAt: text("created_at").notNull().default(now), updatedAt: text("updated_at").notNull().default(now),
}, (table) => [uniqueIndex("website_pages_workspace_slug_idx").on(table.workspaceId, table.slug), index("website_pages_workspace_status_idx").on(table.workspaceId, table.status)]);
export const websiteSections = sqliteTable("website_sections", {
  id: text("id").primaryKey(), pageId: text("page_id").notNull().references(() => websitePages.id, { onDelete: "cascade" }), kind: text("kind").notNull(), sortOrder: integer("sort_order").notNull().default(0), contentJson: text("content_json").notNull().default("{}"), aiContextEnabled: integer("ai_context_enabled", { mode: "boolean" }).notNull().default(false), createdAt: text("created_at").notNull().default(now), updatedAt: text("updated_at").notNull().default(now),
}, (table) => [index("website_sections_page_order_idx").on(table.pageId, table.sortOrder)]);
export const websiteAssets = sqliteTable("website_assets", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), objectKey: text("object_key").notNull(), mimeType: text("mime_type").notNull(), altText: text("alt_text"), createdAt: text("created_at").notNull().default(now),
}, (table) => [uniqueIndex("website_assets_object_key_idx").on(table.workspaceId, table.objectKey)]);
export const websiteContextShares = sqliteTable("website_context_shares", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), pageId: text("page_id").notNull().references(() => websitePages.id, { onDelete: "cascade" }), surfaceId: text("surface_id").notNull(), readableJson: text("readable_json").notNull().default("{}"), allowedToolsJson: text("allowed_tools_json").notNull().default("[]"), enabled: integer("enabled", { mode: "boolean" }).notNull().default(false), updatedAt: text("updated_at").notNull().default(now),
}, (table) => [uniqueIndex("website_context_surface_idx").on(table.workspaceId, table.surfaceId, table.pageId)]);
export type WebsitePageRow = typeof websitePages.$inferSelect;
export type WebsiteSectionRow = typeof websiteSections.$inferSelect;
export type WebsiteContextShareRow = typeof websiteContextShares.$inferSelect;
