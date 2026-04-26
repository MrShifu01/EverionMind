-- Migration 014: Hash brain API keys
-- Stores scrypt hash instead of plaintext. Shows prefix for identification.

ALTER TABLE brain_api_keys
  ADD COLUMN IF NOT EXISTS api_key_hash TEXT,
  ADD COLUMN IF NOT EXISTS api_key_salt TEXT,
  ADD COLUMN IF NOT EXISTS api_key_prefix TEXT;

-- Populate prefix from existing plaintext keys (first 10 chars)
UPDATE brain_api_keys
SET api_key_prefix = left(api_key, 10)
WHERE api_key_prefix IS NULL AND api_key IS NOT NULL;

-- Note: existing plaintext api_key column kept for now during transition
-- Will be dropped in migration 015 after all keys are rotated
