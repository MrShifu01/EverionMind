-- Migration 011: Vault keys
-- Stores the PBKDF2 salt and a verification token for E2E encrypted vault entries.
-- The passphrase itself is NEVER stored — only the salt needed to re-derive the key.

CREATE TABLE IF NOT EXISTS vault_keys (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  salt           TEXT NOT NULL,           -- hex-encoded 16-byte PBKDF2 salt
  verify_token   TEXT NOT NULL,           -- encrypted known string to verify correct passphrase
  recovery_blob  TEXT NOT NULL,           -- vault key encrypted with recovery-key-derived AES key
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vault_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own vault key" ON vault_keys
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
