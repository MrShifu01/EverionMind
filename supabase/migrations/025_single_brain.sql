-- Migration: collapse to one personal brain per user
-- 1. Move all entries from non-personal brains to the personal brain
-- 2. Delete non-personal brains
-- 3. Drop sharing infrastructure tables
-- 4. Enforce one brain per user

-- Step 1: Reassign entries to personal brain
UPDATE entries e
SET brain_id = personal.id
FROM (
  SELECT owner_id, id
  FROM brains
  WHERE type = 'personal'
) AS personal
WHERE e.brain_id IN (
  SELECT b.id FROM brains b
  WHERE b.owner_id = personal.owner_id
    AND b.type != 'personal'
    AND b.id != personal.id
);

-- Step 2: Delete non-personal brains
DELETE FROM brains WHERE type != 'personal';

-- Step 3: Drop sharing infrastructure
DROP TABLE IF EXISTS brain_members CASCADE;
DROP TABLE IF EXISTS brain_invites CASCADE;
DROP TABLE IF EXISTS brain_activity CASCADE;
DROP TABLE IF EXISTS brain_settings CASCADE;
DROP TABLE IF EXISTS entry_brains CASCADE;

-- Step 4: Enforce one brain per user
ALTER TABLE brains DROP CONSTRAINT IF EXISTS brains_type_check;
ALTER TABLE brains DROP COLUMN IF EXISTS type;
ALTER TABLE brains ADD CONSTRAINT brains_one_per_user UNIQUE (owner_id);

-- Step 5: Fix signup trigger — remove type column and brain_members insertion
CREATE OR REPLACE FUNCTION create_personal_brain_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO brains (name, owner_id) VALUES ('My Brain', NEW.id);
  RETURN NEW;
END;
$$;
