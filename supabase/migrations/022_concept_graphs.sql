-- Migration 022: Concept graph storage (previously localStorage-only).
-- One graph per brain, stored as JSONB with concepts + relationships.

CREATE TABLE IF NOT EXISTS concept_graphs (
  brain_id   uuid REFERENCES brains(id) ON DELETE CASCADE PRIMARY KEY,
  graph      jsonb NOT NULL DEFAULT '{"concepts":[],"relationships":[]}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE concept_graphs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Graph visible to brain members" ON concept_graphs
  FOR SELECT USING (
    brain_id IN (SELECT brain_id FROM brain_members WHERE user_id = auth.uid())
    OR brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
  );

CREATE POLICY "Graph writable by brain members" ON concept_graphs
  FOR ALL USING (
    brain_id IN (SELECT brain_id FROM brain_members WHERE user_id = auth.uid())
    OR brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
  );
