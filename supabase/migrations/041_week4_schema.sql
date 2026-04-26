-- Week 4 — Long-tail fixes

-- §4: brain_id FK on entries — ON DELETE CASCADE (product decision: cascade)
-- Drops the implicit FK (if it exists without an ON DELETE clause) and re-adds with CASCADE
-- so that deleting a brain removes all its entries instead of leaving orphans.
ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_brain_id_fkey;

ALTER TABLE entries
  ADD CONSTRAINT entries_brain_id_fkey
    FOREIGN KEY (brain_id) REFERENCES brains(id) ON DELETE CASCADE;
