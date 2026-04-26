-- Migration 015: Server-side PIN hash storage
-- Moves PIN hash from localStorage to user_ai_settings table.

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_hash_salt TEXT;
