-- Migration 028: BYOK provider keys, per-provider model selection, and plan tier
ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS plan              TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS anthropic_key     TEXT,
  ADD COLUMN IF NOT EXISTS openai_key        TEXT,
  ADD COLUMN IF NOT EXISTS anthropic_model   TEXT DEFAULT 'claude-sonnet-4-6',
  ADD COLUMN IF NOT EXISTS openai_model      TEXT DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS gemini_byok_model TEXT DEFAULT 'gemini-2.5-flash-lite';

-- Grandfather all existing accounts as 'pro' so nothing breaks for current users.
-- New sign-ups default to 'free' via the column DEFAULT.
UPDATE user_ai_settings SET plan = 'pro' WHERE plan = 'free';
