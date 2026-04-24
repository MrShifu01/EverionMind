# Stripe Payments Design — EverionMind

**Date:** 2026-04-24
**Status:** Approved
**Author:** Christian

---

## Overview

Add Stripe-backed subscription billing to EverionMind. Users sign up to one of three plans: Free, Starter, or Pro. Free users can store raw entries and bring their own API keys (BYOK) to unlock all AI features at no cost. Starter and Pro users consume platform-managed AI quota. Pro users additionally get access to premium models and all product features.

---

## Tiers

| | Free | Starter | Pro |
|---|---|---|---|
| Price | $0 | $4.99 / mo | $9.99 / mo |
| Annual | — | $49.90 / yr | $99.90 / yr |
| Raw capture & storage | ✓ unlimited | ✓ unlimited | ✓ unlimited |
| BYOK (own API keys) | ✓ full AI | ✓ full AI | ✓ full AI |
| Platform AI captures | — | 500 / mo | 2 000 / mo |
| Platform AI chats | — | 200 / mo | 1 000 / mo |
| Platform AI voice | — | 20 / mo | 100 / mo |
| Platform AI improve | — | 20 / mo | unlimited |
| AI models (platform) | — | Flash / Haiku | Sonnet / GPT-4o |
| All features unlocked | — | — | ✓ |

BYOK users on any tier bypass platform usage checks entirely — their own key is billed directly to them by the provider.

---

## Architecture

### Stripe Setup
- 3 Stripe products: `everionmind_free`, `everionmind_starter`, `everionmind_pro`
- Monthly prices: `price_starter_monthly` ($4.99), `price_pro_monthly` ($9.99)
- Annual prices: `price_starter_annual` ($49.90), `price_pro_annual` ($99.90)
- Stripe Customer Portal enabled for self-serve plan changes and cancellations

### Data Flow
```
User clicks Upgrade
  → POST /api/user-data?resource=stripe-checkout&plan=starter|pro&interval=month|year
  → Creates/retrieves Stripe Customer for user
  → Returns { url } for Stripe hosted Checkout
  → Browser redirects to Stripe
  → On payment success, Stripe calls POST /api/user-data?resource=stripe-webhook
  → Webhook verifies signature, handles subscription events
  → Updates user_profiles.tier + syncs user_ai_settings.plan
  → User lands back at /settings?tab=billing&billing=success
```

### 12-Function Constraint
The Vercel Hobby plan limits projects to 12 serverless functions. This project is already at the maximum. Both Stripe handlers (`checkout` and `webhook`) are implemented as `?resource=` sub-handlers inside the existing `api/user-data.ts` — no new top-level API files are created.

A third sub-handler `?resource=stripe-portal` creates a Stripe Customer Portal session for managing subscriptions from Settings.

---

## Database

### Design Principle

`user_profiles` is the canonical user table — a 1:1 extension of `auth.users`. All user identity, billing, and preference data lives here. `user_ai_settings` retains AI provider keys and model config only. This separation keeps both tables semantically clean and scales naturally as the product grows (streaks, referral codes, display preferences, etc. all have a natural home in `user_profiles`).

The existing `user_ai_settings.plan` column is kept temporarily synced via a DB trigger during the transition period, so no existing app code breaks. It is marked deprecated and will be removed in migration `032`.

---

### Migration `031_stripe_billing.sql`

```sql
-- ─── 1. user_profiles: canonical 1:1 user table ───────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                  TEXT NOT NULL DEFAULT 'free'
                          CHECK (tier IN ('free', 'starter', 'pro')),
  stripe_customer_id    TEXT UNIQUE,
  stripe_subscription_id TEXT,
  tier_expires_at       TIMESTAMPTZ,           -- set on cancellation for grace period
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role bypasses RLS for webhook writes
CREATE POLICY "service role full access"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 2. Auto-create profile row on new signup ─────────────────────────────

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


-- ─── 3. Backfill existing users ───────────────────────────────────────────

INSERT INTO user_profiles (id, tier)
SELECT
  u.id,
  COALESCE(s.plan, 'free') AS tier
FROM auth.users u
LEFT JOIN user_ai_settings s ON s.user_id = u.id
ON CONFLICT (id) DO NOTHING;


-- ─── 4. Keep user_ai_settings.plan in sync (deprecated — remove in 032) ──

-- Whenever user_profiles.tier changes, mirror it to user_ai_settings.plan
-- so existing app code reading user_ai_settings continues to work unchanged.
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


-- ─── 5. updated_at auto-maintenance ───────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON user_profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ─── 6. user_usage: platform AI consumption per calendar month ────────────

CREATE TABLE IF NOT EXISTS user_usage (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period    TEXT NOT NULL,   -- 'YYYY-MM', e.g. '2026-04'
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

CREATE POLICY "service role full access"
  ON user_usage FOR ALL
  USING (auth.role() = 'service_role');
```

