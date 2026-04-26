-- Migration 024: Feedback learning + knowledge shortcuts for self-improving retrieval.

-- ── query_feedback ────────────────────────────────────────────────────────────
-- Stores every rated interaction. Used to compute per-entry feedback boosts
-- and to identify frequently successful entry combinations (query patterns).
CREATE TABLE IF NOT EXISTS query_feedback (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id            uuid        NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  query               text        NOT NULL,
  answer              text        NOT NULL,
  retrieved_entry_ids uuid[]      NOT NULL DEFAULT '{}',
  top_entry_ids       uuid[]      NOT NULL DEFAULT '{}',
  feedback            smallint    NOT NULL CHECK (feedback IN (-1, 1)),
  confidence          text        NOT NULL DEFAULT 'medium',
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE query_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Feedback visible to brain members" ON query_feedback
  FOR SELECT USING (
    brain_id IN (SELECT brain_id FROM brain_members WHERE user_id = auth.uid())
    OR brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
  );

CREATE POLICY "Feedback writable by brain members" ON query_feedback
  FOR INSERT WITH CHECK (
    brain_id IN (SELECT brain_id FROM brain_members WHERE user_id = auth.uid())
    OR brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
  );

-- Index for the ILIKE + brain_id filter used by getFeedbackBoosts
CREATE INDEX IF NOT EXISTS query_feedback_brain_created
  ON query_feedback (brain_id, created_at DESC);

-- ── knowledge_shortcuts ───────────────────────────────────────────────────────
-- Precomputed knowledge paths learned from high-confidence positive feedback.
-- Deduplication enforced via unique(brain_id, entity, role, attribute).
CREATE TABLE IF NOT EXISTS knowledge_shortcuts (
  id                    uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id              uuid             NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  trigger_query_pattern text             NOT NULL,
  entity                text             NOT NULL,
  role                  text             NOT NULL,
  attribute             text             NOT NULL,
  entry_ids             uuid[]           NOT NULL DEFAULT '{}',
  confidence_score      double precision NOT NULL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
  usage_count           int              NOT NULL DEFAULT 1,
  created_at            timestamptz      NOT NULL DEFAULT now(),
  updated_at            timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (brain_id, entity, role, attribute)
);

ALTER TABLE knowledge_shortcuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shortcuts visible to brain members" ON knowledge_shortcuts
  FOR SELECT USING (
    brain_id IN (SELECT brain_id FROM brain_members WHERE user_id = auth.uid())
    OR brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
  );

-- Shortcuts are written server-side via service role only — no client INSERT policy needed.

-- Index for the ILIKE pattern match used by getKnowledgeShortcuts
CREATE INDEX IF NOT EXISTS knowledge_shortcuts_brain_id
  ON knowledge_shortcuts (brain_id);
