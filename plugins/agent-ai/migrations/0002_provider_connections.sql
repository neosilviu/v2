ALTER TABLE agent_provider_bindings ADD COLUMN connection_id TEXT;
CREATE INDEX IF NOT EXISTS agent_provider_bindings_connection_idx ON agent_provider_bindings (connection_id);
UPDATE agent_provider_bindings SET status = 'unavailable' WHERE status = 'missing-secret';
