-- ─── 1. user_profiles: canonical 1:1 user table ─────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                   TEXT NOT NULL DEFAULT 'free'
                           CHECK (tier IN ('free', 'starter', 'pro')),
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT,
  tier_expires_at        TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "service role full access"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 2. Auto-create profile row on new signup ────────────────────────────

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();


-- ─── 3. Backfill existing users ──────────────────────────────────────────

INSERT INTO user_profiles (id, tier)
SELECT
  u.id,
  CASE
    WHEN s.plan IN ('starter', 'pro') THEN s.plan
    ELSE 'free'
  END
FROM auth.users u
LEFT JOIN user_ai_settings s ON s.user_id = u.id
ON CONFLICT (id) DO NOTHING;


-- ─── 4. Keep user_ai_settings.plan in sync (deprecated — remove in 032) ─

CREATE OR REPLACE FUNCTION sync_plan_to_ai_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE user_ai_settings
  SET plan = NEW.tier
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_tier_changed ON user_profiles;
CREATE TRIGGER on_profile_tier_changed
  AFTER UPDATE OF tier ON user_profiles
  FOR EACH ROW
  WHEN (OLD.tier IS DISTINCT FROM NEW.tier)
  EXECUTE FUNCTION sync_plan_to_ai_settings();


-- ─── 5. updated_at auto-maintenance ──────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_updated_at ON user_profiles;
CREATE TRIGGER set_profile_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ─── 6. user_usage: platform AI consumption per calendar month ───────────

CREATE TABLE IF NOT EXISTS user_usage (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period    TEXT NOT NULL,
  captures  INT NOT NULL DEFAULT 0,
  chats     INT NOT NULL DEFAULT 0,
  voice     INT NOT NULL DEFAULT 0,
  improve   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);

ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own usage"
  ON user_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "service role full access on usage"
  ON user_usage FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 7. increment_usage: atomic increment RPC ────────────────────────────

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_period  TEXT,
  p_action  TEXT
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO user_usage (user_id, period)
  VALUES (p_user_id, p_period)
  ON CONFLICT (user_id, period) DO NOTHING;

  IF p_action = 'captures' THEN
    UPDATE user_usage SET captures = captures + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING captures INTO v_count;
  ELSIF p_action = 'chats' THEN
    UPDATE user_usage SET chats = chats + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING chats INTO v_count;
  ELSIF p_action = 'voice' THEN
    UPDATE user_usage SET voice = voice + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING voice INTO v_count;
  ELSIF p_action = 'improve' THEN
    UPDATE user_usage SET improve = improve + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING improve INTO v_count;
  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;

  RETURN v_count;
END;
$$;
