# Webhook Audit — 2026-05-07

> Cross-cutting review of every webhook receiver in `api/`. Two only: LemonSqueezy + RevenueCat. No Resend bounce handler. No Sentry hook receiver (Sentry surface is outbound-only via `handleSentryIssues` polling Sentry's API). No GitHub hook. No Capacitor / Stripe receivers. Audit reviews signature verification, idempotency, replay protection, body parsing, rate-limit, audit-log coverage, dead-letter posture, body-size cap. Reference billing-audit-2026-05-07 + rate-limiter-audit-2026-05-07; carries forward open findings, adds net-new ones.

## Verdict

**Two webhooks, both signed, both deduped — but four net-new issues land beyond the carry-forwards.** Mechanism is mostly sound. Both verifiers use `crypto.timingSafeEqual` against the right surface (HMAC-SHA256 raw-body for LS at `api/_lib/lemonsqueezy.ts:125-138`; bearer-string for RC at `api/_lib/revenuecat.ts:101-109`). Idempotency is one shared module (`api/_lib/webhookIdempotency.ts`) with namespaced keys `lemon:event:<id>` vs `revenuecat:event:<id>` — no cross-provider collision possible.

Net-new findings:
1. **F1 (HIGH) — billing-audit referenced a non-existent table.** Idempotency is **Upstash Redis**, not a `webhook_events` Postgres table. Any operator following billing-audit F5's prune cron would `DELETE FROM webhook_events` against nothing. Documentation drift, not a code defect — but billing-audit's mitigation plan is wrong.
2. **F2 (HIGH) — idempotency fails open silently.** When Upstash is unconfigured OR throws, `markWebhookEventSeen` returns `firstTime: true` and the handler runs side-effects again. A retry storm during an Upstash outage will re-write tier rows + re-grant RC entitlements per retry. Inconsistent with `rateLimit.ts:163-175` fail-closed posture.
3. **F3 (HIGH) — LS webhook returns 502 on DB failure → LS retries forever, but idempotency entry is already burned.** Subtle dead-letter trap: `markWebhookEventSeen` reserves the key BEFORE `writePlanChange` runs. If the DB write fails (502), LS retries the same `webhook_id` — the second attempt sees `firstTime: false`, returns 200 + `duplicate: true`, and the tier never lands.
4. **F4 (MEDIUM) — RC webhook accepts events without `id` AND without `event_timestamp_ms` and dedups them on a key like `RENEWAL:<userId>:?` — distinct events for the same user/type collapse into one.**

Plus four carries (F3 from rate-limiter is still open: webhooks have no rate-limit; F1+F2 from billing are still open; F6 from billing — no audit_log on tier change — still open).

---

## Architecture overview

```
LS provider                                                 Vercel
  ┌───────────────┐                                       ┌───────────────────────────────────┐
  │ subscription_ │                                       │ /api/lemon-webhook (rewrite)      │
  │ created /     │ POST raw body  +  X-Signature: <hex>  │   → /api/user-data?resource=      │
  │ updated /     │ ───────────────────────────────────►  │     lemon-webhook                 │
  │ cancelled etc │                                       │   handleLemonWebhook              │
  └───────────────┘                                       │     1. lemonVerifyWebhookSignature│
                                                          │        HMAC-SHA256(rawBody, sec)  │
                                                          │        timingSafeEqual            │
                                                          │     2. JSON.parse(rawBody)        │
                                                          │     3. markWebhookEventSeen("lem  │
                                                          │        on", webhook_id)           │
                                                          │     4. writePlanChange + RC bridge│
                                                          │     5. 200 / 400 / 502            │
                                                          └───────────────────────────────────┘

RC provider                                                Vercel
  ┌───────────────┐                                       ┌───────────────────────────────────┐
  │ INITIAL_PURCH │                                       │ /api/revenuecat-webhook (rewrite) │
  │ RENEWAL /     │ POST  +  Authorization: Bearer <sec>  │   → ?resource=revenuecat-webhook  │
  │ EXPIRATION    │ ───────────────────────────────────►  │   handleRevenueCatWebhook         │
  └───────────────┘                                       │     1. rcVerifyWebhookAuth        │
                                                          │        timingSafeEqual            │
                                                          │     2. JSON.parse(rawBody)        │
                                                          │     3. markWebhookEventSeen("rev  │
                                                          │        enuecat", id-or-fallback)  │
                                                          │     4. PROMOTIONAL skip           │
                                                          │     5. writePlanChange            │
                                                          │     6. 200 / 400 / 401 / 502      │
                                                          └───────────────────────────────────┘

Idempotency store: Upstash Redis (REST API), 24h TTL, key prefix per provider
  lemon:event:<webhook_id>
  revenuecat:event:<event.id-or-fallback>

NO Postgres webhook_events table exists.
```

---

## Webhook inventory

| Provider | Source | Route | Signature scheme | Constant-time? | Body cap | Idempotency key | Dedup TTL | Rate-limit | Audit-log row | DLQ pattern |
|---|---|---|---|---|---|---|---|---|---|---|
| LemonSqueezy | `api/user-data.ts:3023` | `/api/lemon-webhook` → `?resource=lemon-webhook` | HMAC-SHA256(rawBody) compared to `X-Signature` (hex) | YES, `timingSafeEqual` (`lemonsqueezy.ts:137`) | 2 MB (`MAX_RAW_BODY_BYTES`, `user-data.ts:40`) | `lemon:event:<meta.webhook_id ‖ data.id>` | 24h Redis EX | NONE (carry rate-limiter F3) | NONE on tier change (carry billing F6) | None — relies on LS's exponential retry on 5xx |
| RevenueCat | `api/user-data.ts:3163` | `/api/revenuecat-webhook` → `?resource=revenuecat-webhook` | Static bearer (`Authorization: Bearer <sec>`) — NO body sig | YES on bearer compare, `timingSafeEqual` (`revenuecat.ts:108`) | 2 MB | `revenuecat:event:<event.id ‖ "<type>:<userId>:<ts>">` | 24h Redis EX | NONE | NONE | None — RC retries on 5xx with backoff |
| Resend (email bounces) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | **Not implemented** — Resend used outbound only (`api/_lib/sendInviteEmail.ts`); no bounce/complaint webhook |
| Sentry | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | **Not implemented** — `handleSentryIssues` (`user-data.ts:1353`) is OUTBOUND poll of Sentry's REST API, not a receiver |
| GitHub | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | Not implemented |
| Capacitor / Stripe / Mailgun | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | Not implemented |

---

## What's solid

- **Raw-body capture pre-parse** (`user-data.ts:38, 49-67, 88-105`). `bodyParser: false` + custom `bufferBody()` reads the raw bytes once. Both webhook handlers receive the original `Buffer`. JSON.parse happens AFTER signature verification (LS) or after auth (RC). Re-stringify drift can't break HMAC because verification runs against the buffer, not a re-serialized object.
- **2 MB body cap** (`user-data.ts:40, 57-61, 95`). `MAX_RAW_BODY_BYTES = 2 * 1024 * 1024`. Stream `destroy()` + 413 short-circuit prevent unbounded buffer growth when an attacker pumps a 5 GB body. Generous for LS (events run ~5-15 KB) and RC (~3-8 KB).
- **HMAC-SHA256 raw-body for LS** (`lemonsqueezy.ts:125-138`). Reads `LEMONSQUEEZY_WEBHOOK_SECRET`, hashes the buffer with `createHmac("sha256")`, compares hex-decoded signature with `timingSafeEqual`. Length-mismatch returns `bad_signature` BEFORE entering compare — no length-leak via timing.
- **Constant-time bearer compare for RC** (`revenuecat.ts:101-109`). `Buffer.from(authHeader)` vs `Buffer.from("Bearer " + secret)`, length check then `timingSafeEqual`. Standard pattern.
- **Provider-namespaced idempotency keys** (`webhookIdempotency.ts:14, 19`). The `namespace` is a typed union `"lemon" | "revenuecat"` — cannot collide. `lemon:event:abc` vs `revenuecat:event:abc` are separate Redis keys even if both providers ever shipped colliding ids.
- **NX semantics** (`webhookIdempotency.ts:21-22`). `SET key 1 NX EX 86400` — first writer wins atomically at Redis. No race window.
- **Signature failure logs reason but not body** (`user-data.ts:3031`). `[lemon-webhook] signature rejected: <reason>` — `missing_secret | missing_signature | bad_signature`. Enough for ops, no PII leak.
- **Honest non-2xx on signature failure** (`user-data.ts:3032, 3170`). LS returns 400; RC returns 401. Provider retries on 5xx, doesn't retry 4xx — so a code bug that causes signature to fail (e.g., env var rotated) doesn't accumulate retries — it goes silent. This is the right tradeoff IF ops actively monitors the log.
- **Honest 502 on DB write failure** (`user-data.ts:3151-3153, 3237-3238`). `Database write failed — please retry` — provider retries with backoff, doesn't drop the event. Couples to F3 below — see finding.
- **Promotional loop guard** (`user-data.ts:3203-3205`). RC handler ignores `event.store === "PROMOTIONAL"` — those came from our own LS→RC bridge. Without this guard, every web payment double-writes.
- **Method check via `bodyParser: false` + manual dispatch.** Both webhook handlers don't enforce POST explicitly, but Vercel's rewrite + the JSON.parse failure on a GET (empty body) yields a clean 400. Acceptable.
- **Security headers on every response** (`user-data.ts:89` calls `applySecurityHeaders`). `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, etc. Webhooks aren't user-facing but the headers still apply.
- **No PII in webhook logs.** Searched all 6 webhook log strings — only event id, event name, signature reason, user id (already a UUID, not email). No body dumps.

---

## Findings

### F1 — Billing-audit's "webhook_events table" doesn't exist; idempotency is Upstash Redis (HIGH — documentation drift)

**Severity: HIGH** (operator-facing wrong-mental-model; a follow-up engineer running billing-audit F5's prune cron would no-op against a missing table and assume it ran).

`api/_lib/webhookIdempotency.ts:11-44` — the entire idempotency layer is a single `SET key 1 NX EX 86400` against Upstash Redis REST. There is no Postgres table. Grep across the repo for `webhook_events` returns ZERO matches in `api/`, `migrations/`, or anywhere else (only audit `.md` files reference the name).

`webhookIdempotency.ts:9, 22`:

```ts
const TTL_SECONDS = 24 * 60 * 60;
...
`${url}/set/${encodeURIComponent(key)}/1?nx=true&ex=${TTL_SECONDS}`
```

Billing-audit F5 says:

> `webhook_events` table grows monotonically. Each LS / RC event appends a row.
> ...
> **Fix**: add a daily cron to `DELETE FROM webhook_events WHERE seen_at < NOW() - INTERVAL '30 days'`.

That fix is a no-op — there is no such table. Redis handles its own TTL eviction at 24h.

**Real-world implication**:
- Idempotency window is 24h (Redis TTL), not 30d (the proposed prune).
- LS retries on 5xx with backoff up to ~3 days per their docs. An event that fails repeatedly for 24h then succeeds on day 2 will run side-effects twice — once original, once after the Redis key expired.
- Operator following billing-audit's recommendation would write a SQL cron, deploy it, watch it return "0 rows deleted" forever, conclude "great, nothing to prune," and never notice the fundamental TTL gap.

**Fix path**:
1. Update billing-audit + this audit's record so future readers know the source of truth: Upstash Redis, not Postgres.
2. Decide whether 24h TTL is correct. Provider retry windows: LS up to ~72h, RC up to ~3d. **Recommend bumping `TTL_SECONDS` to `7 * 24 * 60 * 60` (7 days)** so any provider retry within their documented window dedups correctly.
3. No prune cron needed — Redis evicts on TTL.

### F2 — Idempotency fails OPEN silently; rate-limiter fails CLOSED — inconsistent posture (HIGH)

**Severity: HIGH**

`api/_lib/webhookIdempotency.ts:17, 28-32, 37-43`:

```ts
if (!url || !token) return { firstTime: true };
...
if (!res.ok) {
  console.warn(`[webhookIdempotency:${namespace}] Upstash HTTP ${res.status} — proceeding without dedup`);
  return { firstTime: true };
}
...
} catch (err) {
  ...
  console.warn(`[webhookIdempotency:${namespace}] Upstash error — proceeding without dedup: ${msg}`);
  return { firstTime: true };
}
```

Three failure modes — Upstash unconfigured, Upstash HTTP non-2xx, Upstash throws — all return `firstTime: true`, meaning "treat as a brand-new event, run all side-effects." During an Upstash outage, every retry of the same LS event gets through; the LS handler then re-writes `user_profiles.tier`, re-calls `rcGrantEntitlement` for each retry. Since LS subscription_payment_success can fire multiple times (initial + retries), one outage window = N duplicate RC grant calls.

`api/_lib/rateLimit.ts:163-175` already chose the opposite posture for the same dependency (also Upstash):

```ts
if (!hasUpstash) {
  if (_onVercel) return false; // serverless without Redis = fail closed
  ...
}
if (_circuitOpen()) return false; // breaker tripped → fail closed
try { ... } catch { return false; }
```

Header comment at `rateLimit.ts:46-50` argues:

> The previous "fall back to in-memory" path is gone. Per-instance memory in a serverless environment provides zero real protection... and turning a misconfigured/down Upstash into a silent open gate is exactly the kind of footgun this hardening is meant to close.

The same argument applies to webhook idempotency. Upstash being down means we're idempotency-blind, and "blind" = "every retry runs the full side-effect chain."

**Counter-arg considered**: failing closed on idempotency means a real subscription_created event that lands during an Upstash outage gets dropped (we'd return 502, LS retries, but Redis is still down → loop → eventual user complaint). True. But the alternative — running full side-effects on every retry — is materially worse for billing correctness.

**Fix**:
1. Add the same circuit-breaker pattern from `rateLimit.ts` to `webhookIdempotency.ts`. Three Upstash failures in a row trip the breaker.
2. When breaker is open, return 503 (not 200) — provider retries with backoff. Sets a known-good outage signal in logs.
3. When Upstash is unconfigured AND `_onVercel`, hard-fail at module-load (or 503 at call-time). Don't silently proceed.

### F3 — Idempotency key reserved BEFORE side-effect — failed handler permanently locks event (HIGH)

**Severity: HIGH**

`user-data.ts:3065-3075` (LS handler order):

```ts
const { firstTime } = await markWebhookEventSeen("lemon", eventId);  // ← step 1: BURN the key
if (!firstTime) {
  console.log(`[lemon-webhook] dropping duplicate event ${eventId} (${eventName})`);
  return void res.status(200).json({ received: true, duplicate: true });
}

