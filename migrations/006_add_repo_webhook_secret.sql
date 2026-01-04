-- Migration: Add per-repo webhook secrets
-- Run with: wrangler d1 execute abacus-db --file=./migrations/006_add_repo_webhook_secret.sql

ALTER TABLE repos ADD COLUMN webhook_secret TEXT;
