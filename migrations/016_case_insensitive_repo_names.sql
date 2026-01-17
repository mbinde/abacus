-- Migration: Make repo owner/name matching case-insensitive
-- GitHub treats repo names as case-insensitive, so should we.
-- This adds unique indexes on LOWER(columns) to prevent case-variant duplicates.
--
-- Run with: wrangler d1 execute abacus-db --file=./migrations/016_case_insensitive_repo_names.sql

-- repos table: prevent 'Foo/Bar' and 'foo/bar' from both existing
CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_owner_name_nocase
  ON repos(LOWER(owner), LOWER(name));

-- repo_views table
CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_views_nocase
  ON repo_views(LOWER(repo_owner), LOWER(repo_name));

-- webhook_state table
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_state_nocase
  ON webhook_state(LOWER(repo_owner), LOWER(repo_name));

-- stars table (includes user_id and issue_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stars_nocase
  ON stars(user_id, LOWER(repo_owner), LOWER(repo_name), issue_id);

-- pending_notifications table (includes user_id, issue_id, change_type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_notifications_nocase
  ON pending_notifications(user_id, LOWER(repo_owner), LOWER(repo_name), issue_id, change_type);
