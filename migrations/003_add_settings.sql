-- Migration: Add settings table for app configuration
-- Run with: wrangler d1 execute abacus-db --file=./migrations/003_add_settings.sql

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Default to closed registration
INSERT INTO settings (key, value) VALUES ('registration_mode', 'closed');
