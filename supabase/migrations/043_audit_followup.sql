-- ============================================================
-- 043_audit_followup.sql — fixes from the post-sprint audit pass
-- ============================================================
--
-- Closes:
--   • Audit #16 — DB-level enforcement that entries.user_id == brains.owner_id
--                 (defence-in-depth for the service-role-bypass class)
--   • Audit #11 — TOCTOU duplicate contacts in gmail scan
--                 (partial unique index on (user_id, contact_email) WHERE type='contact')
--   • Audit small — orphan idempotency keys after entries hard-delete
--                   (ON DELETE SET NULL → CASCADE)
-- ============================================================


-- ── Brain owner / user_id consistency ───────────────────────────────────────
--
-- Rejects any entries row where brain_id is set but does not point to a brain
-- owned by the same user. Closes the entire IDOR class for the service-role
-- bypass — a missed `requireBrainAccess` callsite cannot create a cross-tenant
-- row anymore: the trigger fails the INSERT/UPDATE.

CREATE OR REPLACE FUNCTION enforce_entries_brain_owner_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner UUID;
BEGIN
  IF NEW.brain_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT owner_id INTO owner FROM brains WHERE id = NEW.brain_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'entries.brain_id % does not exist', NEW.brain_id;
  END IF;
  IF owner <> NEW.user_id THEN
    RAISE EXCEPTION 'entries.user_id (%) must match brains.owner_id (%) for brain %',
      NEW.user_id, owner, NEW.brain_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entries_brain_owner_match ON entries;
CREATE TRIGGER entries_brain_owner_match
  BEFORE INSERT OR UPDATE OF brain_id, user_id ON entries
  FOR EACH ROW
  EXECUTE FUNCTION enforce_entries_brain_owner_match();


-- ── Gmail contact dedup ─────────────────────────────────────────────────────
--
-- Backstops the SELECT-then-INSERT race in upsertGmailContact. Two concurrent
-- emails from the same sender can no longer create two contact rows.

CREATE UNIQUE INDEX IF NOT EXISTS entries_contact_email_uniq
  ON entries (user_id, (metadata->>'contact_email'))
  WHERE type = 'contact'
    AND metadata ? 'contact_email'
    AND deleted_at IS NULL;


-- ── Idempotency cascade ─────────────────────────────────────────────────────
--
-- An idempotency_keys row whose entry_id was hard-deleted used to remain with
-- entry_id=NULL and replay as `{ id: null, idempotent_replay: true }`. Cascade
-- the delete so the key disappears with the entry.

ALTER TABLE idempotency_keys
  DROP CONSTRAINT IF EXISTS idempotency_keys_entry_id_fkey;

ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_keys_entry_id_fkey
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE;
