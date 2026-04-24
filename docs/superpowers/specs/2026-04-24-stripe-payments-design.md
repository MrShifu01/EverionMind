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
  → Updates user_ai_settings.plan in Supabase
  → User lands back at /settings?tab=billing&billing=success
```

### 12-Function Constraint
The Vercel Hobby plan limits projects to 12 serverless functions. This project is already at the maximum. Both Stripe handlers (`checkout` and `webhook`) are implemented as `?resource=` sub-handlers inside the existing `api/user-data.ts` — no new top-level API files are created.

A third sub-handler `?resource=stripe-portal` creates a Stripe Customer Portal session for managing subscriptions from Settings.

---

## Database

There is no `user_profiles` table — billing columns are added to the existing `user_ai_settings` table, where the `plan` column already lives.

**Migration `031_stripe_billing.sql`:**

```sql
ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS tier_expires_at TIMESTAMPTZ;
-- plan column already exists (TEXT NOT NULL DEFAULT 'free') from migration 028
-- Values expand from 'free'|'pro' to 'free'|'starter'|'pro'

CREATE TABLE IF NOT EXISTS user_usage (
  user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  period    TEXT,  -- '2026-04'
  captures  INT DEFAULT 0,
  chats     INT DEFAULT 0,
  voice     INT DEFAULT 0,
  improve   INT DEFAULT 0,
  PRIMARY KEY (user_id, period)
);
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their usage" ON user_usage
  FOR ALL USING (auth.uid() = user_id);
```

`tier_expires_at` is set to the Stripe `current_period_end` on cancellation so users retain access until the period they paid for ends (grace period).

---

## API Layer

All new handlers live inside `api/user-data.ts` as `resource=` branches.

### `POST ?resource=stripe-checkout`
- Requires auth (`withAuth`)
- Body: `{ plan: "starter" | "pro", interval: "month" | "year" }`
- Creates or retrieves Stripe Customer keyed on `stripe_customer_id` in `user_profiles`
- Creates Checkout Session (`mode: "subscription"`, `allow_promotion_codes: true`)
- `success_url`: `/settings?tab=billing&billing=success`
- `cancel_url`: `/settings?tab=billing&billing=cancel`
- Returns `{ url: string }`

### `POST ?resource=stripe-webhook`
- No auth (Stripe-signed payload)
- Verifies `stripe-signature` header using `STRIPE_WEBHOOK_SECRET`
- Handles:
  - `customer.subscription.created` → set `tier` from price metadata, clear `tier_expires_at`
  - `customer.subscription.updated` → update `tier` (handles upgrades/downgrades)
  - `customer.subscription.deleted` → set `tier = 'free'`, set `tier_expires_at = current_period_end`
- Looks up `user_id` by `stripe_customer_id` on `user_ai_settings`
- Completes all DB writes, then returns `200`

### `POST ?resource=stripe-portal`
- Requires auth
- Creates Stripe Customer Portal session for the authenticated user
- Returns `{ url: string }` — frontend redirects to it
- `return_url`: `/settings?tab=billing`

### New Environment Variables
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_STARTER_PRICE_ID
STRIPE_PRO_PRICE_ID
STRIPE_STARTER_ANNUAL_PRICE_ID   (optional at launch)
STRIPE_PRO_ANNUAL_PRICE_ID       (optional at launch)
VITE_STRIPE_PUBLISHABLE_KEY      (not currently needed with hosted Checkout)
```

---

## Usage Enforcement

**`api/_lib/usage.ts`** — new shared helper:

```ts
checkAndIncrement(userId, action, tier, hasByok)
  → { allowed: boolean, remaining: number, pct: number }
```

- If `hasByok` is true → return `{ allowed: true, remaining: Infinity, pct: 0 }` (bypass)
- If `tier === 'free'` → return `{ allowed: false, remaining: 0, pct: 100 }` (no platform AI)
- Otherwise upsert into `user_usage` for current period and check against tier limit
- Returns `429` from the calling handler when `allowed === false`

Called at the top of `api/llm.ts`, `api/capture.ts`, and `api/v1.ts` before any LLM call.

---

## Frontend

### New: `src/components/settings/BillingTab.tsx`
- Current plan badge with tier name and renewal date
- Usage meters: progress bars for captures, chats, voice, improve — current / limit
- "Upgrade to Starter" / "Upgrade to Pro" / "Manage subscription" buttons
- On `?billing=success` query param: fire a success toast, clear the param, refetch tier
- On `?billing=cancel`: no-op (user returned without paying)

### New: `src/lib/useSubscription.ts`
- Hook that reads `user_ai_settings` (plan, stripe_subscription_id) and `user_usage` for current period from Supabase
- Exposes `{ tier, usage, pct, isLoading }`
- Used by BillingTab, upgrade prompts, and any feature-gated component

### Modified: `src/components/settings/AccountTab.tsx`
- Adds a small tier badge (Free / Starter / Pro) next to the user email
- Removes the `TierPreviewToggle` debug widget from production paths

### Upgrade Prompts
- **90% banner**: amber non-blocking banner at top of the relevant view with "Upgrade" link
- **100% modal**: blocks the action, shows 3-column plan comparison table, "Upgrade" CTA
- Modal includes "Use your own API key instead" escape hatch linking to Settings > Providers
- Both read from `useSubscription()` — no extra fetches

### Plan Comparison Modal
3 columns (Free / Starter / Pro) with checkmarks and limits per feature row. Used both in the upgrade-gate modal and potentially as a standalone pricing page in future.

---

## Sequence: New User Sign-Up → Paid Upgrade

1. User signs up → `user_ai_settings.plan` defaults to `'free'`
2. User adds raw entries (always allowed)
3. User optionally adds BYOK keys → full AI on Free tier, no charge
4. User hits platform AI limit (or wants premium models) → upgrade prompt shown
5. User clicks "Upgrade to Pro" → POST `?resource=stripe-checkout&plan=pro&interval=month`
6. Redirected to Stripe Checkout → completes payment
7. Stripe fires `customer.subscription.created` → webhook sets `tier = 'pro'`
8. User lands at `/settings?tab=billing&billing=success` → success toast
9. `useSubscription()` re-fetches → UI reflects Pro tier immediately

---

## Error Handling

- Stripe API errors in checkout → return `502` with user-facing message "Payment provider unavailable"
- Webhook signature mismatch → return `400`, log to Sentry
- `checkAndIncrement` DB failure → fail open (allow the action) and log — never block a user due to our own infra failure
- Downgrade grace period: `tier_expires_at` prevents immediate access loss on cancellation
