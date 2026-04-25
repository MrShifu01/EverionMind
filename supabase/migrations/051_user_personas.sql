-- ─────────────────────────────────────────────────────────────────────────────
-- 051_user_personas.sql
--
-- Personal-context "persona" injected into every chat call so the assistant
-- knows who it's talking to without depending on RAG to surface the user.
-- One row per user, ~200-400 tokens of preamble in the system message.
--
-- Named user_personas (not user_profiles) because the existing
-- public.user_profiles table is a Stripe/billing tier record — different
-- concept, leave it alone.
--
-- IMPORTANT: this table is NEVER for sensitive identifiers (ID, passport,
-- driver's licence, banking, medical aid). Those go in the existing Vault,
-- which is encrypted with a passphrase-derived key the server cannot read.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_personas (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  full_name        text,
  preferred_name   text,                              -- nickname / what to call you
  pronouns         text,
  family           jsonb not null default '[]'::jsonb, -- [{relation, name, notes?}, ...]
  habits           jsonb not null default '[]'::jsonb, -- ["morning gym 6am", ...]
  context          text,                              -- free-form "About me" prose
  enabled          boolean not null default true,     -- master personalisation toggle
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.user_personas enable row level security;

drop policy if exists "user_personas_owner_rw" on public.user_personas;
create policy "user_personas_owner_rw"
  on public.user_personas
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists user_personas_updated_at_idx
  on public.user_personas (updated_at desc);

-- Keep updated_at fresh on writes.
create or replace function public.user_personas_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists user_personas_touch_updated_at on public.user_personas;
create trigger user_personas_touch_updated_at
before update on public.user_personas
for each row execute function public.user_personas_touch_updated_at();
