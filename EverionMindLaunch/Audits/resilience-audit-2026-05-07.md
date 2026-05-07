# Resilience Audit — 2026-05-07

> What happens when third parties slow or fall over. Per-fetch timeout coverage, circuit breakers, retry budgets, graceful degradation. Pre-launch readiness check ahead of public launch.

## Verdict

**Mixed.** Two third parties have proper resilience: Gemini (`api/_lib/aiProvider.ts:57-87` + `googleAi.ts:26-37` — bounded retries + 15s/10s `AbortSignal.timeout`) and Upstash (`api/_lib/rateLimit.ts:51-73` — explicit 3-fail circuit breaker, 5-min open window, fail-closed). Auth verification has its own 5s `AbortController` cap (`api/_lib/verifyAuth.ts:47-48`) plus a 5s in-process cache that collapses parallel page-load round-trips.

**Everything else is unguarded.** ~140 of ~150 raw `fetch()` calls across `api/` ship without any timeout — Supabase REST, Resend, LemonSqueezy, RevenueCat, Sentry, Groq Whisper, Anthropic (gmail.ts), Google OAuth (gmail+calendar), Microsoft Graph. Vercel's serverless wall is 300s, so a hung Supabase or LS connection holds a function instance for 5 minutes burning quota and presenting a frozen UI. Sentry alone added a 4s `AbortController` (`api/user-data.ts:1377-1378`); nothing else copied the pattern.

**Findings: 11.** 3 HIGH, 5 MEDIUM, 3 LOW. Top three: F1 (Supabase fetch has no timeout — 95% of hangs trace here), F2 (Resend, LS, RC, Anthropic, Groq, OAuth provider fetches all have no timeout), F4 (`/api/health` runs all checks sequentially with no per-check timeout — one slow probe pins the endpoint past the 5-min wall).

Caveat: rate-limiter mechanism + fail-closed posture are covered in `EML/Audits/archive/rate-limiter-audit-2026-05-07.md`. This audit references but does not re-audit them.

---

## Architecture overview

```
                           ┌─────────────────────────────────────────────┐
                           │         Vercel serverless function          │
                           │                300s wall                    │
                           └─────┬─────────────────┬─────────────────────┘
                                 │                 │
                ┌────────────────┼─────────────────┼────────────────┐
                ▼                ▼                 ▼                ▼
           Supabase           Gemini           Upstash           others
           (REST+Auth)        (LLM+embed)      (Redis)           (LS/RC/Resend/
           NO TIMEOUT         15s timeout      circuit           Sentry/Groq/
           except verifyAuth  3-attempt        breaker            Anthropic/OAuth)
           5s+cache (F1)      retry            3-fail            NO TIMEOUT
                              fail-soft         5-min open        with 1 exception
                                                fail-closed       (Sentry 4s)
                                                (good)            (F2)
                ▼
           PostgREST
           known to hang
           on lock contention
           (F1 evidence)
```

External dependency surface, raw count from `grep "await fetch(" api/`:

```
~150 total external fetch() calls
        │
        ├── Supabase REST (~95)         — no timeout, no retry (F1)
        ├── Supabase Auth /user (1)     — 5s timeout + cache (verifyAuth — solid)
        ├── Gemini generateContent (~6) — 15s timeout, 3-retry (aiProvider — solid)
        ├── Gemini embedContent (~3)    — 10s timeout, 3-retry (generateEmbedding — solid)
        ├── Gemini direct (~5)          — bare in entries.ts/enrich.ts (F8)
        ├── Groq Whisper (1)            — no timeout, 3-retry (F2)
        ├── Groq /models (1)            — no timeout in handleHealth (F4)
        ├── Anthropic Messages (1)      — no timeout in api/gmail.ts:53 (F2)
        ├── Resend /emails (1)          — no timeout (F2)
        ├── LemonSqueezy /v1/* (2)      — no timeout (F2)
        ├── RevenueCat /v1/subscribers (2) — no timeout (F2)
        ├── Sentry issues (1)           — 4s AbortController ✓ (only example)
        ├── Google OAuth+userinfo (2)   — no timeout (F2)
        ├── Google Calendar events (1)  — no timeout (F2)
        ├── Microsoft OAuth+Graph (3)   — no timeout (F2)
        └── Upstash /pipeline,/ping (2) — no timeout, behind circuit breaker (solid)
```

---

## Third-party dependency inventory

