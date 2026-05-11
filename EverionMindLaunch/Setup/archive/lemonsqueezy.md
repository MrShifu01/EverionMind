# LemonSqueezy setup runbook — ARCHIVED 2026-05-11

> **STATUS: ARCHIVED.** Integration shipped 2026-04-30 (commit `c484030`); test-mode round-trip completed. 44 of 49 steps in this file were already done by the time the dashboard parsed it — the file was inflating the active task count without serving as a runbook.
>
> The live-mode cutover (originally § 8 of this doc) was lifted into `LAUNCH_CHECKLIST.md` § P0 / Billing as a 5-step launch-day block. **Go there for the remaining work.**
>
> Kept for historical reference in case a future operator needs to re-bootstrap the LS dashboard from scratch.

---

# LemonSqueezy setup runbook

Web subscription provider. Merchant of record — handles VAT, sales tax, chargebacks. Code is shipped (`api/_lib/lemonsqueezy.ts`, `api/user-data.ts:handleLemonCheckout` / `handleLemonWebhook` / `handleLemonPortal`). This runbook is the operator-side dashboard work.

> **Why split web (LS) and mobile (RC)?** See `Legal/pricing-billing.md` § Billing providers — `Decided 2026-05-06` block.

## Prerequisites

- LemonSqueezy account created.
- Production domain set up — `everion.smashburgerbar.co.za` (the webhook lives here).
- Vercel project access to set env vars.

## 1. Set up the store

LemonSqueezy → **Store** in the left sidebar.

- [ ] **Store name**: `Everion Mind`
- [ ] **Default currency**: USD recommended (parity with Apple/Google pricing tiers; LS auto-converts at checkout for international cards). ZAR is also fine if you want SA cards billed in rand.
- [ ] **Region**: your country of business
- [ ] **Subdomain**: `everionmind.lemonsqueezy.com` (used for hosted checkout pages)

## 2. Create the products

You need **2 products** (Pro and Max — see `Legal/pricing-billing.md` for the audited tier table).

LemonSqueezy → **Products** → **New product**.

### Pro
- [ ] **Name**: `Everion Mind Pro`
- [ ] **Description**: short marketing copy from `Brand/voice-tone.md`
- [ ] **Type**: Subscription
- [ ] **Pricing model**: Standard pricing
- [ ] Add **monthly variant** at **$3.99 USD**
- [ ] (Optional) Add **yearly variant** at $39.99/year (~16% saving over monthly)
- [ ] **Has free trial**: 14 days, **no card required** (matches trial policy)
- [ ] Save

### Max
- [ ] **Name**: `Everion Mind Max`
- [ ] **Type**: Subscription, Standard pricing
- [ ] Add **monthly variant** at **$14.99 USD**
- [ ] (Optional) Add **yearly variant** at $149.99/year
- [ ] **No trial** (Max users come from Pro per the trial policy)
- [ ] Save

## 3. Grab the IDs you'll need

For each variant, click into it. The URL is `app.lemonsqueezy.com/products/<product>/variants/<id>`. Copy that ID.

| Env var | Where to get it |
|---|---|
| `LEMONSQUEEZY_STORE_ID` | Store → Settings → Store ID (number at the top) |
| `LEMONSQUEEZY_PRO_VARIANT_ID` | Pro product → monthly variant URL |
| `LEMONSQUEEZY_MAX_VARIANT_ID` | Max product → monthly variant URL |
| `LEMONSQUEEZY_STARTER_VARIANT_ID` | Code references this — set to empty string `""` for now (pricing table has no Starter tier; code skips when empty) |

## 4. Generate an API key

- [ ] Settings → **API** → **Create API Key**
- [ ] **Name**: `Everion Mind production`
- [ ] **Scope**: full access (or scoped: read products + manage subscriptions + webhooks)
- [ ] **Copy the key immediately** — LS only shows it once. This is `LEMONSQUEEZY_API_KEY`.

## 5. Configure the webhook

