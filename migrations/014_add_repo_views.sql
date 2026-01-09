-- Track repo view counts
CREATE TABLE IF NOT EXISTS repo_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repo_owner, repo_name)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_repo_views_repo ON repo_views(repo_owner, repo_name);
