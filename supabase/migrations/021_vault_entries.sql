-- Migration 021: Separate vault_entries table for E2E encrypted secret storage.
-- Secrets live here — completely isolated from the public entries table.
-- The server stores only ciphertext. AES-256-GCM encryption happens in the browser.
-- Title is plaintext (display name); content and metadata are encrypted blobs.

CREATE TABLE IF NOT EXISTS vault_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,                        -- plaintext display name
  content     TEXT        NOT NULL DEFAULT '',             -- AES-256-GCM: "v1:{iv_hex}:{cipher_b64}"
  metadata    TEXT        NOT NULL DEFAULT '',             -- AES-256-GCM encrypted JSON string
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  brain_id    UUID        REFERENCES brains(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ                                  -- soft delete; NULL = active
);

ALTER TABLE vault_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own vault entries"
  ON vault_entries FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_vault_entries_user_active
  ON vault_entries (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Optional: one-time migration of existing unencrypted secrets from entries table.
-- Only uncomment after verifying you don't have encrypted secrets in entries already.
-- INSERT INTO vault_entries (id, user_id, title, content, metadata, tags, brain_id, created_at)
-- SELECT id, user_id, title,
--   COALESCE(content, ''),
--   CASE WHEN metadata IS NOT NULL THEN metadata::text ELSE '' END,
--   COALESCE(tags, '{}'), brain_id, created_at
-- FROM entries
-- WHERE type = 'secret' AND deleted_at IS NULL
-- ON CONFLICT (id) DO NOTHING;