const userId = body.meta?.custom_data?.user_id ?? "";
if (!userId) { ... }

const attrs = body.data?.attributes ?? {};
...
dbOk = await writePlanChange({ ... });  // ← step 2: SIDE-EFFECT, may fail
...
if (!dbOk.ok) {
  return void res.status(502).json({ error: "Database write failed — please retry" });
}
```

`user-data.ts:3186-3239` (RC handler) — same pattern.

Sequence:
1. Provider sends event `evt_abc`.
2. Handler reserves Redis key `lemon:event:evt_abc` (NX EX 24h).
3. `writePlanChange` returns `{ ok: false }` (Supabase 500, network blip, RLS denial, anything).
4. Handler returns 502 → provider retries.
5. Retry comes in for SAME `evt_abc`.
6. `markWebhookEventSeen` returns `firstTime: false` (key still held in Redis for 24h).
7. Handler returns 200 + `duplicate: true` → provider STOPS retrying.
8. **Tier never written. User paid. User shows as `free`.**

This is the canonical "burn the idempotency key after success, not before attempt" lesson. Stripe's docs explicitly call it out. We have it inverted.

**Mitigations in place**: none. The 502 path returns the error code provider wants for retry, but the Redis key was already reserved.

**Detection**: would surface as a user-paid-but-shows-free support ticket within the first paying cohort. Without audit-log writes on tier change (billing F6 — still open), there's no log row to grep against.

**Fix paths** (pick one):
- **Option A (simplest)**: Move `markWebhookEventSeen` to AFTER `writePlanChange` succeeds. Tradeoff: between two parallel retries inside the same second, both pass the dedup gate and both call `writePlanChange`. `writePlanChange` is itself idempotent (PATCH on PK), so the worst case is two RC bridge grants — RC's grant endpoint is also idempotent. **This is acceptable for our shape.**
- **Option B (correct)**: two-phase. First call writes a "pending" marker (`SETNX pending:lemon:<id> 1 EX 60`); on success, write a "done" marker (`SET done:lemon:<id> 1 EX 86400`). On retry, check `done` first — if present, drop. If only `pending` and within window, busy-wait or 503-retry-after. More plumbing; doesn't gain us much given Option A's idempotent side-effects.

Recommend Option A. Two-line change.

### F4 — RC fallback event-id collapses distinct events (MEDIUM)

**Severity: MEDIUM** — carried + amplified from billing-audit F3.

`user-data.ts:3186-3187`:

```ts
const eventId =
  event.id ?? `${event.type}:${event.app_user_id}:${event.event_timestamp_ms ?? "?"}`;
