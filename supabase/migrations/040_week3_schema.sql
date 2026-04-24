-- Week 3 — Hardening
-- Gmail token encryption: mark rows that have been (re-)encrypted by the app layer.
-- The app uses AES-256-GCM and stores ciphertext as `enc:v1:<base64>` in the
-- existing access_token / refresh_token columns, so no column type change is needed.
-- This column lets the app detect unencrypted legacy rows and prompt re-auth.
ALTER TABLE gmail_integrations
  ADD COLUMN IF NOT EXISTS token_encryption_version INT NOT NULL DEFAULT 0;

-- Mark all existing rows as plaintext so the next sync triggers re-auth/re-encryption
-- if GMAIL_TOKEN_ENCRYPTION_KEY is set in the environment.
-- (Safe no-op if the column already existed at version 1.)
UPDATE gmail_integrations SET token_encryption_version = 0
  WHERE token_encryption_version IS NULL OR token_encryption_version < 1;

-- Index lets the background job find unencrypted rows efficiently.
CREATE INDEX IF NOT EXISTS gmail_integrations_enc_ver_idx
  ON gmail_integrations (token_encryption_version)
  WHERE token_encryption_version < 1;

-- Entries hot-path: entries need a (brain_id, created_at) index for Realtime
-- subscription change-feed queries that filter by brain_id.
CREATE INDEX IF NOT EXISTS entries_brain_created_idx
  ON entries (brain_id, created_at DESC)
  WHERE deleted_at IS NULL;
