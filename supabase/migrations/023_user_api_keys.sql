-- Migration 023: User-level API keys for Claude Code / MCP access
-- Unlike brain_api_keys (per-brain), these grant access to all brains for a user.
-- Raw key is never stored — only a SHA-256 hex hash.

CREATE TABLE IF NOT EXISTS user_api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,        -- SHA-256 hex of the raw key
  key_prefix    TEXT NOT NULL,               -- first 12 chars of raw key for display
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX idx_user_api_keys_hash    ON user_api_keys (key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_api_keys_user_id ON user_api_keys (user_id);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- API routes use service role key — RLS allows service role full access
CREATE POLICY "Service role full access" ON user_api_keys
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
