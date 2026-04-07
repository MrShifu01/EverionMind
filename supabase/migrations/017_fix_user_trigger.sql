-- ============================================================
-- Migration 017: Fix duplicate auth trigger + add exception handling
-- ============================================================
-- Problem 1 — Duplicate triggers
--   Migration 001 created: on_auth_user_created_brain
--   Migration 003 created: on_auth_user_created
--   Both fire on AFTER INSERT ON auth.users, both call the same
--   create_personal_brain_for_new_user() function, resulting in
--   two personal brains being created per new user.
--
-- Problem 2 — No exception handling
--   Migration 009 added an INSERT into brain_members inside the
--   trigger function. If this (or the brains insert) throws for
--   any reason, Supabase Auth rolls back the whole user-creation
--   transaction and returns "Database error saving new user",
--   completely blocking signup.
--
-- Fix:
--   1. Drop the redundant on_auth_user_created trigger.
--   2. Wrap the function body in EXCEPTION WHEN OTHERS so that
--      brain-creation failures are logged but never block signup.
--      The GET /api/brains auto-create fallback will handle any
--      user whose brain was not created by the trigger.
-- ============================================================

-- 1. Remove the duplicate trigger from migration 003
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Replace the function with an exception-safe version
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
EXCEPTION WHEN OTHERS THEN
  -- Log the failure but never prevent user creation.
  -- The API's auto-create fallback (GET /api/brains) will
  -- provision the personal brain on the user's first request.
  RAISE WARNING 'create_personal_brain_for_new_user failed for user %: % (%)',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;
