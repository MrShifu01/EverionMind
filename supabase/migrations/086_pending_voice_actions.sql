-- 086_pending_voice_actions.sql
--
-- Tier-2 safety gate for voice mode. Voice never directly executes
-- destructive ops (delete_entry, update_entry, merge_entries,
-- persona.update_fact, persona.retire_fact). Instead the model calls
-- enqueue_pending_action which writes a row here, the app surfaces it
-- as a banner with Accept / Reject, and only on Accept does the server
-- execute the underlying tool via execTool.
--
-- Lifecycle:
--   pending  → user hasn't decided yet
--   accepted → committed (execTool ran, resolved_at stamped)
--   rejected → discarded (resolved_at stamped, never executes)
--   expired  → 10-min TTL elapsed (cleaned by trigger / app filter)

create table if not exists public.pending_voice_actions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  brain_id     uuid not null,
  tool_name    text not null,
  tool_args    jsonb not null default '{}'::jsonb,
  summary      text not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'rejected', 'expired')),
  result       jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '10 minutes'),
  resolved_at  timestamptz
);

-- Hot query: "give me this user's pending actions, newest first".
create index if not exists pending_voice_actions_user_pending_idx
  on public.pending_voice_actions (user_id, created_at desc)
  where status = 'pending';

-- Cleanup queries fetch expired pending rows.
create index if not exists pending_voice_actions_expires_idx
  on public.pending_voice_actions (expires_at)
  where status = 'pending';

alter table public.pending_voice_actions enable row level security;

-- Owner reads + updates only. No insert via RLS — service role inserts
-- after voice mints the action, so we don't grant insert to authenticated.
drop policy if exists pending_voice_actions_owner_select on public.pending_voice_actions;
create policy pending_voice_actions_owner_select
  on public.pending_voice_actions
  for select using (auth.uid() = user_id);

drop policy if exists pending_voice_actions_owner_update on public.pending_voice_actions;
create policy pending_voice_actions_owner_update
  on public.pending_voice_actions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
