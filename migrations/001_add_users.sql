-- Migration: Add multi-user support
-- Run with: wrangler d1 execute abacus-db --file=./migrations/001_add_users.sql

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER NOT NULL UNIQUE,
  github_login TEXT NOT NULL,
  github_name TEXT,
  github_avatar_url TEXT,
  github_token_encrypted TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);

-- Add user_id column to repos table
-- Initially nullable to allow migration of existing repos
ALTER TABLE repos ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- After first admin signs in, run:
-- UPDATE repos SET user_id = 1 WHERE user_id IS NULL;
