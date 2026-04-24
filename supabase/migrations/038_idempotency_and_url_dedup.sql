-- P0 #8 — Idempotency keys table
-- Stores (user_id, key) → entry_id so retries return the original entry instead of creating duplicates.
-- 24h TTL enforced by the application (lazy cleanup on every check + daily cron).

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id         UUID        NOT NULL,
  idempotency_key TEXT        NOT NULL,
  entry_id        UUID        REFERENCES entries(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx
  ON idempotency_keys (created_at);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "idempotency_keys_own" ON idempotency_keys
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- P0 #9 — Unique index to prevent concurrent duplicate captures of the same URL.
-- The in-code dedup check handles the common case; this index is the safety net for the race.
-- Scoped to non-deleted entries only so soft-deleting a URL allows re-capture.

CREATE UNIQUE INDEX IF NOT EXISTS entries_user_source_url
  ON entries (user_id, (metadata->>'source_url'))
  WHERE (metadata ? 'source_url') AND deleted_at IS NULL;
