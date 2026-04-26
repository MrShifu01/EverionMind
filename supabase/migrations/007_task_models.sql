-- Migration 007: Per-task AI model selection
-- Each column is nullable; NULL means "use the global default model".
ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS model_capture   TEXT,
  ADD COLUMN IF NOT EXISTS model_questions TEXT,
  ADD COLUMN IF NOT EXISTS model_vision    TEXT,
  ADD COLUMN IF NOT EXISTS model_refine    TEXT,
  ADD COLUMN IF NOT EXISTS model_chat      TEXT;
