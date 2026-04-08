-- Migration 019: Add p_user_id param to capture() RPC
-- The API passes p_user_id explicitly (service role key = no auth.uid()).
-- Without this the RPC returns PGRST202 404.
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

GRANT EXECUTE ON FUNCTION capture(text, text, text, jsonb, text[], uuid, uuid)
  TO authenticated;
