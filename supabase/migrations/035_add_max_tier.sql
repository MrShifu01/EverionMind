-- Extend tier CHECK constraint to include 'max' for future Max plan rollout.

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_tier_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_tier_check
    CHECK (tier IN ('free', 'starter', 'pro', 'max'));
