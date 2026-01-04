-- Migration: Add premium role
-- Run with: wrangler d1 execute abacus-db --file=./migrations/002_add_premium_role.sql

-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table
-- This migration adds 'premium' to the allowed roles: admin > premium > user

-- Create new table with updated constraint
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER NOT NULL UNIQUE,
  github_login TEXT NOT NULL,
  github_name TEXT,
  github_avatar_url TEXT,
  github_token_encrypted TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'premium', 'user')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

-- Copy data from old table
INSERT INTO users_new SELECT * FROM users;

-- Drop old table
DROP TABLE users;

-- Rename new table
ALTER TABLE users_new RENAME TO users;

-- Recreate index
CREATE INDEX idx_users_github_id ON users(github_id);
