-- ============================================================
-- 047_realtime_entries.sql — broadcast entry updates to clients
-- ============================================================
--
-- Adds the entries table to the Supabase Realtime publication so
-- the client's enrichment-orchestrator hook can react to server
-- PATCHes (metadata flags, embedding_status) live, instead of
-- waiting for a manual refresh or the 5-min catch-up timer.
--
-- Idempotent: ALTER PUBLICATION ADD TABLE errors if the table is
-- already a member, so we guard with a DO block.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entries;
  END IF;
END $$;
