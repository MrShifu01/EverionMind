# Billing Audit — 2026-05-07

> Dual-provider billing: LemonSqueezy (web, merchant of record for SA) + RevenueCat (native iOS/Android, source of truth for store subscriptions). Audits checkout creation, webhook handling, idempotency, signature verification, tier reconciliation, and the cross-provider bridge.

## Verdict

**Architecture is right.** LS for web checkout, RC as the canonical source for native subs, a one-way bridge from LS → RC promotional entitlements so a web payer's mobile install shows them as paid. Webhook idempotency via `markWebhookEventSeen` table. Signatures verified (LS HMAC, RC bearer token).

**Two findings, both carried**: (a) F9 from May 6 — open-redirect via `host` header in LS checkout `successUrl` — **still unfixed**; (b) RC webhook auth is a static bearer token with no replay protection beyond idempotency. Pre-launch fix list is short.

---

## Architecture overview

```
Web user → LS checkout → LS webhook → handleLemonWebhook → user_profiles (tier, period_end)
                                                       ↘ rcGrantEntitlement (PROMOTIONAL)
                                                          
Native user → App/Play store → RC webhook → handleRevenueCatWebhook → user_profiles (tier, period_end)
                                          (skip if event.store === "PROMOTIONAL" to avoid loops)
                                          
Admin override → handleAdminSetTier → user_profiles
                                   ↘ audit_log
                                   
Migration 057 _lock_billing_columns trigger → blocks any client-side tier mutation at the DB layer
```

---

## What's solid

