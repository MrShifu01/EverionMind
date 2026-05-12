-- ============================================================
-- 088: search_entries_fts — ts_rank-ordered FTS retrieval RPC
-- ============================================================
--
-- PostgREST's `wfts` operator filters but doesn't rank. On broad
-- queries the OR-of-tokens match (any single token = inclusion) returns
-- more entries than the LIMIT, and the unordered cut drops title-match
-- entries that should have won.
--
-- Concrete failure (eval 2026-05-12): "who built Smash Burger Bar" →
-- the wfts pass matches every SBB entry (content has "Smash Burger Bar")
-- AND "JC Kraal - Builder" (title has stem "build" matching query stem
-- "built"). PostgREST returns them in arbitrary order, JC Kraal falls
-- outside top-20, eval fails.
--
-- This RPC uses ts_rank_cd which honours the A/B/C weights baked into
-- search_tsv (title=A, content=B, tags=C — see migration 087). Title
-- matches outrank content-only matches by ~5× via the weight, so JC
-- Kraal lands top and survives the LIMIT.
--
-- The brain scope is parameterised as uuid[] so the same RPC serves
-- both retrieveEntries (single brain) and retrieveEntriesForUser
-- (every brain the user can read).

CREATE OR REPLACE FUNCTION public.search_entries_fts(
  p_brain_ids uuid[],
  p_query     text,
  p_limit     integer DEFAULT 20
)
RETURNS TABLE (
  id         uuid,
  title      text,
  content    text,
  type       text,
  tags       text[],
  metadata   jsonb,
  brain_id   uuid,
  rank       real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', p_query) AS tsq
  )
  SELECT
    e.id,
    e.title,
    e.content,
    e.type,
    e.tags,
    e.metadata,
    e.brain_id,
    ts_rank_cd(e.search_tsv, q.tsq) AS rank
  FROM public.entries e, q
  WHERE e.brain_id = ANY(p_brain_ids)
    AND e.deleted_at IS NULL
    AND e.type IS DISTINCT FROM 'secret'
    AND e.search_tsv @@ q.tsq
  ORDER BY rank DESC, e.created_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.search_entries_fts(uuid[], text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_entries_fts(uuid[], text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_entries_fts(uuid[], text, integer) TO service_role;