```

If `event.id` is missing AND `event.event_timestamp_ms` is missing, the fallback id literally interpolates the string `"?"`. Two distinct RC events for the same user + same type collapse into one Redis key.

Realistic scenario: RC sandbox or a malformed test event that lacks both fields. Two test events of `RENEWAL` for `user_abc` produce key `revenuecat:event:RENEWAL:user_abc:?`. First lands; second drops as "duplicate."

Billing-audit F3 acknowledged the "same millisecond" collision; this audit names the worse "no timestamp at all" case. Both are LOW probability in production but nonzero — and the failure mode (silent drop → tier never written) is the same.

**Fix**:
- Refuse events without `event.id`. RC always populates it for real events; missing means malformed/spoofed.
- OR include a SHA-256 of the canonicalized event body in the fallback id so any difference in payload yields a distinct key. Trivial: `crypto.createHash("sha256").update(rawBody).digest("hex").slice(0,16)`.

Recommend refusing — simpler, surfaces the malformed event as a 400 in logs.

### F5 — Webhooks have NO rate-limit (HIGH — carry from rate-limiter F3)

**Severity: HIGH** — this audit confirms still open.

Verified via re-reading `user-data.ts:88-105` — the dispatch routes to webhook handlers BEFORE any `rateLimit()` call, and the handlers themselves don't call `rateLimit()` either. `applySecurityHeaders` is the only middleware.

Carry-forward — see rate-limiter-audit F3 for full reasoning. Suggested limits:
- `lemon-webhook`: 200/min/IP
- `revenuecat-webhook`: 100/min/IP

The signature/bearer is the primary defence; rate-limit is the kill-switch for the case where the secret leaks. Defence-in-depth.

### F6 — LS `webhook_id` fallback to `data.id` is wrong (MEDIUM)

**Severity: MEDIUM** — net new.

`user-data.ts:3060`:

```ts
const eventId = body.meta?.webhook_id ?? body.data?.id ?? "";
```

LS sends `meta.webhook_id` (a UUID per delivery — different even on retries of the same logical event when LS regenerates it). `data.id` is the **resource id** (e.g., the subscription id), NOT a webhook delivery id. If `meta.webhook_id` is missing (malformed event), falling back to `data.id` would dedup ALL events for that subscription — first INITIAL_PURCHASE writes Redis key `lemon:event:<sub_id>`; subsequent CANCELLATION for the same subscription would see `firstTime: false` → skip → user stays on tier `pro` forever after cancelling.

**Mitigation in place**: LS reliably populates `meta.webhook_id` in real events. Fallback only fires on malformed events.

**Real risk**: a malicious actor with the leaked LS signing secret could craft an event with `meta.webhook_id` omitted to deliberately permanently-lock a subscription. F2 of the billing-audit (RC bearer) is the analogue.

**Fix**: refuse events without `meta.webhook_id`. Don't fall back to `data.id`. One-line change at 3060-3063 — change the OR-coalesce to a hard require + 400.

### F7 — No audit_log row on webhook tier change (carry billing F6, still open)

**Severity: MEDIUM** — verified open.

Re-grep confirmed: `audit_log` writes exist in `capture.ts`, `entries.ts`, `llm.ts`, `mergeEntries.ts`, `entryDelete.ts`, and `user-data.ts:3432` (admin tier change). NEITHER `handleLemonWebhook` NOR `handleRevenueCatWebhook` writes one. Every billing-driven tier change is invisible in the audit trail.

Carry-forward — see billing-audit F6. The fix shape:
```ts
fetch(`${SB_URL}/rest/v1/audit_log`, {
  method: "POST",
  headers: sbHeaders(),
  body: JSON.stringify({
    user_id: userId,
    actor: "webhook",
    action: "tier_change_billing",
    resource_id: subscriptionId ?? appleOriginalTransactionId ?? playPurchaseToken,
    metadata: { provider, tier, event_id: eventId, event_name: eventName },
  }),
}).catch(...);
```
Fire-and-forget — same pattern the existing audit_log writers use.

### F8 — RC handler doesn't validate `app_user_id` is a UUID (LOW)

**Severity: LOW** — net new.

`user-data.ts:3194`:

```ts
const userId = event.app_user_id;
```

`app_user_id` is whatever string the mobile RC SDK sets. Our code sets it to `auth.users.id` (a UUID) on `Purchases.logIn(userId)`. A user with a tampered native build could set it to an arbitrary string. `writePlanChange` PATCHes `user_profiles?id=eq.<that-string>` — Supabase REST will URL-encode and send the WHERE clause. If the string is another user's UUID, `writePlanChange` writes the tier to that other user.

**Mitigations in place**:
- The RC bearer secret bounds who can call this endpoint to RC's own infrastructure. A real attacker would need both (a) a paid native subscription via App Store/Play (cost: $4.99+/mo), AND (b) ability to set `app_user_id` on their device build.
- iOS RC SDK uses Apple's anonymous-id bridging, so the user can't trivially override it without a custom build.

**Fix**: validate `event.app_user_id` matches `/^[0-9a-f-]{36}$/i` (UUID v4 shape) before passing to `writePlanChange`. Reject with 400 if not. ~2 lines.

### F9 — RC fallback id is short and predictable — collision-craftable (LOW)

**Severity: LOW**

`user-data.ts:3186-3187` fallback string `<type>:<userId>:<ts>` is fully predictable to anyone holding the bearer secret. Combined with F8 if `app_user_id` were attacker-set, a forged event could deliberately match a Redis key already in flight to suppress a real event. Compounds with F2.

**Fix**: covered by F4 — refuse events without `event.id`.

### F10 — Webhook responses include `received: true` JSON instead of bare 200 (LOW — informational)

**Severity: LOW** — informational; no fix recommended.

`user-data.ts:3068, 3074, 3098, 3154, 3191, 3204, 3219, 3240`. Sending JSON bodies on 200 is fine — providers ignore the body. Note for record: don't include error detail on 4xx that an attacker could enumerate (we don't — `signature rejected: missing_signature` etc. only land in logs, not the response body).

### F11 — No dead-letter / retry-budget tracking (MEDIUM — operational)

**Severity: MEDIUM** — net new.

Neither handler tracks delivery attempts. If LS retries `evt_abc` 5 times over 3 days and the handler 502s every time, eventually LS gives up. We have no record of the give-up — the event is silently lost.

**Mitigations in place**:
- LS's own dashboard shows failed deliveries and supports manual replay.
- RC same.
- Honest 502 ensures provider retries instead of silently dropping after first failure.

**Gap**: zero observability inside our system. A user-paid-but-not-tier'd ticket has no traceable path through our logs without grepping the provider dashboard.

**Fix path** (recommended): write a `webhook_attempts` row on every `firstTime: true` reception, with `(provider, event_id, event_type, user_id, status, error_detail)`. Cost: one extra DB write per event. Buys: full audit trail of what we received and what happened. F7 above achieves the same purpose if we extend it to include failure cases (write audit_log on success AND on 502 with error detail).

### F12 — Body-size cap is 2 MB but webhook payloads are <30 KB — could be tightened (LOW)

**Severity: LOW** — informational.

`user-data.ts:40`: `MAX_RAW_BODY_BYTES = 2 * 1024 * 1024`. Real LS events are 5-15 KB; RC ~3-8 KB. Anything above 100 KB on either provider is malformed/malicious.

Cap is shared across the entire `/api/user-data` function — capture/upload paths legitimately need 2 MB. Tightening per-resource would require re-architecting.

**No fix recommended** — current cap is generous but not unsafe. Note for record only.

---

## Idempotency-key collision matrix

| Provider A key | Provider B key | Collide? | Why |
|---|---|---|---|
| `lemon:event:abc` | `revenuecat:event:abc` | NO | Namespace prefix typed-union'd in `markWebhookEventSeen` signature |
| `lemon:event:<webhook_id>` | `lemon:event:<webhook_id>` (retry) | YES — by design | Correct dedup |
| `revenuecat:event:<event.id>` | `revenuecat:event:<event.id>` (retry) | YES — by design | Correct dedup |
| `revenuecat:event:RENEWAL:user_x:?` | `revenuecat:event:RENEWAL:user_x:?` (different event, both missing ts) | YES — F4 bug | Distinct events collapse |
| `lemon:event:<sub_id>` (no webhook_id) | `lemon:event:<sub_id>` (different event, same sub) | YES — F6 bug | Distinct events collapse |
| Cross-provider IDs (real shape) | n/a | NO | LS uses UUID v4; RC uses internal opaque ids; namespace prefix is the hard guard |

---

## Replay protection summary

| Vector | Defence | Status |
|---|---|---|
| Same event_id retried within 24h | Redis NX TTL | OK (with F3 caveat — key burned before write) |
| Same event_id retried after 24h | nothing | F1 — bump TTL to 7d |
| Forged signature, real event_id | HMAC verify | OK (LS only — RC has no body sig) |
| Forged event_id with leaked RC bearer | nothing | Carry billing F2 — rotate quarterly + add `event_timestamp_ms` freshness check (suggested 5 min) |
| Forged event_id with leaked LS HMAC secret | nothing | Same — rotate + freshness check on LS `meta.event_created_at` |
| Replay during Upstash outage | nothing | F2 — fail closed instead of open |
| Brute-force rate-limit (no secret) | nothing | F5 — add rate-limit |

---

## Body-cap + parse-order audit

`user-data.ts:88-119`:
1. `applySecurityHeaders(res)` — runs before anything.
2. `bufferBody(req)` — streams up to 2 MB. 413 on overflow.
3. Resource dispatch:
   - Webhook resources receive raw `Buffer`. Sig verify happens FIRST. Parse SECOND.
   - Other resources parse JSON inline; reject malformed with 400.

This order is correct — a malformed JSON body cannot bypass HMAC verification on LS, because verify runs against the buffer. RC bearer doesn't depend on body shape.

One nit: RC handler parses JSON AFTER auth (`user-data.ts:3173-3178`). If body is malformed, response is 400 (not 401). Acceptable — 401 was already returned by `rcVerifyWebhookAuth` if the bearer was missing/wrong; if the bearer is right and the body is junk, 400 is correct.

---

## Recommendations (priority)

1. **[HIGH] F3** — move `markWebhookEventSeen` AFTER `writePlanChange` success in both handlers. Two-line change at `user-data.ts:3065` and `user-data.ts:3188`. Burning the key after the side-effect means a 502-then-retry actually retries.
2. **[HIGH] F2** — port the rate-limiter's circuit-breaker + fail-closed posture to `webhookIdempotency.ts`. Don't run side-effects when Upstash is down. Return 503 — providers retry.
3. **[HIGH] F5** — add `rateLimit(req, 200, 60_000, "lemon-webhook-ip")` and `rateLimit(req, 100, 60_000, "rc-webhook-ip")` at the top of each handler. Defence-in-depth against leaked secret + flood. (Carry from rate-limiter F3.)
4. **[HIGH] F1** — fix the documentation drift. Update billing-audit F5: there is no `webhook_events` table. Bump `TTL_SECONDS` in `webhookIdempotency.ts` to `7 * 24 * 60 * 60` (7 days) so any provider retry within their documented retry window dedups.
5. **[MEDIUM] F4 + F9** — refuse RC events without `event.id`. Drop the fallback. ~3 lines at `user-data.ts:3186`.
6. **[MEDIUM] F6** — refuse LS events without `meta.webhook_id`. Drop the `?? body.data?.id` coalesce.
7. **[MEDIUM] F7** — add `audit_log` writes on every webhook tier change (carry billing F6). Fire-and-forget pattern matches existing writers.
8. **[MEDIUM] F11** — extend F7 to write on failure paths too — `tier_change_billing_failed` rows surface dead-letter cases in the audit trail.
9. **[LOW] F8** — validate `event.app_user_id` matches UUID shape before calling `writePlanChange`.
10. **[LOW] F10/F12** — note for record only. No code change.

---

## Pre-launch checklist (webhook-specific)

| Item | Status | Owner |
|---|---|---|
| F3 fix — move dedup after side-effect | open | dev |
| F2 fix — fail-closed on Upstash outage | open | dev |
| F5 fix — rate-limit on both webhook routes | open | dev (rate-limiter audit also tracks) |
| F1 fix — bump TTL + correct billing-audit doc | open | dev |
| F4 fix — refuse RC events without `event.id` | open | dev |
| F6 fix — refuse LS events without `meta.webhook_id` | open | dev |
| F7/F11 — audit_log writes on tier change + failure | open | dev (billing audit also tracks) |
| `LEMONSQUEEZY_WEBHOOK_SECRET` rotated, in Vercel prod | confirm | ops |
| `REVENUECAT_WEBHOOK_AUTH` set, in Vercel prod | confirm | ops |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` set in Vercel prod | confirm | ops |
| Rotate RC bearer quarterly | confirm calendar | ops |
| LS sandbox replay test (subscription_created → 502 once → retry → idempotency) | scheduled | dev (week 4 plan) |
| RC sandbox replay test (RENEWAL → 502 once → retry) | scheduled | dev |

