-- Add status column to entries table (missed in Gmail staging area commit 2e537b4).
-- All existing entries are active; staged is only set by gmailScan for inbox review.

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'staged'));

CREATE INDEX IF NOT EXISTS idx_entries_status_staged
  ON entries (brain_id, created_at DESC)
  WHERE status = 'staged';
