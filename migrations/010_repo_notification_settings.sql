-- Migration: Per-repo notification settings
-- Run with: wrangler d1 execute abacus-db --file=./migrations/010_repo_notification_settings.sql

-- Store per-user, per-repo notification preferences
CREATE TABLE user_repo_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,

  -- Which issues to notify about: 'none', 'favorites', 'assigned', 'all'
  notify_issues TEXT DEFAULT 'assigned',

  -- Which actions to notify about (stored as comma-separated: 'open,update,close')
  notify_actions TEXT DEFAULT 'open,update,close',

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, repo_id)
);

CREATE INDEX idx_user_repo_settings_user ON user_repo_settings(user_id);
CREATE INDEX idx_user_repo_settings_repo ON user_repo_settings(repo_id);
