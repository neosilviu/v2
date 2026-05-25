CREATE TABLE IF NOT EXISTS website_pages (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  seo_title TEXT,
  seo_description TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS website_pages_workspace_slug_idx ON website_pages (workspace_id, slug);
CREATE INDEX IF NOT EXISTS website_pages_workspace_status_idx ON website_pages (workspace_id, status);

CREATE TABLE IF NOT EXISTS website_sections (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content_json TEXT NOT NULL DEFAULT '{}',
  ai_context_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS website_sections_page_order_idx ON website_sections (page_id, sort_order);

CREATE TABLE IF NOT EXISTS website_assets (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  alt_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS website_assets_object_key_idx ON website_assets (workspace_id, object_key);

CREATE TABLE IF NOT EXISTS website_context_shares (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  page_id TEXT NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  surface_id TEXT NOT NULL,
  readable_json TEXT NOT NULL DEFAULT '{}',
  allowed_tools_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS website_context_surface_idx ON website_context_shares (workspace_id, surface_id, page_id);