| Provider | Criticality | Fail mode today | Fallback / degradation |
|---|---|---|---|
| **Supabase REST (PostgREST)** | CRITICAL — every endpoint | hang up to 300s on slow query/lock; no caller-side cap (F1) | none. Next request retries from scratch. |
| **Supabase Auth `/auth/v1/user`** | CRITICAL — every authed endpoint | 5s `AbortController` cap → null → 401 (`verifyAuth.ts:47-48`); 5s in-process cache collapses parallel calls | cache absorbs bursts; fail-fast 401 on hang |
| **Gemini (LLM)** | CRITICAL for chat/enrich | 15s timeout per call, 3 retries with exp backoff (100/400/1600 ms), then `""` return (`aiProvider.ts:63-87`) | empty string → caller leaves enrichment flag unset, retries on next sweep. Chat surfaces 502. |
| **Gemini (embeddings)** | CRITICAL for capture/search | 10s timeout per call, 3 retries with exp backoff (500/1500/3500 ms), then HTTP error string (`generateEmbedding.ts:46-57`) | row marked `embedding_status='failed'` after retries; cron picks up later |
| **Upstash Redis** | CRITICAL for rate limiting | circuit breaker (3 consec fail → 5 min open) + fail-closed (`rateLimit.ts:51-73,167-175`) | denies request → 429 / treated as not-allowed |
| **Resend (transactional email)** | LOW — invite emails only | bare `fetch`, no timeout, single attempt (`sendInviteEmail.ts:52-59`) | `{ ok: false, error }` returned to caller; invite flow returns success regardless because acceptUrl is also returned in API response |
| **LemonSqueezy (web checkout)** | HIGH at signup, LOW after | bare `fetch`, no timeout, no retry (`lemonsqueezy.ts:72-80,97-101`) | throws → 502 to client |
| **RevenueCat (mobile billing)** | HIGH at signup, LOW after | bare `fetch`, no timeout, no retry (`revenuecat.ts:58-66,85-88`) | logs error, returns `{ ok: false }` — webhook ack still 200 so RC doesn't retry storm |
| **Anthropic (rule generator)** | LOW — Gmail rule suggestion | bare `fetch`, no timeout, no retry (`gmail.ts:53-84`) | hardcoded fallback string |
| **Groq Whisper (voice)** | MEDIUM — voice notes | retry 3× with backoff (400/1200/3000 ms), NO per-attempt timeout (`llm.ts:1011-1035`) | 502 to client; bytes wasted on hung connection until fn 300s wall |
| **Google OAuth** | HIGH at connect | bare `fetch`, no timeout (`gmail.ts:125-141`, `calendar.ts:71-87`) | redirect with error param |
| **Microsoft Graph + OAuth** | HIGH at connect | bare `fetch`, no timeout (`calendar.ts:135-152`) | redirect with error param |
| **Sentry issues API** | LOW — admin debug tile | 4s `AbortController` (`user-data.ts:1377-1378`) | `error` field on tile response |

---

## What's solid

- **`verifyAuth` 5s `AbortController` + 5s in-process cache** (`api/_lib/verifyAuth.ts:38-77`). One round-trip per token per page load instead of 4–8. Hard 5s cap means a Cloudflare 504 can't drag a Vercel function to its 300s wall. Token cache is bounded (`CACHE_MAX_ENTRIES=500`, oldest evicted via `cache.keys().next()`). On any error/abort: returns `null` → caller maps to 401, fast client failure.

- **Gemini retry budget** (`api/_lib/aiProvider.ts:57-87`). Three retries with 100/400/1600 ms delays. Total wall-time worst-case: 4 × 15s timeouts + 100+400+1600 ms backoff ≈ **62.1 seconds**. Caps within Vercel's wall. 4xx (non-429) short-circuits — no burning credits on permanent errors.

- **Gemini embedding retry budget** (`api/_lib/generateEmbedding.ts:46-57`). 4 attempts with 500/1500/3500 ms delays. Worst-case: 4 × 10s timeouts + 5500 ms backoff ≈ **45.5 seconds**. 429 + 503 retried; everything else short-circuits.

- **Upstash circuit breaker** (`api/_lib/rateLimit.ts:51-73`). After 3 consecutive failures, breaker opens for 5 minutes. While open, `_circuitOpen()` short-circuits `rateLimit()` → fail-closed (returns `false` = "limited"). Recorded success closes the breaker (`_recordUpstashSuccess` line 70).

