-- ============================================================
-- Migration 013: Flexible entry types
-- Removes any hardcoded type constraint and replaces the
-- capture RPC so the AI can use any descriptive type label.
-- The only reserved type is "secret" (triggers E2E encryption).
-- ============================================================

-- Drop old type CHECK constraint on entries if it exists
-- (was never in migrations but may have been added manually)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entries_type_check' AND conrelid = 'entries'::regclass
  ) THEN
    ALTER TABLE entries DROP CONSTRAINT entries_type_check;
  END IF;
END $$;

-- ── Recreate capture RPC ─────────────────────────────────────
-- Accepts any type string — no whitelist validation.
-- Falls back to 'note' only when type is NULL or empty.
CREATE OR REPLACE FUNCTION capture(
  p_title      text,
  p_content    text    DEFAULT '',
  p_type       text    DEFAULT 'note',
  p_metadata   jsonb   DEFAULT '{}',
  p_tags       text[]  DEFAULT '{}',
  p_user_id    uuid    DEFAULT NULL,
  p_brain_id   uuid    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id uuid;
  v_user_id  uuid;
  v_type     text;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  -- Normalise type: use provided value or fall back to 'note'
  v_type := CASE
    WHEN p_type IS NOT NULL AND trim(p_type) <> '' THEN lower(trim(p_type))
    ELSE 'note'
  END;

  INSERT INTO entries (
    user_id, title, content, type, metadata, tags, brain_id, created_at, updated_at
  ) VALUES (
    v_user_id,
    p_title,
    p_content,
    v_type,
    COALESCE(p_metadata, '{}'),
    COALESCE(p_tags, '{}'),
    p_brain_id,
    now(),
    now()
  )
  RETURNING id INTO v_entry_id;

  RETURN json_build_object('id', v_entry_id);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION capture(text, text, text, jsonb, text[], uuid, uuid)
  TO authenticated;
