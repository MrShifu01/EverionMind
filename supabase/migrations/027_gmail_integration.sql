-- Gmail integrations: stores OAuth tokens and scan preferences for Gmail scanning
create table if not exists gmail_integrations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  access_token     text,
  refresh_token    text not null,
  token_expires_at timestamptz,
  gmail_email      text,
  scan_enabled     boolean not null default true,
  last_scanned_at  timestamptz,
  preferences      jsonb not null default '{"categories":["invoices","action-required","subscription-renewal","appointment","deadline"],"custom":""}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(user_id)
);

alter table gmail_integrations enable row level security;

create policy "users manage own gmail integrations"
  on gmail_integrations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reuse existing touch_updated_at() from migration 026
create trigger gmail_integrations_updated_at
  before update on gmail_integrations
  for each row execute function touch_updated_at();