- **Rate-limiter fail-closed posture in serverless** (`api/_lib/rateLimit.ts:163-175`). No Upstash configured + on Vercel = `return false` (denied). Upstash threw + breaker tripped = `return false`. The previous in-memory fall-back was deliberately removed (commit visible in inline comment) because per-instance maps in serverless = zero protection across cold-boots.

- **Rate-limiter IP source hardening** (`rateLimit.ts:120-131`). Uses LAST hop in `x-forwarded-for` (closest verified Vercel edge). First hop is user-controllable. Documented in S1-6.

- **Webhook idempotency** (LS + RC, via `markWebhookEventSeen`). Re-delivered events are dropped; same evidence the billing audit cited.

- **Admin Sentry tile uses `AbortController`** (`api/user-data.ts:1377-1393`). 4s cap, returns typed error tile rather than wedging the parent dashboard. **Only example of this pattern** outside the `verifyAuth` / Gemini paths.

- **`callbackGoogle` / `callbackMicrosoft` redirect-on-failure** (`api/calendar.ts:71-104,121-168`, `api/gmail.ts:109-160`). Any token-exchange failure redirects to `/settings?...Error=token_exchange` — user sees a banner, not a hung tab. Resilience-by-redirect.

- **RC webhook fire-and-forget on grant failure** (`api/user-data.ts:3124-3132`). LS event triggers `rcGrantEntitlement`; if RC is down, log-and-continue. The user's web session is paid; mobile catches up on next event.

- **Resend wrapped in try/catch with structured error** (`sendInviteEmail.ts:51-68`). Invite flow already returns the `acceptUrl` — owner can copy-paste it manually. Email failure is **not user-blocking by design**.

- **Whisper retry budget bounded** (`api/llm.ts:1007-1035`). 3 retries with 400/1200/3000 ms delays. Even though there's no per-attempt timeout, the retry ladder caps total backoff at ~4.6s.

---

## Findings

### F1 — Every Supabase REST `fetch` is unbounded — ~95 unguarded calls (HIGH)

**Severity: HIGH** — single biggest resilience gap pre-launch.

`grep "await fetch(\`\${SB_URL}" api/` returns ~95 hits. Spot-check sample (all without timeout):

- `api/entries.ts:153,181,196,211,235,246,285,338,447,458,471,531,594,629,668,736,806` — read/patch entry rows
- `api/user-data.ts:159,199,243,344,387,465,482,488,501,520,690,716,725,786,898,918,1086,1141,1149,1166,1173,1455,1462,1489,1542,1563,1571` — brain/profile/vault writes
- `api/_lib/billing.ts:126-133,161-164` — `writePlanChange`, `findUserByProviderId`
- `api/_lib/loadUserAiContext.ts:39-49` — settings + tier in `Promise.all`
- `api/capture.ts:204,252,377,386,414,478,524` — capture pipeline
- `api/llm.ts:268,317,350,385,442,489` — chat tool calls
- `api/feedback.ts:70,109,159,232` — feedback endpoint

PostgREST is documented to occasionally hang under lock contention (the 504/522 storm referenced in `verifyAuth.ts:13-17` comment is the same pattern). Without a caller-side cap, a single stuck row write holds a Vercel function until its 300s wall. Concretely:

- `writePlanChange` (`api/_lib/billing.ts:126-133`) hangs → LS webhook handler hangs → LS retries the webhook (their default 4× over 24h) → another fn instance takes the same lock → cascade.
- `loadUserAiContext` (`api/_lib/loadUserAiContext.ts:39-49`) wraps two Supabase fetches in `Promise.all` with `.catch(() => null)`. Catches the rejection but **not** the hang — `Promise.all` waits for the slowest. If user_profiles is slow, every chat/capture/embed request waits behind it. This is the literal `Promise.all` + slow-fetch pattern called out in the scope.

**Evidence the wall actually gets hit**: `verifyAuth.ts:31-37` ships with a comment documenting "Supabase auth occasionally returns 504/522 under load (Cloudflare front-of-queue timeout); without a timeout here the Vercel function holds the connection open until its 300s budget runs out." That's a fix already applied in one place — every other Supabase call is still in the broken state the comment describes.