- [ ] Settings → **Webhooks** → **Create webhook**
- [ ] **URL**: `https://everion.smashburgerbar.co.za/api/lemon-webhook`
- [ ] **Signing secret**: generate a strong random string (`openssl rand -hex 32`). Save — this is `LEMONSQUEEZY_WEBHOOK_SECRET`.
- [ ] **Events to subscribe** (minimum):
  - [ ] `subscription_created`
  - [ ] `subscription_updated`
  - [ ] `subscription_cancelled`
  - [ ] `subscription_expired`
  - [ ] `subscription_payment_success`
  - [ ] `subscription_payment_failed`
  - [ ] `order_created`

## 6. Set Vercel env vars

Vercel → Project → Settings → Environment Variables. Set in **Production AND Preview** environments.

```
LEMONSQUEEZY_API_KEY=<from step 4>
LEMONSQUEEZY_STORE_ID=<from step 3>
LEMONSQUEEZY_WEBHOOK_SECRET=<from step 5>
LEMONSQUEEZY_PRO_VARIANT_ID=<from step 3>
LEMONSQUEEZY_MAX_VARIANT_ID=<from step 3>
LEMONSQUEEZY_STARTER_VARIANT_ID=
```

- [ ] Redeploy after setting (Vercel doesn't pick up new vars on existing deployments).

## 7. Test mode round-trip

LS has a **test mode** toggle at the top of the dashboard. Flip it on. Test products use Stripe's test card `4242 4242 4242 4242` (any future expiry, any CVC).

- [ ] Open Settings → Billing in the live app (Vercel preview against test-mode env vars works).
- [ ] Click Upgrade → Pro → checkout opens.
- [ ] Pay with test card.
- [ ] Confirm in LS dashboard: order shows up.
- [ ] Confirm webhook delivery: Settings → Webhooks → click webhook → Recent deliveries → 200 status.
- [ ] Confirm in Supabase: `audit_log` table has a `tier_change` row.
- [ ] Confirm in Supabase: `user_profiles.tier` flipped to `pro` for the test user.
- [ ] Confirm in app: refresh Settings → Billing — shows Pro.
- [ ] Cancel via Settings → Billing → Manage Subscription → confirm webhook fires `subscription_cancelled` and tier eventually drops to free (LS test mode accelerates this — minutes, not months).

## 8. Go live

- [ ] In LS dashboard, flip test mode → live mode.
- [ ] Regenerate **API key** in live mode (test keys don't work in live).
- [ ] Regenerate **webhook secret** in live mode.
- [ ] Update Vercel env vars to the live values.
- [ ] Redeploy.
- [ ] Smoke test with a real card on a small purchase, then refund yourself in the LS dashboard.

## Troubleshooting

- **Webhook signature failures** → mismatch between dashboard signing secret and `LEMONSQUEEZY_WEBHOOK_SECRET`. Compare both, no trailing whitespace.
- **Variant not found errors** → variant ID in env doesn't match LS dashboard. Check the URL of the variant page.
- **Tier doesn't update after purchase** → check Vercel function logs for `[lemon-webhook]`. Likely Upstash isn't configured (idempotency fail-open) or the variant ID isn't matched to a tier in `api/_lib/billing.ts`.
- **Webhook delivers but tier stays free** → idempotency dedup hit. Replay in the LS dashboard would no-op. Clear the Upstash key `webhook:lemon:event:<id>` if you need to force a re-process.
- **Trial doesn't work** → confirm "Has free trial: 14 days, no card required" is set on the variant, not the product. LS distinguishes.

## What this replaces

Stripe was retired 2026-04-30 (commit `c484030`). Migration `065` relocated billing columns to `user_profiles` + a lock-billing trigger. The webhook handler also fires the LS↔RC bridge so a web-paying user is recognised as paid on mobile (RC promotional entitlement grant). See `Specs/billing-revenuecat.md` for the bridge details.

## Related

- `Specs/billing-revenuecat.md` — mobile side
- `Setup/revenuecat.md` — RC operator setup
- `Legal/pricing-billing.md` — pricing table + provider decision
- `Ops/env-vars.md` — full env var reference
- LemonSqueezy docs: https://docs.lemonsqueezy.com
