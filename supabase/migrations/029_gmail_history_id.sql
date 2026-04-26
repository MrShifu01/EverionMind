-- Gmail incremental sync: store the user's Gmail historyId so the next scan
-- only fetches messages added since the last successful run. Falls back to
-- time-based polling when null or the history window has expired.
alter table gmail_integrations
  add column if not exists history_id text;