**Fix**: wrap every `fetch(\`${SB_URL}/…\`)` through a helper that injects `AbortSignal.timeout(8_000)` (REST) or `AbortSignal.timeout(15_000)` (RPC). Single helper in `api/_lib/sbHeaders.ts` or new `api/_lib/sbFetch.ts`. Search-and-replace: `fetch(\`${SB_URL}/rest/v1/…\`, { headers: …` → `sbFetch(\`/rest/v1/…\`, { headers: …`. Deferred 4xx behaviour stays the same; aborts surface as caught network errors.

Carry to `EML/LAUNCH_CHECKLIST.md` P0.

### F2 — Six third parties have zero timeout (HIGH)

**Severity: HIGH** — billing + auth-onboarding paths affected.

| File:line | Provider | Risk |
|---|---|---|
| `api/_lib/billing.ts:126-133,161-164` | Supabase (counted in F1) | tier write hangs entire LS/RC webhook |
| `api/_lib/lemonsqueezy.ts:72-80,97-101` | LemonSqueezy `/v1/checkouts`, `/v1/customers/{id}` | checkout creation hangs → user stuck on "Subscribe" button |
| `api/_lib/revenuecat.ts:58-66,85-88` | RevenueCat `/v1/subscribers/.../entitlements/.../promotional` (and revoke) | LS webhook handler hangs after DB write succeeds — webhook ack delayed → LS retries |
| `api/_lib/sendInviteEmail.ts:52-59` | Resend `/emails` | invite send hangs → invite endpoint stuck (caller `await`s) |
| `api/gmail.ts:53-84` | Anthropic `/v1/messages` (rule generator) | rule suggestion hangs Gmail prefs save |
| `api/gmail.ts:125-141`, `api/calendar.ts:71-87,135-152` | Google OAuth `/token` + `/userinfo`, MS `/oauth2/v2.0/token` + Graph `/me` | OAuth callback hangs → tab stays on `accounts.google.com` redirector / blank `/api/gmail-auth` URL |
| `api/llm.ts:1014-1021` | Groq Whisper transcriptions | per-attempt unbounded; retry ladder backoff bounded but a single hung connection still pins a fn for 300s |
| `api/user-data.ts:1290-1296,1308-1314` | Groq `/models`, Upstash `/ping` health checks | health endpoint can hang on a single dead probe |

**Why it's bad**: each of these is a Vercel function. When one hangs, the function instance is unavailable for **other** requests routed to the same warm container. Cold-start traffic spikes amplify it.

**Fix**: drop a 5–10 s `AbortSignal.timeout(ms)` on each. Specific:

```ts
// LemonSqueezy
const res = await fetch(`${API}/checkouts`, {
  method: "POST",
  headers: { /* … */ },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(8_000),
});

// Resend
fetch("https://api.resend.com/emails", { …, signal: AbortSignal.timeout(5_000) });

// Anthropic rule
fetch("https://api.anthropic.com/v1/messages", { …, signal: AbortSignal.timeout(15_000) });

// OAuth token exchanges
fetch("https://oauth2.googleapis.com/token", { …, signal: AbortSignal.timeout(8_000) });
```

Total surface ≈ 14 lines changed (one per fetch). Shape is identical to the existing `googleAi.ts:39-45` `timeoutSignal` helper.

Carry to `EML/LAUNCH_CHECKLIST.md` P0.

### F3 — Resend bounce/timeout cannot block signup, but invite-accept path **does** await it (MEDIUM)

**Severity: MEDIUM**

`/auth/v1/signup` runs through Supabase Auth, NOT through `sendInviteEmail`. Signup itself is unblocked by Resend (good).

But `api/user-data.ts:382-390` — `handleInviteCreate` — calls `sendInviteEmail(...)` synchronously inside the `withAuth` body and returns the result. If Resend hangs (no timeout, F2), the entire **brain-invite POST** hangs for 300s. The audit-target finding was "doesn't block signup" — true. But the same wrapper does block invite creation.

Evidence: search `sendInviteEmail` callers — `api/user-data.ts` only. The endpoint `await`s the result and shapes it into a response. No `.catch`, no timeout, no fire-and-forget.

**Fix path**: F2 timeout on Resend itself solves the wall-clock issue. To go further: fire `sendInviteEmail(...)` without `await`, return the invite row immediately, and surface "email send pending" in the UI. But that's UX — F2 alone is enough resilience.

### F4 — `/api/health` runs probes sequentially with no per-probe timeout (HIGH)

