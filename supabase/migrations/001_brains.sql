-- ============================================================
-- Migration 001: Multi-Brain Architecture
-- Phase 2: Family Shared Brain
-- ============================================================

-- ── Brains ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brains (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  owner_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type       text NOT NULL DEFAULT 'personal' CHECK (type IN ('personal', 'shared')),
  created_at timestamptz DEFAULT now()
);

-- ── Brain Members ────────────────────────────────────────────
-- Created BEFORE brains RLS policies because those policies reference this table
CREATE TABLE IF NOT EXISTS brain_members (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id  uuid REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member', 'viewer')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(brain_id, user_id)
);

-- ── Brains RLS ───────────────────────────────────────────────
ALTER TABLE brains ENABLE ROW LEVEL SECURITY;

-- Owner sees all their brains; members see brains they belong to
CREATE POLICY "Brain visible to members" ON brains
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (SELECT brain_id FROM brain_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Brain owner can update" ON brains
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Brain owner can delete" ON brains
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "Authenticated users can create brains" ON brains
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- ── Brain Members RLS ────────────────────────────────────────
ALTER TABLE brain_members ENABLE ROW LEVEL SECURITY;

-- Members can see who else is in the same brain
CREATE POLICY "Brain members visible to members" ON brain_members
  FOR SELECT USING (
    brain_id IN (SELECT brain_id FROM brain_members WHERE user_id = auth.uid())
    OR brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
  );

CREATE POLICY "Brain owner can manage members" ON brain_members
  FOR ALL USING (
    brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
  );

-- ── Brain Invites ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_invites (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id   uuid REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  email      text NOT NULL,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'viewer')),
  token      text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES auth.users(id) NOT NULL,
  accepted   boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(brain_id, email)
);

ALTER TABLE brain_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invite visible to brain owner" ON brain_invites
  FOR SELECT USING (
    brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
  );

CREATE POLICY "Brain owner can create invites" ON brain_invites
  FOR INSERT WITH CHECK (
    brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
    AND invited_by = auth.uid()
  );

CREATE POLICY "Brain owner can delete invites" ON brain_invites
  FOR DELETE USING (
    brain_id IN (SELECT id FROM brains WHERE owner_id = auth.uid())
  );

-- ── Add brain_id to entries ──────────────────────────────────
ALTER TABLE entries ADD COLUMN IF NOT EXISTS brain_id uuid REFERENCES brains(id);

-- Index for fast brain-scoped queries
CREATE INDEX IF NOT EXISTS entries_brain_id_idx ON entries(brain_id);

-- ── Add brain_id to links ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'links') THEN
    ALTER TABLE links ADD COLUMN IF NOT EXISTS brain_id uuid REFERENCES brains(id);
    CREATE INDEX IF NOT EXISTS links_brain_id_idx ON links(brain_id);
  END IF;
END $$;

-- ── Migrate existing data ────────────────────────────────────
-- Create a personal brain for every existing user and assign their entries to it
INSERT INTO brains (name, owner_id, type)
SELECT DISTINCT 'My Brain', user_id, 'personal'
FROM entries
WHERE NOT EXISTS (
  SELECT 1 FROM brains WHERE owner_id = entries.user_id AND type = 'personal'
)
ON CONFLICT DO NOTHING;

-- Assign existing entries to their owner's personal brain
UPDATE entries
SET brain_id = (
  SELECT id FROM brains
  WHERE owner_id = entries.user_id AND type = 'personal'
  LIMIT 1
)
WHERE brain_id IS NULL;

-- Assign existing links to the owner's personal brain (via entry lookup)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'links') THEN
    UPDATE links
    SET brain_id = (
      SELECT b.id FROM brains b
      WHERE b.owner_id = links.user_id AND b.type = 'personal'
      LIMIT 1
    )
    WHERE brain_id IS NULL AND user_id IS NOT NULL;
  END IF;
END $$;

-- ── RLS update for entries ───────────────────────────────────
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can manage own entries" ON entries;
  DROP POLICY IF EXISTS "Enable all for authenticated users" ON entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Brain member entry access" ON entries
  FOR ALL USING (
    brain_id IN (
      SELECT b.id FROM brains b
      WHERE b.owner_id = auth.uid()
      UNION
      SELECT bm.brain_id FROM brain_members bm
      WHERE bm.user_id = auth.uid()
    )
  );

-- ── Auto-create personal brain on signup ────────────────────
CREATE OR REPLACE FUNCTION create_personal_brain_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.brains (name, owner_id, type)
  VALUES ('My Brain', NEW.id, 'personal');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_brain ON auth.users;
CREATE TRIGGER on_auth_user_created_brain
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE create_personal_brain_for_new_user();
