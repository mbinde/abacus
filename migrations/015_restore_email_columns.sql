-- Migration: Restore email columns that were accidentally dropped by migration 013
--
-- Migration 013 (add guest role) recreated the users table but forgot to include
-- the email and email_notifications columns from migration 005. This caused
-- the OAuth callback to crash with "table users has no column named email" (Error 1101).
--
-- Run with: wrangler d1 execute abacus-db --file=./migrations/015_restore_email_columns.sql
--
-- NOTE: If this migration fails with "duplicate column name: email", that means
-- the columns already exist (either 013 wasn't run, or they were manually restored).
-- In that case, the migration can be skipped.

-- Add back the email column (from migration 005)
ALTER TABLE users ADD COLUMN email TEXT;

-- Add back the email_notifications column (from migration 005)
ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 0;