**Severity: HIGH** — referenced by the observability audit's F4. Health-check cron / external uptime monitor will time out before the endpoint responds.

`api/user-data.ts:1216-1342`. Sequential `await` chain:

1. line 1225 — Supabase REST entries select (no timeout, F1)
2. line 1240 — `googleAiFetch` listing models (10s default)
3. line 1260 — `googleAiFetch` test inference (10s default)
4. line 1290 — Groq `/models` (no timeout)
5. line 1308 — Upstash `/ping` (no timeout)

Worst case any one probe hangs at the function-wall ceiling and the endpoint never returns. UptimeRobot / external monitor sees a timeout and pages, masking the **actual** fault.

The endpoint also lacks `Retry-After` on its 503 (line 1330-1340). Per RFC 9110 a 503 SHOULD include `Retry-After` so callers know how long to wait.

**Fix**:

1. Wrap each probe in `Promise.race([probe(), timeout(3000)])`. All four probes run in parallel; wall-clock = max single probe ≈ 3s.
2. Set `res.setHeader("Retry-After", "30")` before the 503 return.
3. Continue to fail-soft on missing optional providers (Groq, Sentry) — current behaviour at lines 1325-1328 is correct.

```ts
async function probe<T>(label: string, p: Promise<T>, ms = 3_000): Promise<T | null> {
  return Promise.race([
    p.catch((e) => { console.warn(`[health:${label}]`, e?.message ?? e); return null; }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]) as Promise<T | null>;
}
```

Carry to `EML/LAUNCH_CHECKLIST.md` P1.

### F5 — Public `/api/status` does Supabase fetch with no timeout (MEDIUM)

**Severity: MEDIUM**

`api/user-data.ts:1199-1213`. The public status page hits this, edge-cached for 15s + 60s stale-while-revalidate. Cache window helps, but the **first** request after cache eviction during an incident still hangs 300s. The user-facing status page becomes the single most useless page during an incident — if Supabase is down, the page that's supposed to tell the user it's down is also down.

**Fix**: 3s `AbortSignal.timeout(3_000)` on the `fetch` at line 1202. On abort, return `{ ok: false, ts: ... }` — same shape, just `db: false`. The cache then serves the bad-state for the next 15s, which is what we want.

### F6 — No circuit breaker on Gemini (MEDIUM)

**Severity: MEDIUM**

`aiProvider.ts:57-87` has retries but **no circuit breaker**. When Gemini is broadly down (region outage, key revoked, quota exhausted), every chat / capture / enrichment request burns the full 62-second retry budget before failing. With 100 users hitting `/api/llm?action=chat` during an outage, that's 100 fn instances each holding ~60s of wall-clock — potential to exhaust Vercel's per-team concurrency.

Pattern to copy: `rateLimit.ts:51-73`. Consecutive-failure counter + open-window gate. After 5 consecutive Gemini 5xx-after-retries, open the breaker for 60s and short-circuit `callAI` to return `""` immediately.

Concrete shape:

```ts
let _consecutiveGeminiFailures = 0;
let _geminiCircuitOpenUntil = 0;
const GEMINI_CIRCUIT_THRESHOLD = 5;
const GEMINI_CIRCUIT_OPEN_MS = 60_000;
function _geminiCircuitOpen(): boolean { return Date.now() < _geminiCircuitOpenUntil; }
```

Wire into `callAI` boundaries. Same shape for Anthropic/OpenAI in the dispatch — single helper.

**Why MEDIUM not HIGH**: Gemini outages historically resolve in <10 min, retry-storm cost is bounded by Vercel concurrency limits, and graceful degradation already happens (empty string → silent enrichment retry next sweep). But a circuit breaker turns ~60s of wasted wall-time per request into ~1ms of breaker-check overhead.

### F7 — `Promise.all` with mixed external fetches blocks on the slowest leg (MEDIUM)

**Severity: MEDIUM** — direct match to the audit-scope finding.

Hot examples:

- `api/_lib/loadUserAiContext.ts:39-49` — `Promise.all([settings_fetch, tier_fetch])`. **Every authed AI request** calls this. Slow tier fetch = slow chat for the entire session.
- `api/calendar.ts:360-373` — `Promise.all(integrations.map(int => refreshGoogle/refreshMicrosoft → fetchEvents))`. Slow Microsoft Graph holds Google events from rendering. There's an outer try/catch but no per-leg timeout.
- `api/_lib/getUpcoming.ts:47-63` — `Promise.all` of 4 PostgREST fetches (one per date field). Slowest field hangs the whole upcoming-list query.
- `api/entries.ts:1051-1065` — `Promise.all` of integration row + recent decisions + 2 count queries. Used by admin Gmail prompt panel — 4 unbounded fetches.
- `api/_lib/retrievalCore.ts:314,485` — owned + member brain fetches in parallel. Search blocks until both return.

