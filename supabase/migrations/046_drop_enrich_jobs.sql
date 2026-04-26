-- ============================================================
-- 046_drop_enrich_jobs.sql — drop the legacy enrichment queue
-- ============================================================
--
-- Phase 6 of the enrichment rewrite (see phases.md). The new pipeline
-- (api/_lib/enrich.ts) runs every step inline against the entry, awaited
-- end-to-end. The persistent retry queue introduced in migration 039 is no
-- longer read or written by anything in api/.
--
-- Drops:
--   entry_enrichment_jobs            — the queue table
--   entry_enrichment_jobs_drain_idx  — its only non-PK index (cascades with
--                                      the table, but listed for clarity)
--
-- Idempotent — IF EXISTS guards make re-running the migration a no-op.
-- ============================================================

DROP TABLE IF EXISTS entry_enrichment_jobs;
