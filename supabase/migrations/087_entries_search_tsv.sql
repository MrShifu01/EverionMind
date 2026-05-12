-- ============================================================
-- 087: entries.search_tsv — full-text search column + GIN index
-- ============================================================
--
-- The two ILIKE-based keyword/tag-sibling expansion passes in
-- api/_lib/retrievalCore.ts (`retrieveEntries` + `retrieveEntriesForUser`)
-- can't use any index — `title.ilike.*kw*` requires a scan. At ~300
-- searchable rows per brain today that's <100ms, but it scales linearly
-- and will be the next bottleneck once we hit five-figure entry counts.
--
-- Fix: add a tsvector column + GIN partial index. PostgREST exposes this
-- via `wfts` (websearch_to_tsquery), which handles Google-style queries
-- (`"phrase"`, OR, -exclude) without crashing on user input.
--
-- ── Why trigger, not GENERATED ALWAYS AS ... STORED ────────────────────
-- `to_tsvector(regconfig, text)` is STABLE, not IMMUTABLE, so Postgres
-- refuses it inside a generated-column expression
-- (ERROR 42P17: generation expression is not immutable). Wrapping it in
-- a `CREATE FUNCTION ... IMMUTABLE` is the common "lie to the planner"
-- workaround but breaks if the text-search config ever changes. A
-- BEFORE-INSERT-OR-UPDATE trigger is the canonical pattern: no
-- immutability cheat, fires only when the source columns change.
--
-- Weights (A/B/C) feed `ts_rank_cd` if we ever want server-side ranking;
-- today we still hybrid-score client-side, so weights are forward-looking
-- but free.
--
-- Partial WHERE clause (`type <> 'secret' AND deleted_at IS NULL`)
-- matches every retrievalCore query — vault titles and tombstoned rows
-- are always filtered — so the GIN stays compact and writes against
-- those rows don't repaint the index.
--
-- At 433 rows total the backfill + index build run in <1s. If the table
-- grows past ~50k rows, switch to CONCURRENTLY in a separate manual SQL
-- apply (apply_migration wraps in a transaction; CONCURRENTLY can't run
-- inside one).
--
-- Idempotent: column add uses IF NOT EXISTS, trigger uses OR REPLACE +
-- DROP IF EXISTS, backfill UPDATE is a no-op on second run because the
-- trigger already keeps rows current.

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS search_tsv tsvector;

CREATE OR REPLACE FUNCTION public.entries_set_search_tsv()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entries_search_tsv_trigger ON public.entries;
CREATE TRIGGER entries_search_tsv_trigger
  BEFORE INSERT OR UPDATE OF title, content, tags
  ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION public.entries_set_search_tsv();

-- Backfill existing rows. NULL-check skips rows the trigger has already
-- repainted on a re-run.
UPDATE public.entries SET search_tsv =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'C')
WHERE search_tsv IS NULL;

CREATE INDEX IF NOT EXISTS entries_search_tsv_gin_idx
  ON public.entries
  USING gin (search_tsv)
  WHERE type IS DISTINCT FROM 'secret' AND deleted_at IS NULL;

ANALYZE public.entries;