`Promise.all` is correct; the problem is the **legs**. Once F1+F2 land timeouts, this finding evaporates. List as a defence-in-depth check at PR review.

**Fix**: F1+F2 cover this transitively. No new code if those land.

### F8 — Direct Gemini `fetch` calls bypass retry/timeout helpers (MEDIUM)

**Severity: MEDIUM**

Five `fetch(...generativelanguage.googleapis.com...)` sites bypass `googleAiFetch` (which has the 10/15s timeout) and bypass `fetchWithRetry` from `aiProvider.ts`:

- `api/llm.ts:867-887` — list extraction. Has its own `AbortController` + `LIST_EXTRACT_TIMEOUT_MS` (good — only direct-fetch path with a timeout).
- `api/llm.ts:1014-1021` — Whisper Groq (covered in F2).
- `api/_lib/enrich.ts:1912-1924` — fallback chain with manual 429 retry. Uses `googleAiFetch` (has timeout) — actually fine.
- `api/entries.ts:692-700` (`runGeminiBatch`) — uses `googleAiFetch` — fine.
- `api/_lib/distillGmail.ts:159`, `distillRejected.ts:118`, `distillPatternSummary.ts:133`, `gmailPatternScore.ts`, `enrich.ts:442` — all manual `setTimeout`-based 429-handling without a per-attempt timeout. Inherits `googleAiFetch` 10s default when called through that helper.

`api/llm.ts:867-887` is fine — explicit `AbortController` plus error mapping (504 → "List extraction timed out"). That's the **only** direct-`fetch` Gemini call doing it right.

**Fix**: route every Gemini call through `googleAiFetch` from `googleAi.ts` (already takes a `timeoutMs` arg). Where retry semantics are needed, route through `fetchWithRetry` from `aiProvider.ts`. Eliminates the ad-hoc patterns.

### F9 — Webhook handlers don't return `Retry-After` on transient 502s (LOW)

**Severity: LOW**

`api/user-data.ts:3151-3153` (LS webhook) and `:3237-3239` (RC webhook) return `502 "Database write failed — please retry"` when `writePlanChange` fails. No `Retry-After`. LS retries on a fixed schedule (4× over 24h regardless), so this isn't broken, but RC respects `Retry-After` per their docs and would back off cleanly if we set it.

**Fix**: `res.setHeader("Retry-After", "60")` before the 502 returns.

### F10 — `verifyAuth` cache lacks negative caching (LOW)

**Severity: LOW**

`api/_lib/verifyAuth.ts:38-77`. On `!res.ok` the function deletes cached entry (line 59) and returns `null`. **Each subsequent unauthenticated/expired-token request re-hits Supabase auth**. An attacker with a stolen-but-revoked token can DOS Supabase Auth at unbounded RPS by spamming `/api/*`.

The 5s TTL on the positive cache is good. The negative side has no TTL.

**Fix**: cache the failure for 1 second:

```ts
if (!res.ok) {
  if (cached) cache.delete(key);
  cache.set(key, { user: null as any, expiresAt: now + 1_000 });
  return null;
}
```

Reads the type as `AuthedUser` so the cache shape needs `user: AuthedUser | null` — small refactor.

### F11 — Retry budgets are bounded — no unbounded exponential storms (REFUTED — solid)

**Severity: N/A** — this finding tested and **refuted**.

| Component | Max attempts | Max backoff | Worst-case wall |
|---|---|---|---|
| `aiProvider.fetchWithRetry` | 4 (init + 3 retries) | 100+400+1600 = 2100 ms | 4 × 15s + 2.1s = 62.1 s |
| `generateEmbedding.fetchWithRetry` | 4 | 500+1500+3500 = 5500 ms | 4 × 10s + 5.5s = 45.5 s |
| `enrich.fetchEmbedWithRetry` | 4 | same as above | same |
| `llm.handleTranscribe` | 4 | 400+1200+3000 = 4600 ms | bounded by retry ladder; per-attempt unbounded (F2) |
| `capture.handleEmbed` single-entry | 3 | 0+2000+4000 = 6000 ms | per-attempt bounded by `generateEmbedding` |
| Upstash `_upstashLimited` | 1 (no retry) | 0 | breaker handles repeat failures |

