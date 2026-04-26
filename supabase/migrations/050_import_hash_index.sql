-- ============================================================
-- 050_import_hash_index.sql — speed up bulk-import deduplication
-- ============================================================
--
-- Bulk imports (Google Keep / Takeout, future Notion / Bear / etc.) attach
-- a stable hash to each row's metadata so re-running the same export is a
-- no-op. The dedup query is:
--
--   SELECT metadata->>'import_hash'
--   FROM entries
--   WHERE brain_id = $1
--     AND metadata->>'import_hash' IN ($2, $3, …)
--
-- Without an expression index Postgres has to scan every row in the brain
-- and parse the JSONB on each one — fine for 100 rows, painful at 10K+.
-- A partial expression index keyed on (brain_id, import_hash) lets the
-- planner skip the scan entirely.
--
-- WHERE clause restricts the index to rows that actually carry an
-- import_hash, so manually-created entries don't bloat the index.
-- ============================================================

CREATE INDEX IF NOT EXISTS entries_import_hash_idx
  ON entries (brain_id, ((metadata->>'import_hash')))
  WHERE metadata ? 'import_hash';
