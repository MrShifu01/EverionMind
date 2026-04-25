-- ─────────────────────────────────────────────────────────────────────────────
-- 052_entry_type_persona.sql
--
-- Persona facts are first-class entries with type='persona'. No new table.
-- entries.type is plain text (the old enum-style CHECK was already dropped),
-- so we only need a partial index for the preamble query that runs on every
-- chat call: filter by brain_id + type='persona' + status='active'.
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_entries_persona_active
  on public.entries (brain_id, ((metadata->>'status')))
  where type = 'persona' and deleted_at is null;

-- Companion index for the manual-edit list in the About You tab — same brain
-- scope, ordered by recency. Partial so it stays cheap.
create index if not exists idx_entries_persona_recent
  on public.entries (brain_id, updated_at desc)
  where type = 'persona' and deleted_at is null;
