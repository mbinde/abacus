-- Migration: Add verified_at column to provisional_webhook_secrets
-- Run with: wrangler d1 execute abacus-db --file=./migrations/009_webhook_verified_at.sql

ALTER TABLE provisional_webhook_secrets ADD COLUMN verified_at TEXT DEFAULT NULL;
