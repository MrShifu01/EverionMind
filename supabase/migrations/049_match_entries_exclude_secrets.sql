-- ============================================================
-- 049_match_entries_exclude_secrets.sql
-- ============================================================
--
-- Hard-exclude secret-typed entries from semantic retrieval.
--
-- Background: chat (api/llm.ts), MCP (api/mcp.ts), and search
-- (api/search.ts) all funnel through match_entries. Without the
-- type filter at the SQL layer, an entry with type='secret' that
-- happens to live in the entries table (rather than vault_entries)
-- is returned to the LLM along with everything else. Defence in
-- depth: even if a caller forgets to add &type=neq.secret to its
-- PostgREST query, the RPC will not surface secrets.
--
-- Also adds the deleted_at IS NULL guard, which the original
-- function omitted — soft-deleted entries should not match either.
-- ============================================================

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
    AND e.deleted_at IS NULL
    AND e.type IS DISTINCT FROM 'secret'
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

ALTER FUNCTION public.match_entries
  SET search_path = public, extensions, pg_temp;

-- ── build_similarity_graph: same protection ─────────────────────────────────
-- The graph view uses this function to draw connections between entries.
-- Secret-typed entries must not surface as nodes either, since the client
-- can resolve IDs to titles via the entries list.
CREATE OR REPLACE FUNCTION build_similarity_graph(
  p_brain_id   uuid,
  p_threshold  float DEFAULT 0.4
)
RETURNS TABLE (
  "from" uuid,
  "to"   uuid,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    a.id AS "from",
    b.id AS "to",
    1 - (a.embedding <=> b.embedding) AS similarity
  FROM entries a
  JOIN entries b ON a.id < b.id
    AND a.brain_id = b.brain_id
  WHERE
    a.brain_id = p_brain_id
    AND a.embedding IS NOT NULL
    AND b.embedding IS NOT NULL
    AND a.deleted_at IS NULL
    AND b.deleted_at IS NULL
    AND a.type IS DISTINCT FROM 'secret'
    AND b.type IS DISTINCT FROM 'secret'
    AND 1 - (a.embedding <=> b.embedding) >= p_threshold
  ORDER BY similarity DESC
  LIMIT 200;
$$;

ALTER FUNCTION public.build_similarity_graph
  SET search_path = public, extensions, pg_temp;
