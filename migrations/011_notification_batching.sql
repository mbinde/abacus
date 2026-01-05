-- Pending notifications queue for batching
CREATE TABLE IF NOT EXISTS pending_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  issue_title TEXT NOT NULL,
  change_type TEXT NOT NULL, -- 'created', 'updated', 'closed'
  change_details TEXT, -- JSON with additional info (old/new status, etc.)
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, repo_owner, repo_name, issue_id, change_type)
);

-- Backoff state per user for notification batching
-- Tracks when to send the next batch and current backoff level
CREATE TABLE IF NOT EXISTS notification_backoff (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  next_send_at TEXT NOT NULL, -- When to send the next batch
  backoff_seconds INTEGER DEFAULT 10, -- Current backoff: 10, 20, 40, 80, 160, 300
  last_notification_at TEXT, -- When we last added a notification
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for efficient querying of pending notifications
CREATE INDEX IF NOT EXISTS idx_pending_notifications_user ON pending_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_backoff_next_send ON notification_backoff(next_send_at);
