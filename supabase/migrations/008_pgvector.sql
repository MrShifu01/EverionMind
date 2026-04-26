-- ============================================================
-- Migration 008: pgvector Embeddings
-- Adds semantic search capability to entries.
-- ============================================================

-- Enable pgvector extension (built into Supabase)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns to entries
ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedded_at timestamptz;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedding_provider text;

-- IVFFlat index for approximate nearest-neighbor cosine search.
-- lists = 100 is a safe default for up to ~10k entries.
-- Increase lists proportionally if the entry count grows beyond that.
CREATE INDEX IF NOT EXISTS entries_embedding_idx
  ON entries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index to quickly find entries that still need embedding
CREATE INDEX IF NOT EXISTS entries_embedded_at_idx ON entries(embedded_at) WHERE embedded_at IS NULL;

-- ── match_entries ─────────────────────────────────────────────
-- Brain-scoped cosine similarity search.
-- Returns entries ordered by similarity (highest first).
-- All callers (search, chat, connection finder) use this function —
-- no raw <=> operators are scattered elsewhere in the codebase.
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
    e.id,
    e.title,
    e.content,
    e.type,
    e.tags,
    e.metadata,
    e.brain_id,
    e.created_at,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM entries e
  WHERE
    e.brain_id = p_brain_id
    AND e.embedding IS NOT NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
