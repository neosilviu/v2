import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`CURRENT_TIMESTAMP`;
export const commerceProducts = sqliteTable(
  "commerce_products",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    description: text("description"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("commerce_products_workspace_slug_idx").on(
      table.workspaceId,
      table.slug,
    ),
  ],
);
export const commerceVariants = sqliteTable(
  "commerce_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull().default("RON"),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("commerce_variants_sku_idx").on(table.sku),
    index("commerce_variants_product_idx").on(table.productId),
  ],
);
export const commerceOrders = sqliteTable(
  "commerce_orders",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    customerRef: text("customer_ref"),
    status: text("status").notNull(),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull().default("RON"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("commerce_orders_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);
export type CommerceProductRow = typeof commerceProducts.$inferSelect;
export type CommerceOrderRow = typeof commerceOrders.$inferSelect;
