PRAGMA foreign_keys=OFF;

CREATE TABLE agent_tool_calls_next (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES agent_channels(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  approval_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

INSERT INTO agent_tool_calls_next (
  id,
  run_id,
  channel_id,
  tool_id,
  input_json,
  approval_id,
  status,
  result_json,
  error,
  created_at,
  updated_at,
  completed_at
)
SELECT
  calls.id,
  calls.run_id,
  runs.channel_id,
  calls.tool_id,
  COALESCE(calls.input_json, 'null'),
  NULL,
  CASE calls.approval_status
    WHEN 'denied' THEN 'denied'
    WHEN 'approved' THEN 'approved'
    ELSE 'pending'
  END,
  calls.output_json,
  NULL,
  calls.created_at,
  calls.created_at,
  CASE
    WHEN calls.approval_status = 'denied' OR calls.output_json IS NOT NULL THEN calls.created_at
    ELSE NULL
  END
FROM agent_tool_calls calls
INNER JOIN agent_runs runs ON runs.id = calls.run_id;

DROP INDEX IF EXISTS agent_tool_calls_run_idx;
DROP TABLE agent_tool_calls;
ALTER TABLE agent_tool_calls_next RENAME TO agent_tool_calls;

CREATE INDEX agent_tool_calls_run_idx ON agent_tool_calls (run_id);
CREATE INDEX agent_tool_calls_channel_idx ON agent_tool_calls (channel_id, created_at);
CREATE INDEX agent_tool_calls_approval_idx ON agent_tool_calls (approval_id);

PRAGMA foreign_keys=ON;
