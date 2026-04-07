-- Migration 012: Brain API keys
-- Per-brain API keys for external app access (calendar, todo, dashboards).
-- Keys are generated client-side, stored hashed-like (plain for now, ob_ prefix).
-- The API validates keys and returns brain data via /api/external.

CREATE TABLE IF NOT EXISTS brain_api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id      UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key       TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL DEFAULT 'Default',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brain_api_keys_key ON brain_api_keys (api_key) WHERE is_active = TRUE;
CREATE INDEX idx_brain_api_keys_brain ON brain_api_keys (brain_id) WHERE is_active = TRUE;

ALTER TABLE brain_api_keys ENABLE ROW LEVEL SECURITY;

-- Only brain owners can see/manage their own keys (via service role in API)
CREATE POLICY "Service role full access" ON brain_api_keys
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
