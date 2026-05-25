PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS installed_plugins (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  package_object_key TEXT,
  package_sha256 TEXT,
  package_size_bytes INTEGER,
  package_format TEXT,
  worker_isolation TEXT NOT NULL DEFAULT 'none',
  ui_mode TEXT NOT NULL DEFAULT 'declarative',
  installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plugin_packages (
  plugin_id TEXT PRIMARY KEY NOT NULL REFERENCES installed_plugins(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  format TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS plugin_packages_object_key_idx ON plugin_packages(object_key);
CREATE INDEX IF NOT EXISTS plugin_packages_sha_idx ON plugin_packages(sha256);

CREATE TABLE IF NOT EXISTS plugin_capabilities (
  plugin_id TEXT NOT NULL REFERENCES installed_plugins(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  description TEXT,
  risk TEXT NOT NULL DEFAULT 'safe',
  PRIMARY KEY (plugin_id, capability_id)
);

CREATE TABLE IF NOT EXISTS workspace_plugins (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL REFERENCES installed_plugins(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deactivated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, plugin_id)
);

CREATE INDEX IF NOT EXISTS workspace_plugins_workspace_idx ON workspace_plugins(workspace_id, active);

CREATE TABLE IF NOT EXISTS workspace_capability_grants (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL REFERENCES installed_plugins(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, plugin_id, capability_id),
  FOREIGN KEY (plugin_id, capability_id) REFERENCES plugin_capabilities(plugin_id, capability_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_capability_grants_workspace_idx ON workspace_capability_grants(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, scope, key)
);

CREATE TABLE IF NOT EXISTS workspace_layouts (
  workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  layout_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_events_workspace_idx ON audit_events(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events(action);
