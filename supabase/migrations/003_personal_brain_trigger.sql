-- ============================================================
-- Migration 003: Auto-create personal brain on user signup
-- ============================================================

CREATE OR REPLACE FUNCTION create_personal_brain_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO brains (name, owner_id, type)
  VALUES ('My Brain', NEW.id, 'personal');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_personal_brain_for_new_user();
