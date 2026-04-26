-- Migration 006: Per-user AI settings (for edge function access)
-- Stores OpenRouter key/model so the Telegram bot can use each user's own credentials.

CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  openrouter_key  TEXT,
  openrouter_model TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai settings" ON user_ai_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
