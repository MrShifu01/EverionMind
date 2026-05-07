-- Production OAuth token plaintext audit
-- Run in Supabase SQL editor after setting OAUTH_TOKEN_ENCRYPTION_KEY in Vercel.
-- Any row returned here needs user re-auth or a one-off migration before the
-- P0-4 manual audit item can be checked off.

select
  'gmail_integrations' as table_name,
  id,
  user_id,
  access_token is not null and access_token not like 'enc:v1:%' as plaintext_access_token,
  refresh_token is not null and refresh_token not like 'enc:v1:%' as plaintext_refresh_token,
  updated_at
from public.gmail_integrations
where
  (access_token is not null and access_token not like 'enc:v1:%')
  or (refresh_token is not null and refresh_token not like 'enc:v1:%')
order by updated_at desc;

-- Calendar tokens are stored in calendar_integrations if that table exists in
-- the current deployment. Uncomment after confirming the table name/schema.
--
-- select
--   'calendar_integrations' as table_name,
--   id,
--   user_id,
--   access_token is not null and access_token not like 'enc:v1:%' as plaintext_access_token,
--   refresh_token is not null and refresh_token not like 'enc:v1:%' as plaintext_refresh_token,
--   updated_at
-- from public.calendar_integrations
-- where
--   (access_token is not null and access_token not like 'enc:v1:%')
--   or (refresh_token is not null and refresh_token not like 'enc:v1:%')
-- order by updated_at desc;
