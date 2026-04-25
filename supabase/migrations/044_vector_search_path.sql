-- ============================================================
-- 044_vector_search_path.sql — restore pgvector operators to similarity functions
-- ============================================================
--
-- Migration 034 moved the `vector` extension to the `extensions` schema, but
-- existing functions kept `search_path=public`. PostgreSQL operator resolution
-- only searches schemas in the function's search_path, so calls like
-- `embedding <=> query_embedding` started failing with:
--
--   ERROR: operator does not exist: extensions.vector <=> extensions.vector
--
-- Fix: extend each affected function's search_path to include `extensions` so
-- the operator class is visible. We list functions explicitly rather than
-- editing every public function — only similarity-search functions touch the
-- `<=>`, `<->`, or `<#>` operators.
-- ============================================================

ALTER FUNCTION public.match_entries
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.build_similarity_graph
  SET search_path = public, extensions, pg_temp;
