-- Migration 018: Add all provider API key columns to user_ai_settings
-- Moves key storage from localStorage (device-only) to Supabase (cross-device).
-- localStorage remains a write-through cache for synchronous reads.
ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS api_key          TEXT,
  ADD COLUMN IF NOT EXISTS ai_model         TEXT,
  ADD COLUMN IF NOT EXISTS ai_provider      TEXT,
  ADD COLUMN IF NOT EXISTS groq_key         TEXT,
  ADD COLUMN IF NOT EXISTS embed_provider   TEXT,
  ADD COLUMN IF NOT EXISTS embed_openai_key TEXT,
  ADD COLUMN IF NOT EXISTS gemini_key       TEXT;
