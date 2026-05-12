-- ============================================================
-- 089: entries.title trigram index + match RPC
-- ============================================================
--
-- Postgres english FTS stemmer doesn't link irregular verbs to their
-- base forms ("built" ↛ "build"), so queries like "who built X" miss
-- entries titled "<Name> - Builder". Trigram fuzzy matching catches
-- these via 3-character n-gram overlap — "built" and "Builder" share
-- the 3-grams __b / _bu / bui / uil, similarity ≈ 0.4, well above the
-- default % threshold of 0.3.
--
-- pg_trgm extension was enabled before this migration (verified via
-- pg_extension query 2026-05-12). Just adds the GIN index on title +
-- a brain-scoped RPC.

-- GIN index for fast trigram matching on title. Partial index for the
-- same scope retrievalCore always applies (no secrets, no soft-deletes).
CREATE INDEX IF NOT EXISTS entries_title_trgm_idx
  ON public.entries
  USING gin (title extensions.gin_trgm_ops)
  WHERE type IS DISTINCT FROM 'secret' AND deleted_at IS NULL;

-- Fuzzy title match — uses pg_trgm `word_similarity` (NOT plain
-- `similarity`) because plain similarity normalises over the whole
-- title's trigrams. A short query ("built") against a long title
-- ("JC Kraal - Builder") would score ~0.2 — below any sensible
-- threshold — even though "built" matches the word "Builder" inside
-- the title at 0.667. word_similarity finds the best continuous
-- substring match and reports its similarity, which is the right
-- behaviour here.
--
-- Default threshold 0.4 was tuned on the actual user's brain — picks
-- up genuine matches (built/Builder, founder/found, electric/electrician)
-- without flooding on weak overlaps (eat/built scores 0.2-ish, drops).
CREATE OR REPLACE FUNCTION public.match_entries_title_trgm(
  p_brain_ids uuid[],
  p_query     text,
  p_limit     integer DEFAULT 10,
  p_threshold real    DEFAULT 0.4
)
RETURNS TABLE (
  id         uuid,
  title      text,
  content    text,
  type       text,
  tags       text[],
  metadata   jsonb,
  brain_id   uuid,
  sim        real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT
    e.id,
    e.title,
    e.content,
    e.type,
    e.tags,
    e.metadata,
    e.brain_id,
    extensions.word_similarity(p_query, e.title) AS sim
  FROM public.entries e
  WHERE e.brain_id = ANY(p_brain_ids)
    AND e.deleted_at IS NULL
    AND e.type IS DISTINCT FROM 'secret'
    AND extensions.word_similarity(p_query, e.title) >= p_threshold
  ORDER BY sim DESC, e.created_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.match_entries_title_trgm(uuid[], text, integer, real) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_entries_title_trgm(uuid[], text, integer, real) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_entries_title_trgm(uuid[], text, integer, real) TO service_role;

ANALYZE public.entries;