No exponential ladder grows past 4 attempts. No fetch loop without an upper bound.

---

## Recommendations (priority)

1. **[P0] F1** — wrap all Supabase `fetch` calls through a `sbFetch(path, init)` helper that injects `AbortSignal.timeout(8_000)` for REST and `15_000` for RPC. ~95 call sites; one helper file; mechanical search-and-replace. Estimated effort: 2–3 hours including PR review.

2. **[P0] F2** — add `signal: AbortSignal.timeout(ms)` to the 14 third-party fetches that have none: 2× LemonSqueezy, 2× RevenueCat, 1× Resend, 1× Anthropic (gmail), 4× OAuth provider (Google + Microsoft × 2), 1× Whisper (per-attempt), 2× health probes (Groq + Upstash). 14 lines. ~30 min.

3. **[P1] F4** — `/api/health` parallelize probes via `Promise.race(probe, timeout(3000))`; add `Retry-After: 30` header on 503. ~20 lines. ~30 min.

4. **[P1] F5** — public `/api/status` Supabase fetch needs `AbortSignal.timeout(3_000)`. 1 line. 5 min.

5. **[P2] F6** — Gemini circuit breaker. Pattern copy from `rateLimit.ts:51-73`. ~30 lines in `aiProvider.ts`. 1 hour.

6. **[P2] F8** — collapse direct-Gemini-fetch sites onto `googleAiFetch` / `fetchWithRetry`. ~1 hour.

7. **[P3] F9** — `Retry-After: 60` on webhook 502s. 2 lines. 5 min.

8. **[P3] F10** — negative-cache `verifyAuth` failures for 1s. ~5 lines. 10 min.

9. **[P3] F3** — fire-and-forget `sendInviteEmail` if F2 timeout doesn't feel fast enough. UX call.

**Pre-launch P0 estimate: ~3.5 hours total work** (F1 + F2 + F4 + F5).

---

## Method

- Grep `await fetch(` across `api/` — 200+ hits, persisted to tool-results file (toolu_01YR...txt). Categorized by host + reviewed surrounding lines for `signal:` / `AbortController` / `AbortSignal.timeout`.
- Grep `Promise.all(` — 27 hits across `api/`. Inspected each for fetch-leg presence.
- Grep `setTimeout` + `AbortController` + `AbortSignal.timeout` — 17 hits. Mapped each to its caller.
- Read `api/_lib/aiProvider.ts` end-to-end — confirmed retry budget + delays, no circuit breaker.
- Read `api/_lib/generateEmbedding.ts` end-to-end — confirmed 10s timeout, 4-attempt ladder.
- Read `api/_lib/rateLimit.ts` end-to-end — confirmed circuit breaker thresholds, fail-closed posture (referenced rate-limiter audit, did not re-audit).
- Read `api/_lib/billing.ts`, `lemonsqueezy.ts`, `revenuecat.ts`, `sendInviteEmail.ts` — confirmed no timeouts on any third-party call.
- Read `/api/health` handler at `api/user-data.ts:1216-1342` — confirmed sequential probes, no per-probe timeout, missing `Retry-After`.
- Read `api/_lib/verifyAuth.ts` — confirmed solid 5s timeout + 5s cache; flagged missing negative cache.
- Cross-referenced `EML/Audits/archive/observability-audit-2026-05-07.md` F4 (health endpoint) — same finding surfaced from a different angle.
- Cross-referenced `EML/Audits/archive/rate-limiter-audit-2026-05-07.md` for fail-closed posture — confirmed in `rateLimit.ts:163-175`, did not re-audit.

**Limitations**:
- Did not exercise live timeouts under real Supabase / Upstash / Gemini load. Numbers above are wall-clock from code reading, not measured.
- Did not check if Vercel's per-team concurrency limit (typically 1000 for Pro) is being approached during the documented 504/522 incidents — would need Vercel platform metrics from the production account.
- Did not audit `api/mcp.ts` external fetches in detail — surface area is internal-only Supabase calls (covered in F1).

**Audit kicked off by**: user request "evidence-based resilience audit" on 2026-05-07.
