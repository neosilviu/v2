CREATE TABLE IF NOT EXISTS agent_provider_bindings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  contribution_id TEXT NOT NULL,
  title TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('configured','missing-secret','disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  provider_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','provider-required')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_provider_workspace ON agent_provider_bindings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_channel ON agent_runs(channel_id, created_at);