---

### Schema Relationships

```
auth.users (Supabase managed)
  ├── user_profiles         1:1  tier, stripe billing columns     ← source of truth
  ├── user_ai_settings      1:1  API keys, model config, plan*    (* deprecated, synced by trigger)
  └── user_usage            1:N  monthly AI consumption per period
```

---

### Deprecation Plan for `user_ai_settings.plan`

Once the frontend `useSubscription()` hook is reading from `user_profiles.tier` and all server-side checks use `user_profiles`, the sync trigger and `plan` column can be dropped in migration `032`. No rush — the trigger makes it safe to run both in parallel.

---

## API Layer

All new handlers live inside `api/user-data.ts` as `resource=` branches.

### `POST ?resource=stripe-checkout`
- Requires auth (`withAuth`)
- Body: `{ plan: "starter" | "pro", interval: "month" | "year" }`
- Looks up `stripe_customer_id` from `user_profiles`; creates a Stripe Customer if absent and writes the new ID back
- Creates Checkout Session (`mode: "subscription"`, `allow_promotion_codes: true`)
- `success_url`: `/settings?tab=billing&billing=success`
- `cancel_url`: `/settings?tab=billing&billing=cancel`
- Returns `{ url: string }`

### `POST ?resource=stripe-webhook`
- No auth — Stripe-signed payload, verified via `stripe-signature` header + `STRIPE_WEBHOOK_SECRET`
- Uses service role key for all DB writes (bypasses RLS)
- Handles:
  - `customer.subscription.created` → set `tier` from price metadata, clear `tier_expires_at`
  - `customer.subscription.updated` → update `tier` (handles upgrades/downgrades/plan switches)
  - `customer.subscription.deleted` → set `tier = 'free'`, set `tier_expires_at = current_period_end` (grace period)
  - `invoice.payment_failed` → log to Sentry, optionally surface in-app banner (future)
- Looks up `user_id` via `stripe_customer_id` on `user_profiles`
- DB trigger automatically keeps `user_ai_settings.plan` in sync
- Completes all DB writes, then returns `200`
- Stripe retries on non-2xx — handler is idempotent

### `POST ?resource=stripe-portal`
- Requires auth
- Looks up `stripe_customer_id` from `user_profiles` for the authenticated user
- Creates Stripe Customer Portal session
- Returns `{ url: string }` — frontend redirects to it
- `return_url`: `/settings?tab=billing`

### New Environment Variables
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_STARTER_PRICE_ID
STRIPE_PRO_PRICE_ID
STRIPE_STARTER_ANNUAL_PRICE_ID    (optional at launch)
STRIPE_PRO_ANNUAL_PRICE_ID        (optional at launch)
VITE_STRIPE_PUBLISHABLE_KEY       (not needed with hosted Checkout, add when ready)
```

---

## Usage Enforcement

**`api/_lib/usage.ts`** — new shared helper called server-side before every platform AI call:

```ts
checkAndIncrement(userId, action, tier, hasByok)
  → { allowed: boolean, remaining: number, pct: number }
