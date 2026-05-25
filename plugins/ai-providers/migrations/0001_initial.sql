CREATE TABLE IF NOT EXISTS provider_connections (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, provider_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unavailable', secret_binding_ref TEXT, default_model_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS provider_connections_workspace_idx ON provider_connections (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS provider_connections_title_idx ON provider_connections (workspace_id, title);
CREATE TABLE IF NOT EXISTS provider_model_snapshots (id TEXT PRIMARY KEY NOT NULL, connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE, model_id TEXT NOT NULL, title TEXT NOT NULL, capabilities_json TEXT NOT NULL DEFAULT '[]', detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS provider_models_connection_idx ON provider_model_snapshots (connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS provider_models_model_idx ON provider_model_snapshots (connection_id, model_id);
