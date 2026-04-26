-- Migration 020: Simple mode preference + OpenRouter embed model
ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS simple_mode    BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS embed_or_model TEXT;
