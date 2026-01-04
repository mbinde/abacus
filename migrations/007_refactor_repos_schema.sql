-- Migration: Refactor repos to global table with user_repos join
-- Run with: wrangler d1 execute abacus-db --file=./migrations/007_refactor_repos_schema.sql
-- NOTE: This drops existing repo data - users will need to re-add repos

-- Drop old repos table
DROP TABLE IF EXISTS repos;

-- Create new global repos table (one row per unique repo)
CREATE TABLE repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner, name)
);

CREATE INDEX idx_repos_owner_name ON repos(owner, name);

-- Create user_repos join table (many-to-many)
CREATE TABLE user_repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, repo_id)
);

CREATE INDEX idx_user_repos_user ON user_repos(user_id);
CREATE INDEX idx_user_repos_repo ON user_repos(repo_id);