```

Logic:
1. `hasByok === true` → `{ allowed: true, remaining: Infinity, pct: 0 }` — BYOK users always pass
2. `tier === 'free'` → `{ allowed: false, remaining: 0, pct: 100 }` — no platform AI on Free
3. Otherwise: upsert into `user_usage` for `YYYY-MM` period, increment counter, check against tier limit
4. If DB write fails → **fail open** (allow the action, log to Sentry) — never block a user due to our own infra failure

Returns `429 { error: "monthly_limit_reached", tier, remaining: 0 }` from the calling handler when `allowed === false`.

Called at the top of `api/llm.ts`, `api/capture.ts`, and `api/v1.ts` before any LLM call.

**Tier limits (server-side constants in `usage.ts`):**

```ts
const LIMITS = {
  starter: { captures: 500,  chats: 200, voice: 20,  improve: 20       },
  pro:     { captures: 2000, chats: 1000, voice: 100, improve: Infinity },
} as const;
```

---

## Frontend

### New: `src/lib/useSubscription.ts`
Single source of truth for billing state on the client:
- Reads `user_profiles` (tier, stripe_subscription_id, tier_expires_at) and `user_usage` for current period from Supabase
- Exposes `{ tier, usage, limits, pct, renewalDate, isLoading }`
- Subscribes to Supabase realtime on `user_profiles` so tier badge updates immediately after webhook fires
- Used by BillingTab, upgrade prompts, and any feature-gated component — no prop drilling

### New: `src/components/settings/BillingTab.tsx`
- Current plan badge (Free / Starter / Pro) with renewal date
- Usage meters: amber/red progress bars for captures, chats, voice, improve — `used / limit`
- "Upgrade to Starter" / "Upgrade to Pro" buttons → POST checkout → redirect
- "Manage subscription" → POST portal → redirect (shown only when subscription exists)
- On `?billing=success`: fire success toast, strip query param, refetch `user_profiles`
- On `?billing=cancel`: silent no-op (user closed Stripe without paying)

### Modified: `src/components/settings/AccountTab.tsx`
- Small tier badge (Free / Starter / Pro) next to user email, reads from `useSubscription()`
- Removes `TierPreviewToggle` from production — the debug widget is no longer needed once real tiers are live

### Upgrade Prompts
- **90% banner** — amber non-blocking banner at top of the relevant view: "You've used 90% of your monthly chats. Upgrade for more." + "Upgrade" link
- **100% modal** — blocks the action, shows 3-column plan comparison, "Upgrade" CTA. Includes "Use your own API key instead" escape hatch linking to Settings > Providers
- Both components read from `useSubscription()` — zero extra fetches

### Plan Comparison Modal (3 columns)
Checkmarks and usage limits per row. Reused in upgrade-gate modal and in the Billing tab as a visual plan summary.

---

## Sequence: New User Sign-Up → Paid Upgrade

```
1. User signs up
   → auth.users INSERT fires trigger
   → user_profiles row auto-created (tier = 'free')

2. User captures raw entries (always allowed on all tiers)

3. User adds BYOK keys (optional)
   → Full AI via their own keys, no platform quota consumed

4. User triggers a platform AI action on Free tier
   → checkAndIncrement returns { allowed: false }
   → 100% modal shown with upgrade CTA

5. User clicks "Upgrade to Pro"
   → POST /api/user-data?resource=stripe-checkout&plan=pro&interval=month
   → Stripe Customer created, Checkout Session returned
   → Browser redirects to Stripe hosted Checkout

6. User completes payment on Stripe
   → Stripe fires customer.subscription.created
   → POST /api/user-data?resource=stripe-webhook
   → Webhook sets user_profiles.tier = 'pro'
   → DB trigger sets user_ai_settings.plan = 'pro'

7. User returns to /settings?tab=billing&billing=success
   → Success toast shown
   → useSubscription() re-fetches (+ realtime subscription fires)
   → UI reflects Pro tier immediately
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Stripe API down during checkout | Return `502`, show "Payment provider temporarily unavailable" |
| Webhook signature mismatch | Return `400`, log to Sentry, do nothing |
| `checkAndIncrement` DB failure | Fail open — allow the action, log to Sentry |
| Subscription cancelled mid-period | `tier_expires_at` set to period end — user keeps access until then |
| User deletes account | `ON DELETE CASCADE` on `user_profiles` and `user_usage` cleans up all rows |
| Duplicate webhook delivery | Idempotent — `UPDATE` on same state is a no-op |
