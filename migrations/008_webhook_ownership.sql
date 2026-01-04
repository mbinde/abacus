-- Migration: Add webhook ownership model
-- Run with: wrangler d1 execute abacus-db --file=./migrations/008_webhook_ownership.sql

-- Add webhook owner (who configured it) - nullable means unconfigured
ALTER TABLE repos ADD COLUMN webhook_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Make webhook_secret nullable (already is, but document intent: null = not configured)

-- Provisional secrets table - allows multiple users to attempt configuration simultaneously
-- Each user gets their own provisional secret while setting up
CREATE TABLE provisional_webhook_secrets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repo_id, user_id)
);

CREATE INDEX idx_provisional_secrets_repo ON provisional_webhook_secrets(repo_id);