---

## Method

- Re-read `api/_lib/webhookIdempotency.ts` (45 lines, full) — confirmed Upstash-Redis-only, no Postgres table.
- Re-read `api/_lib/lemonsqueezy.ts` lines 115-138 — HMAC verify path.
- Re-read `api/_lib/revenuecat.ts` lines 97-145 — bearer verify + event type union.
- Re-read `api/user-data.ts:88-105` (dispatch), `:3023-3155` (LS handler), `:3163-3241` (RC handler).
- Re-read `api/_lib/rateLimit.ts:153-176` — confirmed fail-closed posture for comparison with idempotency's fail-open.
- Re-read `vercel.json:67-72` — confirmed both webhook routes rewrite into `user-data.ts`.
- Grep for every webhook signature header (`X-Hub-Signature`, `Sentry-Hook-Signature`, `x-resend-signature`, `webhook_id`) across `api/`. Only LS + RC matches. No Resend bounce, no Sentry receiver, no GitHub hook.
- Cross-checked billing-audit F5's "webhook_events table" claim against repo — no such table exists. Documentation drift confirmed → F1.
- Cross-checked rate-limiter-audit F3 — webhooks have no rate-limit. Still open → F5.
- Cross-checked billing-audit F6 — no audit_log on tier change from webhooks. Still open → F7.
- Did not exercise live LS or RC sandbox in this audit. F3 retry-burn is provable from code-reading alone; sandbox confirms post-fix.

**Audit kicked off by**: user request "webhook audit" on 2026-05-07.
