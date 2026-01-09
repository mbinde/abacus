-- Action log for debugging user operations
-- This captures all write operations and their outcomes for troubleshooting

CREATE TABLE IF NOT EXISTS action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Who
  user_id INTEGER,
  user_login TEXT,

  -- What
  action TEXT NOT NULL,           -- 'update_issue', 'add_comment', 'delete_issue', 'bulk_update', 'create_issue'
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  issue_id TEXT,                  -- null for create (before ID assigned)

  -- Details
  request_payload TEXT,           -- JSON of what the user tried to do

  -- Outcome
  success INTEGER NOT NULL,       -- 1 = success, 0 = failure
  error_message TEXT,             -- null on success
  retry_count INTEGER DEFAULT 0,  -- how many retries were attempted
  conflict_detected INTEGER DEFAULT 0,  -- 1 if SHA conflict occurred

  -- Timing
  created_at TEXT DEFAULT (datetime('now')),
  duration_ms INTEGER,            -- how long the operation took

  -- Correlation
  request_id TEXT                 -- optional correlation ID for tracing
);

-- Index for querying by repo (most common use case)
CREATE INDEX IF NOT EXISTS idx_action_log_repo ON action_log(repo_owner, repo_name, created_at DESC);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_action_log_user ON action_log(user_id, created_at DESC);

-- Index for failures only (debugging)
CREATE INDEX IF NOT EXISTS idx_action_log_failures ON action_log(success, created_at DESC) WHERE success = 0;

-- Cleanup: auto-delete logs older than 30 days (run via cron or manually)
-- DELETE FROM action_log WHERE created_at < datetime('now', '-30 days');
