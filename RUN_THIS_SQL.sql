-- Run this in Supabase SQL Editor
-- Step 1: pgvector setup
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedded_at timestamptz;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedding_provider text;
CREATE INDEX IF NOT EXISTS entries_embedding_idx ON entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS entries_embedded_at_idx ON entries(embedded_at) WHERE embedded_at IS NULL;

-- Step 2: match_entries function
CREATE OR REPLACE FUNCTION match_entries(query_embedding vector(768), p_brain_id uuid, match_count int DEFAULT 20) RETURNS TABLE (id uuid, title text, content text, type text, tags text[], metadata jsonb, brain_id uuid, created_at timestamptz, similarity float) LANGUAGE sql STABLE AS $$
  SELECT e.id, e.title, e.content, e.type, e.tags, e.metadata, e.brain_id, e.created_at, 1 - (e.embedding <=> query_embedding) AS similarity FROM entries e WHERE e.brain_id = p_brain_id AND e.embedding IS NOT NULL ORDER BY e.embedding <=> query_embedding LIMIT match_count;
$$;

-- Step 3: backfill brain_members for owners
INSERT INTO brain_members (brain_id, user_id, role) SELECT b.id, b.owner_id, 'owner' FROM brains b WHERE NOT EXISTS (SELECT 1 FROM brain_members bm WHERE bm.brain_id = b.id AND bm.user_id = b.owner_id);
