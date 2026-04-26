-- Remaining unindexed FK columns surfaced by advisor after 032

CREATE INDEX IF NOT EXISTS idx_links_user_id
  ON links (user_id);

CREATE INDEX IF NOT EXISTS idx_messaging_connections_user_id
  ON messaging_connections (user_id);

CREATE INDEX IF NOT EXISTS idx_messaging_pending_links_user_id
  ON messaging_pending_links (user_id);
