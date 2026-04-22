-- Calendar integrations: stores OAuth tokens for Google/Microsoft calendar sync
create table if not exists calendar_integrations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider        text not null check (provider in ('google', 'microsoft')),
  access_token    text,
  refresh_token   text not null,
  token_expires_at timestamptz,
  calendar_email  text,
  sync_enabled    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id, provider)
);

alter table calendar_integrations enable row level security;

create policy "users manage own calendar integrations"
  on calendar_integrations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Updated_at trigger
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger calendar_integrations_updated_at
  before update on calendar_integrations
  for each row execute function touch_updated_at();
