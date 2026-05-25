CREATE TABLE IF NOT EXISTS commerce_products (
  id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', description TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_products_workspace_slug_idx ON commerce_products (workspace_id, slug);
CREATE TABLE IF NOT EXISTS commerce_variants (
  id TEXT PRIMARY KEY NOT NULL, product_id TEXT NOT NULL REFERENCES commerce_products(id) ON DELETE CASCADE, sku TEXT NOT NULL, price_minor INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'RON', stock_quantity INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_variants_sku_idx ON commerce_variants (sku);
CREATE INDEX IF NOT EXISTS commerce_variants_product_idx ON commerce_variants (product_id);
CREATE TABLE IF NOT EXISTS commerce_orders (
  id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, customer_ref TEXT, status TEXT NOT NULL, total_minor INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'RON', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS commerce_orders_workspace_status_idx ON commerce_orders (workspace_id, status);
