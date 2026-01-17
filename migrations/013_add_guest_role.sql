-- Add 'guest' role for new users
-- Guest users can only view the abacus repo, cannot add their own repos
-- Role hierarchy: admin > premium > user > guest

-- SQLite doesn't support ALTER TABLE to modify CHECK constraints
-- We need to recreate the table with the new constraint

-- Create new users table with guest role
-- NOTE: Must include email columns from migration 005!
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER UNIQUE NOT NULL,
  github_login TEXT NOT NULL,
  github_name TEXT,
  github_avatar_url TEXT,
  github_token_encrypted TEXT,
  role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('admin', 'premium', 'user', 'guest')),
  email TEXT,
  email_notifications INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- Copy existing data (existing users keep their current role)
INSERT INTO users_new (id, github_id, github_login, github_name, github_avatar_url, github_token_encrypted, role, email, email_notifications, created_at, last_login_at)
SELECT id, github_id, github_login, github_name, github_avatar_url, github_token_encrypted, role, email, email_notifications, created_at, last_login_at
FROM users;

-- Drop old table and rename new one
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Recreate indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
