-- ============================================================
-- Migration 009: Ensure brain owners have a brain_members row
-- ============================================================
-- The original trigger only created a brains row but not a brain_members
-- row for the owner. This caused API endpoints that check brain_members
-- to reject the owner's requests.

-- 1. Backfill: Add brain_members rows for all existing brain owners
INSERT INTO brain_members (brain_id, user_id, role)
SELECT b.id, b.owner_id, 'owner'
FROM brains b
WHERE NOT EXISTS (
  SELECT 1 FROM brain_members bm
  WHERE bm.brain_id = b.id AND bm.user_id = b.owner_id
)
ON CONFLICT (brain_id, user_id) DO NOTHING;

-- 2. Update the trigger to also create a brain_members row
CREATE OR REPLACE FUNCTION create_personal_brain_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_brain_id uuid;
BEGIN
  INSERT INTO brains (name, owner_id, type)
  VALUES ('My Brain', NEW.id, 'personal')
  RETURNING id INTO new_brain_id;

  INSERT INTO brain_members (brain_id, user_id, role)
  VALUES (new_brain_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;
