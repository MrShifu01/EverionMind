-- P0 #12: Enrichment job table — persistent retry queue with exponential backoff
CREATE TABLE IF NOT EXISTS entry_enrichment_jobs (
  entry_id    UUID        NOT NULL PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'retry', 'complete', 'dead_letter')),
  attempt     INT         NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entry_enrichment_jobs_drain_idx
  ON entry_enrichment_jobs (next_run_at)
  WHERE status IN ('pending', 'retry');

-- P0 #11: Track which model generated the embedding
ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedding_model TEXT;

-- Week 2: Hot-path index (entries list endpoint)
CREATE INDEX IF NOT EXISTS entries_user_created_at_idx
  ON entries (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Week 2: audit_log — referenced in code but table never created
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  action      TEXT        NOT NULL,
  resource_id UUID,
  request_id  TEXT,
  metadata    JSONB,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_user_idx     ON audit_log (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log (resource_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_own" ON audit_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());
