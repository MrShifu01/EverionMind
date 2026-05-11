-- 085_drop_gmail_tables.sql
--
-- Drop the Gmail-ingestion subsystem tables. The application code for
-- Gmail scan/decide/distill was removed (post-trim cleanup, May 2026
-- audit), and these tables are no longer read or written by anything
-- in the codebase. Keeping them around would leave orphan data with
-- live RLS policies and would mislead future auditors into thinking
-- Gmail ingestion is still wired up.
--
-- Tables dropped:
--   gmail_pattern_rules   — learned pattern store (see deleted 080)
--   gmail_decisions       — accept/reject decision log (deleted 074-era)
--   gmail_integrations    — per-user OAuth + preferences row
--   pattern_distill       — distilled accept/reject summaries (deleted 083)
--
-- CASCADE drops dependent indexes, policies, and triggers in the same
-- transaction. IF EXISTS keeps the migration idempotent for envs that
-- already ran a cleanup or were never seeded with the Gmail schema.

drop table if exists public.pattern_distill cascade;
drop table if exists public.gmail_pattern_rules cascade;
drop table if exists public.gmail_decisions cascade;
drop table if exists public.gmail_integrations cascade;