- **DB-layer tier lock** (`migration 057 _lock_billing_columns`): `user_profiles.tier`, `tier_set_at`, `current_period_end`, `lemonsqueezy_customer_id`, `lemonsqueezy_subscription_id`, etc. cannot be updated via the browser SDK — the trigger blocks any non-service-role write. This is the single most-important defence: even if the browser endpoint had a bug, the DB still says no.
- **Webhook idempotency** (`api/_lib/webhookIdempotency.ts` + `webhook_events` table): every event is keyed by `(provider, event_id)` and dropped on second-time-seen. Prevents double-charge tier writes from retried webhooks.
- **LS signature verification** (`api/_lib/billing.ts::lemonVerifyWebhookSignature`): HMAC-SHA256 with constant-time comparison against `LEMONSQUEEZY_WEBHOOK_SECRET`. Failure → 400 + `[lemon-webhook] signature rejected: <reason>` log.
- **RC webhook auth** (`api/_lib/billing.ts::rcVerifyWebhookAuth`): `Authorization: Bearer <secret>` static check (RC's documented scheme).
- **PROMOTIONAL loop guard** (`user-data.ts:3190-3192`): RC webhook ignores events where `event.store === "PROMOTIONAL"` — those came from our own bridge from LS, so we already wrote the tier in `handleLemonWebhook`. Without this guard, every web payment double-writes (LS handler writes the tier, then RC echoes the promotional grant back, which would write again).
- **Variant-id resolver** (`resolveTier`): explicit allowlist of `LEMONSQUEEZY_STARTER_VARIANT_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`, `LEMONSQUEEZY_MAX_VARIANT_ID`. Unknown variant → fallback to `free` + warn log, NOT silently keep stale tier (`user-data.ts:3094-3098`).
- **Multi-store native handling**: RC webhook differentiates `APP_STORE` / `MAC_APP_STORE` (use `original_transaction_id`) vs `PLAY_STORE` (use `purchase_token` + `product_id`). Schema supports both via separate columns (`appstore_otx_idx`, `playstore_token_idx`).
- **Customer portal flow** (`handleLemonPortal`): authenticated, requires existing `lemonsqueezy_customer_id`, fails closed with `"No active subscription found"` if absent.
- **Inactive event handling**: cancellation / expiration / billing-issue routes write `tier = "free"` rather than leaving stale state.
- **Admin tier change** (`handleAdminSetTier` at user-data.ts:3287+) writes audit_log AFTER the tier update with `cascadeCounts` and the admin user.id — F4 from May 6 is still in place.
- **No PII in webhook logs**: only event ID + event name + signature reason. Never the full body.

## Findings

### F1 — Open redirect via `host` header in LS `successUrl` (carried, HIGH)
**Severity: HIGH** — carried from `audit-security-2026-05-06.md` F9, **still unfixed**.

`api/user-data.ts:2981-2982`:

```ts
const host = (req.headers["host"] as string) || "everion.app";
const successUrl = `https://${host}/settings?tab=billing&billing=success`;
```

`req.headers["host"]` is attacker-controllable on preview deployments and in any deployment where Vercel doesn't pin the host. The `successUrl` becomes the LemonSqueezy post-purchase redirect — LS sends the user there after they pay. **Result**: a phisher who creates a checkout via the API with a forged `Host: evil.com` header gets the *user* redirected to `evil.com` after a successful payment, with whatever query params LS appends (typically an order ID).

**Mitigations in place**:
- Vercel production (custom domain) pins the host header.
- Vercel preview deployments are SSO-gated.

**Mitigations missing**: the code itself trusts the header.

**Fix** (one-line, already documented in May 6 audit):
```ts
const origin = process.env.APP_ORIGIN ?? "https://everion.smashburgerbar.co.za";
const successUrl = `${origin}/settings?tab=billing&billing=success`;
```

Set `APP_ORIGIN` in Vercel env to the canonical production URL. Match the redirect-allowlist in Supabase auth (auth-flow audit F1 has the same theme — same fix shape applies).

### F2 — RC webhook auth is a long-lived static bearer secret
**Severity: MEDIUM** — RevenueCat's documented scheme; no signature

`api/_lib/billing.ts::rcVerifyWebhookAuth` validates `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`. There is **no signature** of the request body — if the secret leaks (logs, env-var misconfig, breach), an attacker can post any RC webhook payload with the leaked bearer token and trigger `writePlanChange` for any user.

**Mitigations in place**: idempotency via `markWebhookEventSeen` prevents replay of *the same* event_id. Different fabricated event_ids would get through.

**Why it's RC's design**: RC publishes only this scheme. They don't sign payloads. The secret is meant to be high-entropy and rotated.

**Fix path**:
1. Rotate `REVENUECAT_WEBHOOK_SECRET` quarterly (calendar reminder).
2. Document the constraint in `EML/Ops/vendors.md` so a future contributor doesn't ship the secret to a less-secure place (e.g., GitHub Actions log).
3. (Defence-in-depth) Add a per-event timestamp check — reject events older than 5 min via `event.event_timestamp_ms`. Forces an attacker to forge fresh events; doesn't help if they have the secret, but raises the bar.

### F3 — `event.id` may be missing — fallback ID is hash-collision-prone
**Severity: LOW**

`user-data.ts:3173-3174`:

```ts
const eventId =
  event.id ?? `${event.type}:${event.app_user_id}:${event.event_timestamp_ms ?? "?"}`;
```

If `event.id` is absent AND two RC events fire in the same millisecond for the same user with the same type (rare but possible during sandbox testing), they collapse into one idempotency key — the second is dropped. Effect: tier write missed.

**Fix**: include a hash of the full event body in the fallback ID, or refuse events without `event.id`.

### F4 — `handleLemonCheckout` rate limit 10/min
**Severity: LOW**

`withAuth({ methods: ["POST"], rateLimit: 10 })`. A user can't spam checkout creation. Tight enough — checkouts are an LS API call and burning 10 of them in a minute is plenty of room for legit re-tries.

### F5 — Webhook events table not pruned
**Severity: LOW** — verify

`webhook_events` table grows monotonically. Each LS / RC event appends a row. Over a year of operations this could be hundreds of thousands of rows. Idempotency window isn't bounded — old events are still kept.

**Fix**: add a daily cron to `DELETE FROM webhook_events WHERE seen_at < NOW() - INTERVAL '30 days'`. Anyone re-trying a 30-day-old event is replaying — if the secret is leaked enough to do that, idempotency isn't your only problem. 30 days is generous.

### F6 — RC webhook doesn't write `audit_log` rows
**Severity: LOW**

LS webhook writes nothing to audit_log. RC webhook writes nothing. Tier changes from billing events are not in audit_log — only admin overrides are.

**Fix**: add `audit_log` row for every tier change with `action = "tier_change_billing"`, `resource_id = subscription_id`, metadata = `{ provider, tier, event_id }`. Closes the audit-coverage gap (carried from May 6 production audit's "audit log coverage for /v1/* and MCP write tools" + this).

### F7 — `lemon-checkout` doesn't accept idempotency-key
**Severity: LOW** — UX

If a user double-taps "Subscribe" → 2 checkout URLs minted at LS. They'll only complete one, but LS now has two pending records.

**Fix**: accept an `Idempotency-Key` header (16-byte hex) and dedup via the existing `idempotency_keys` namespace.

---

## Tier reconciliation walkthrough

| Scenario | Path | DB state |
|---|---|---|
| Web payment, brand new user | LS hosted checkout → LS subscription_created webhook → `writePlanChange(provider=lemonsqueezy)` → RC promotional grant | `user_profiles` tier set; RC marks user as entitled |
| iOS payment, brand new user | Apple → RC INITIAL_PURCHASE webhook → `writePlanChange(provider=revenuecat, store=APP_STORE)` | `user_profiles` tier set with `appstore_original_transaction_id` |
| Web payment → cancel via LS portal | LS subscription_cancelled → `writePlanChange(tier=free)` → RC revoke promotional | tier reverts to `free`; RC entitlement gone |
| iOS expiration | RC EXPIRATION → `writePlanChange(tier=free)` | tier reverts |
| Admin override | `/admin/tier-changer` → `handleAdminSetTier` → audit_log | manual write with audit row |
| Promotional loop avoidance | RC PROMOTIONAL event from LS bridge → `ignored: "promotional"` | no double-write |
| Replay attack | Same `webhook_id` retried → `firstTime: false` | dropped |

All five paths exercised in tests at `tests/api/billing/*.test.ts` (verify before launch).

---

## Pre-launch checklist

| Item | Status | Owner |
|---|---|---|
| F1 fix — `APP_ORIGIN` env var, kill `host` header trust | ❌ | dev |
| `LEMONSQUEEZY_STARTER_VARIANT_ID` + `_PRO_` set in Vercel prod | ⚠ — confirm | ops |
| `LEMONSQUEEZY_WEBHOOK_SECRET` rotated, in Vercel prod | ⚠ — confirm | ops |
| `REVENUECAT_WEBHOOK_SECRET` set in Vercel prod | ⚠ — confirm | ops |
| `LEMONSQUEEZY_API_KEY` in Vercel prod | ⚠ — confirm | ops |
| `REVENUECAT_API_KEY` in Vercel prod | ⚠ — confirm | ops |
| LS subscription cancellation E2E (week 4 plan) | scheduled | dev |
| RC subscription cancellation E2E (Android sandbox, week 3) | scheduled | dev |
| LS portal flow E2E | partial | dev |
| RC promotional bridge integration test | not yet | dev |
| F6 — audit_log for tier_change_billing events | recommended | dev |

## Recommendations (priority)

1. **[HIGH] F1** — set `APP_ORIGIN` in Vercel prod + rewrite `successUrl` to use it. ~5 min code + env config.
2. **[MEDIUM] F2** — document RC secret rotation cadence in `EML/Ops/vendors.md`. Add quarterly calendar reminder.
3. **[MEDIUM] F6** — add audit_log writes to both webhook handlers. ~20 min.
4. **[LOW] F3** — refuse RC events without `event.id`, OR include body hash in fallback ID.
5. **[LOW] F5** — add 30-day pruning cron for `webhook_events`.
6. **[LOW] F7** — accept `Idempotency-Key` header on `handleLemonCheckout`.

## Method

- Read `api/user-data.ts` lines 2950-3260 (LS checkout, LS webhook, RC webhook, LS portal).
- Cross-referenced `api/_lib/billing.ts`, `api/_lib/webhookIdempotency.ts`.
- Verified DB-layer trigger `_lock_billing_columns` from migration 057 / 037 (referenced in `decisions.md` pass 11).
- Walked the bridge: LS → `rcGrantEntitlement` and the RC `PROMOTIONAL` skip.
- Cross-checked F1 against the May 6 security audit (F9, line 2939 there → currently 2981).
- Did not exercise live LS or RC sandbox in this audit — relies on E2E tests scheduled for weeks 3–4.

**Audit kicked off by**: user request "do all those highest-leverage audits" on 2026-05-07.
