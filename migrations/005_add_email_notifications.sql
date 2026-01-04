-- Migration: Add email notifications support
-- Run with: wrangler d1 execute abacus-db --file=./migrations/005_add_email_notifications.sql

-- Add email and notification preferences to users table
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 0;

-- Create webhook_state table to track last known state of issues per repo
-- Used to detect what changed between webhook events
CREATE TABLE IF NOT EXISTS webhook_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  issues_hash TEXT NOT NULL,
  issues_snapshot TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repo_owner, repo_name)
);

CREATE INDEX IF NOT EXISTS idx_webhook_state_repo ON webhook_state(repo_owner, repo_name);
