-- Migration 016: Soft delete for entries
-- Adds deleted_at column so entries can be recovered within 30 days.

ALTER TABLE entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS entries_deleted_at_idx
  ON entries(deleted_at) WHERE deleted_at IS NOT NULL;

-- Update match_entries to exclude soft-deleted entries
CREATE OR REPLACE FUNCTION match_entries(
  query_embedding vector(768),
  p_brain_id      uuid,
  match_count     int DEFAULT 20
)
RETURNS TABLE (
  id               uuid,
  title            text,
  content          text,
  type             text,
  tags             text[],
  metadata         jsonb,
  brain_id         uuid,
  created_at       timestamptz,
  similarity       float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id, e.title, e.content, e.type, e.tags, e.metadata, e.brain_id, e.created_at,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM entries e
  WHERE
    e.brain_id = p_brain_id
    AND e.embedding IS NOT NULL
    AND e.deleted_at IS NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
