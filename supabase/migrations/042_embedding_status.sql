-- §3: embedding_status column — explicit per-entry embed tracking
-- Values: 'pending' (default), 'done' (embedded), 'failed' (last attempt failed)
ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'pending';

-- Backfill existing rows
UPDATE entries SET embedding_status = 'done' WHERE embedded_at IS NOT NULL;

-- Index for cron queries finding failed/pending embeds
CREATE INDEX IF NOT EXISTS entries_embedding_status_idx
  ON entries (user_id, embedding_status)
  WHERE deleted_at IS NULL;
