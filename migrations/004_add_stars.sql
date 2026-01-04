-- Migration: Add stars table for per-issue starring
-- Run with: wrangler d1 execute abacus-db --file=./migrations/004_add_stars.sql

CREATE TABLE IF NOT EXISTS stars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, repo_owner, repo_name, issue_id)
);

CREATE INDEX idx_stars_user ON stars(user_id);
CREATE INDEX idx_stars_repo ON stars(repo_owner, repo_name);
