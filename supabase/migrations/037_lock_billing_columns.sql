-- Migration 037: prevent authenticated users from directly updating billing columns
--
-- The user_profiles_update RLS policy allows any authenticated user to UPDATE their
-- own row, but it has no column restriction. This BEFORE UPDATE trigger blocks changes
-- to tier, stripe_customer_id, stripe_subscription_id, and tier_expires_at when the
-- caller is not the service_role (i.e. the API). All billing mutations must go through
-- the server-side Stripe webhook or the admin API endpoint.

CREATE OR REPLACE FUNCTION _lock_billing_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  -- Service role (Vercel API handlers) may update anything.
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;

  IF (NEW.tier IS DISTINCT FROM OLD.tier)
     OR (NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id)
     OR (NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id)
     OR (NEW.tier_expires_at IS DISTINCT FROM OLD.tier_expires_at)
  THEN
    RAISE EXCEPTION 'Billing columns (tier, stripe_*) can only be updated by the system';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_billing_columns ON user_profiles;
CREATE TRIGGER lock_billing_columns
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION _lock_billing_columns();
