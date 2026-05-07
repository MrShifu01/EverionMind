# Rate Limiter Audit — 2026-05-07

> Single shared limiter (`api/_lib/rateLimit.ts`) backed by Upstash Redis sliding-window via REST pipeline. Every authed `withAuth`/`withApiKey` route gets a default-30/min budget. `withApiKey` correctly namespaces buckets by `api-key:<userId>:<keyId>`. MCP and shared-mode endpoints (`mcp.ts`, `memory-api.ts`, `calendar.ts`) bypass the wrapper and key purely on IP — that's the central finding. Audit covers mechanism only — per-pipeline numbers stay where the spec audits set them.

## Verdict

**Mechanism mostly right; one critical correctness bug in IP extraction (carried since May 6 audit, NOT yet fixed) plus three structural gaps.**

Strong points: distributed Upstash sliding-window, circuit breaker with 3-failure threshold, fail-closed posture on misconfig, explicit `api-key:<userId>:<keyId>` keying in `withApiKey` (no MCP/JWT collision when `withApiKey` is used), per-route path keying, optional `?action=` suffix.

Hard problems:
1. **F1 (HIGH, carried)** — `_getIp` (`rateLimit.ts:120-131`) takes the **last** entry of `x-forwarded-for`. On Vercel that last entry is the Vercel edge node, not the client. Every user behind the same Vercel PoP shares one bucket. Carried verbatim from `audit-security-2026-05-06.md` line 141. Still unfixed.
2. **F2 (HIGH)** — `api/mcp.ts` does NOT use `withApiKey`. It rolls its own auth and calls `rateLimit(req, 30)` and `rateLimit(req, 10, 60_000, "create_entry")` keyed on raw IP. An MCP API-key request and a same-IP browser JWT request share buckets.
3. **F3 (HIGH)** — Webhook handlers (`handleLemonWebhook`, `handleRevenueCatWebhook`) are dispatched in `user-data.ts:102/105` BEFORE any `rateLimit()` call. No outer wrapper, no inner gate. A leaked secret + spam can hit the JSON parser + signature path with no throttle.
4. **F4 (MEDIUM)** — `memory-api.ts` and `calendar.ts` hand-roll auth and key purely on IP, never on `userId`/`apiKey`. `memory-api.ts` accepts both bearer types in `resolveUser` but ratelimits on IP-only.
5. **F5 (MEDIUM)** — Authenticated routes that key off `<ip>:<path>` lock out any NAT (corporate office, CGNAT mobile carrier, university Wi-Fi) once the bucket fills. `withAuth` runs the limit BEFORE `verifyAuth`, so the userId isn't available — by design — but that means there is no per-user bucket anywhere in the system.
6. **F6 (LOW)** — No login/signup/reset rate-limit because those flows go directly to Supabase `/auth/v1/*` and never touch our serverless functions. Supabase's own rate-limits cover the brute-force surface, but we have zero visibility into them. Confirm.

---

## Architecture overview

```
Request
  │
  ▼
[applySecurityHeaders] (withAuth / withApiKey / hand-rolled)
  │
  ▼
[method check] → 405 if disallowed
  │
  ▼
─── BRANCH on wrapper ────────────────────────────────────────────
  │
  ├─ withAuth (api/_lib/withAuth.ts:128-155):
  │     [rateLimit(req, limit, 60s, opts.rateLimitKey?(req))]
  │       ↓ key = "rl:<ip>:<path>[:<suffix>]"
  │     [verifyAuth] (Supabase /auth/v1/user)
  │     [impl]
  │
  ├─ withApiKey (api/_lib/withAuth.ts:203-252):
  │     [rateLimit(req, max(limit*5,60), 60s, "api-key-auth")]   ← pre-auth IP gate
  │     [resolveApiKey] (lookup em_<key> → userId,keyId,brainId)
  │     [rateLimit(req, limit, 60s, "api-key:<userId>:<keyId>[:<suffix>]")]  ← per-key
  │     [impl]
  │
  └─ hand-rolled (mcp.ts, memory-api.ts, calendar.ts, gmail.ts:auth):
        [rateLimit(req, limit)]   ← IP-only, no per-user/per-key suffix
        [auth]
        [impl]
  │
  ▼
─── INSIDE rateLimit() (api/_lib/rateLimit.ts:153-176) ───────────
  │
  ▼
[_getIp(req)]                          ← LAST entry in x-forwarded-for (BUG)
  │
  ▼
key = suffix
  ? "<ip>:<path-first-50>:<suffix>"
  : "<ip>:<path-first-50>"
  │
  ▼
hasUpstash?
  ├── no, Vercel  → return false (fail closed)
  ├── no, dev     → in-memory
  └── yes:
       │
       ▼
     circuit open?
       ├── yes → return false (fail closed)
       └── no:
            ▼
          [Upstash pipeline: ZREMRANGEBYSCORE / ZADD / ZCARD / PEXPIRE]
            ├── 2xx + count ≤ limit  → allow
            ├── 2xx + count > limit  → 429
            └── err / non-2xx        → record failure, throw → caller fails closed
```

---

## Limit inventory

| Route (file:line) | Wrapper | Methods | Default limit | Window | Key formula | Fail mode |
|---|---|---|---|---|---|---|
| `api/feedback.ts:31` | withAuth | POST | 30 | 60s | `<ip>:<path>` | closed |
| `api/entries.ts:73-78` | withAuth | GET/POST/PATCH/DELETE | 10/30/60/120 (action-aware) | 60s | `<ip>:<path>:<action\|resource>` | closed |
| `api/capture.ts:36-37` | withAuth | POST | 30 (links/default), 120 (embed) | 60s | `<ip>:<path>` | closed |
| `api/llm.ts:1083-1108` | withAuth + inner | POST | 10 (transcribe) / 40 outer; inner 6/10/15/20/30 by action | 60s | `<ip>:<path>` outer, `<ip>:<path>:<action>` inner | closed |
| `api/search.ts:41-46` | withAuth | GET/POST | 10 (GET)/20 (POST) | 60s | `<ip>:<path>` | closed |
| `api/transfer.ts:27-33` | withAuth | GET/POST | 10/30 | 60s | `<ip>:<path>` | closed |
| `api/v1.ts:349` | **withApiKey** | POST | 30 | 60s | `<ip>:<path>:api-key:<userId>:<keyId>` | closed |
| `api/mcp.ts:766` | hand-rolled | POST/GET | 30 | 60s | `<ip>:<path>` (NO key suffix) | closed |
| `api/mcp.ts:878` (`create_entry`) | hand-rolled | tools/call | 10 | 60s | `<ip>:<path>:create_entry` | closed |
| `api/mcp.ts:980` (`merge_entries`) | hand-rolled | tools/call | 5 | 60s | `<ip>:<path>:merge_entries` | closed |
| `api/mcp.ts:996` (`gmail_sync`) | hand-rolled | tools/call | 5 | 60s | `<ip>:<path>:gmail_sync` | closed |
| `api/memory-api.ts:51` (retrieve) | hand-rolled | POST | 20 | 60s | `<ip>:<path>` | closed |
| `api/memory-api.ts:87` (upcoming) | hand-rolled | GET | 30 | 60s | `<ip>:<path>` | closed |
| `api/calendar.ts:314` | hand-rolled | any | 30 | 60s | `<ip>:<path>` | closed |
| `api/gmail.ts:164` (`gmail-auth`) | hand-rolled | POST/GET | 30 | 60s | `<ip>:<path>:gmail-auth` | closed |
| `api/gmail.ts:220` (authedHandler) | withAuth | GET/POST/PUT/DELETE | 60 | 60s | `<ip>:<path>` | closed |
| `api/gmail.ts:254` (scan) | withAuth + inner | POST | 5 | 60s | `<ip>:<path>:gmail-scan:<user.id>` | closed |
| `api/gmail.ts:299` (deep-scan) | withAuth + inner | POST | 3 | 60s | `<ip>:<path>:gmail-deep-scan:<user.id>` | closed |
| `api/user-data.ts:155-211` (profile) | withAuth | GET/PUT | 30 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:223-262` (checklist_done) | withAuth | GET/POST | 60 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:267+` (vault) | withAuth | GET/POST/PATCH/DELETE | 60 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:892+` (vault_entries) | withAuth | GET/POST/PATCH/DELETE | 60 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:1100` (brain_vault_grants) | withAuth | GET/POST/PATCH | 30 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:1133` (pin) | withAuth | GET/POST | 60 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:1217` (health) | withAuth | any | **false (none)** | — | — | n/a |
| `api/user-data.ts:1354` (sentry_issues) | withAuth | GET | 20 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:1427-1595` (vault sub) | withAuth | mixed | 20–60 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:1778` (push) | withAuth | POST/DELETE | 10 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:1867` (full_export) | withAuth | GET | 5 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:1909` (delete_account) | withAuth | DELETE | 5 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:1951` (api_keys) | withAuth | GET/POST/DELETE | 20 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:2036+` (notifications/prefs/push) | withAuth | mixed | 20-30 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:2304+` (cron-hourly) | hand-rolled HMAC | POST | **none** | — | bearer-secret only | n/a |
| `api/user-data.ts:2660+` (cron-daily) | hand-rolled HMAC | POST | **none** | — | bearer-secret only | n/a |
| `api/user-data.ts:2781` (admin_users) | withAuth | GET/PATCH/DELETE | 60 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:2839` (admin_user_overview) | withAuth | GET/PUT | 60 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:2972` (lemon-checkout) | withAuth | POST | 10 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:3023` (lemon-webhook) | hand-rolled | POST | **none** | — | sig only | n/a |
| `api/user-data.ts:3163` (revenuecat-webhook) | hand-rolled | POST | **none** | — | bearer only | n/a |
| `api/user-data.ts:3245` (admin_set_tier) | withAuth | POST | 10 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:3294/3319` (admin_users + read) | withAuth | GET | 60 | 60s | `<ip>:<path>` | closed |
| `api/user-data.ts:3351` (lemon-portal) | withAuth | POST | 30 | 60s | `<ip>:<path>` | closed |
| Supabase auth (`/auth/v1/login`, `/signup`, `/recover`) | direct to Supabase | — | **NOT in our code** | — | Supabase native | n/a |

---

## What's solid

- **Distributed limiter via Upstash sliding-window** — `_upstashLimited` (`rateLimit.ts:79-118`) implements the canonical ZREMRANGEBYSCORE/ZADD/ZCARD/PEXPIRE pipeline. Atomic via the Upstash pipeline endpoint. Members are deduped with `${now}:${crypto.randomUUID().slice(0,8)}` so concurrent calls in the same ms don't collapse. Window TTL is renewed every call.
- **Circuit breaker** (`rateLimit.ts:51-73`). 3 consecutive Upstash failures trip the breaker; it stays open 5 min before probing again. Logged at `[rateLimit] Upstash circuit OPEN ...`. Prevents the limiter from absorbing 100% of request latency when Upstash is wedged.
- **Fail-closed posture** (`rateLimit.ts:163-175`). If Upstash isn't configured on Vercel: deny. If breaker is open: deny. If the call throws: deny. The previous "fall back to in-memory" path was removed because per-instance memory in serverless gives zero real protection — header comment at `rateLimit.ts:46-50` explains the rationale and the code matches.
- **Per-instance in-memory only in dev** (`rateLimit.ts:163-166`). `_onVercel` check prevents the dev-convenience path from leaking into prod.
- **Path-included key** (`rateLimit.ts:160-161`). `req.url.split("?")[0].slice(0,50)` — separate counters per endpoint. Bound to 50 chars to avoid pathological URL keys.
- **Per-action suffix** (`withAuth.ts:55, 137`, `entries.ts:65-69`, `llm.ts:1106`). `?action=` and `?resource=` get their own buckets, fixing the drown-out where opening the admin panel after a session 429'd on the first click.
- **withApiKey gets the key suffix right** (`withAuth.ts:235-244`). After `resolveApiKey` returns the `(userId, keyId)`, the per-key bucket is `api-key:<userId>:<keyId>[:<routeSuffix>]`. An MCP-key request and a JWT-cookie request from the same IP do NOT share a bucket — IF the route uses `withApiKey`. (Spoiler: `mcp.ts` doesn't.)
- **Pre-auth IP gate in withApiKey** (`withAuth.ts:222-227`). Before `resolveApiKey` is called (which is a DB hit), an IP gate of `max(limit*5, 60)` per minute on the suffix `api-key-auth` blocks unauthenticated grinding through every key. 5x the per-key limit lets normal multi-key clients pass.
- **Crypto-strong member ids** (`rateLimit.ts:85`). `crypto.randomUUID().slice(0,8)` — sufficient entropy for Z-set members within a 60s window.
- **In-memory fallback bounds** (`rateLimit.ts:23, 33-34`). 500-key cap + lazy eviction prevents unbounded memory growth in dev.
- **gmail-auth has a separate suffix** (`api/gmail.ts:164`). The OAuth bootstrap won't compete with the `authedHandler` outer 60/min bucket — gets its own `gmail-auth` namespace.
- **gmail-scan / gmail-deep-scan key on user.id** (`api/gmail.ts:254, 299`). Inside `withAuth` after `verifyAuth`, the suffix includes `user.id` — this IS per-user keying and avoids NAT collision for those two expensive endpoints.
- **Cron handlers correctly NOT rate-limited** (`user-data.ts:2304, 2660`). GitHub Actions and Vercel cron callers all share IPs; rate-limiting them by IP would self-DoS the schedule. Auth is via `verifyCronBearer` (`api/_lib/cronAuth.ts:13-24`), constant-time `crypto.timingSafeEqual`. Correct posture.
- **Method-aware limits** (`api/search.ts:44`, `api/transfer.ts:32`). GET vs POST get different budgets where appropriate.
- **No login/signup endpoint surface in our code** (verified — no `signup|login|reset|password|recovery` matches in `api/*.ts` outside of imports/comments). Auth flows go directly to Supabase `/auth/v1/*` from the browser SDK; Supabase's own rate-limits cover the brute-force surface.

---

## Findings

### F1 — `_getIp` returns Vercel edge IP, not client IP — every PoP user shares a bucket (HIGH, carried)

**Severity: HIGH** — carried from `audit-security-2026-05-06.md` line 141. Still present.

`api/_lib/rateLimit.ts:120-131`:

```ts
function _getIp(req: ApiRequest): string {
  // S1-6: Use LAST IP in x-forwarded-for chain (closest verified hop from Vercel edge).
  // First hop is user-controlled and spoof-able. x-real-ip is harder to forge.
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  const lastForwarded = forwarded?.split(",").pop()?.trim();
  return (
    lastForwarded ||
    (req.headers["x-real-ip"] as string | undefined) ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}
```

Comment claims the last hop is "the closest verified hop from Vercel edge" — that's the **Vercel edge node**, NOT the client. On Vercel:
- `x-forwarded-for: <client-ip>, <vercel-edge-ip>` (proxies append, so client is leftmost)
- `x-real-ip: <client-ip>` (Vercel sets this to the actual client)

By taking `.pop()` we get the Vercel edge node IP. Every user routed through the same Vercel PoP shares one bucket. Result: a few thousand legitimate users in the same region bursting on, say, `/api/entries` will collectively hit 30/min on the same key and rate-limit each other.

Worse: an attacker on a different PoP gets their own clean bucket. The defence is **inverted** — legit traffic is throttled, attacker traffic is unthrottled.

**Counter-spoof concern in the comment is real** but solvable correctly. On Vercel:
- The client cannot set `x-real-ip` — Vercel overwrites it.
- The client CAN inject extra entries into `x-forwarded-for` — but Vercel always **appends** the real client. So the real client is at the **leftmost** position only if no other proxy is in front of Vercel; if there is, then `x-real-ip` is canonical anyway.

**Fix** (surgical, ~5 lines):

```ts
function _getIp(req: ApiRequest): string {
  // Vercel sets x-real-ip to the actual client. x-forwarded-for has the
  // client at index 0 (leftmost). Both are set by Vercel itself — clients
  // can append to x-forwarded-for but never prepend, so the leftmost
  // entry is the canonical client when x-real-ip is absent.
  const realIp = (req.headers["x-real-ip"] as string | undefined)?.trim();
  if (realIp) return realIp.replace(/:\d+$/, ""); // strip port suffix
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  if (firstForwarded) return firstForwarded.replace(/:\d+$/, "");
  return req.socket?.remoteAddress || "unknown";
}
```

Verify with context7 / Vercel docs before merging. Architecture note in `EML/architecture/auth.md:272, 481` already flags this; the code did not catch up.

**No port-stripping today** (`rateLimit.ts:120-131`). Vercel sometimes appends `:port` on `x-forwarded-for`. Strip via `.replace(/:\d+$/, "")`.

### F2 — `api/mcp.ts` rate-limit keys collide between MCP API-key and same-IP browser JWT (HIGH)

**Severity: HIGH**

`api/mcp.ts:766`:

```ts
if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });
```

`api/mcp.ts:878, 980, 996` — same pattern with `"create_entry"`, `"merge_entries"`, `"gmail_sync"` suffixes:

```ts
if (!(await rateLimit(req, 10, 60_000, "create_entry"))) {
```

None of these include the resolved `userId`/`keyId` in the suffix. Bucket key is `<ip>:/api/mcp[:<tool>]`. Effects:

1. **Cross-identity collision.** A user's browser tab using a Supabase JWT to hit `/api/mcp` (via the MCP debug panel) shares a bucket with their MCP API-key client running on the same machine — both get throttled at 30/min combined.
2. **Multi-key under one IP.** A user with two MCP API keys on one machine has them share a bucket. F4 of `withApiKey` is exactly the bug this avoided — `mcp.ts` rolls its own auth and never gets the per-key suffix.
3. **NAT lockout.** Same as F1 — but here it bites harder because MCP traffic is a **single tool burst** (a Claude Desktop session firing 30 `retrieve_memory` calls in 5s blocks every other office user behind the same NAT).

The `withApiKey` wrapper at `api/_lib/withAuth.ts:235-244` is the right pattern. `mcp.ts` doesn't use it because the JSON-RPC envelope diverges from the wrapper's typed-throw contract — but it could still call `resolveApiKey` first (it does at line 822), then call `rateLimit(req, limit, 60_000, "api-key:<userId>:<keyId>")` after.

**Fix**: refactor the per-tool gates to run after `auth = await resolveMcpBearer(rawKey)` (line 822) and key on `api-key:${userId}:${tool}`. The pre-auth IP gate at line 766 stays as a DoS shield (mirror `withApiKey`'s `max(limit*5, 60)` pattern at `withAuth.ts:222`).

### F3 — Webhook handlers (lemon, revenuecat) have NO rate-limit (HIGH)

**Severity: HIGH**

`api/user-data.ts:99-105`:

```ts
const resource = req.query.resource as string | undefined;

// LemonSqueezy webhook uses raw body for HMAC signature verification.
if (resource === "lemon-webhook") return handleLemonWebhook(req, res, rawBody);
// RevenueCat uses Authorization header (raw body not required) but we
// still pass it through so signature/parse logic stays consistent.
if (resource === "revenuecat-webhook") return handleRevenueCatWebhook(req, res, rawBody);
```

`handleLemonWebhook` (line 3023+) and `handleRevenueCatWebhook` (line 3163+) do **no** `rateLimit()` call. Mitigations rely on:
- LS: HMAC signature (`lemonVerifyWebhookSignature`, line 3029)
- RC: static bearer (`rcVerifyWebhookAuth`, line 3169)

**Why it matters** (defence in depth — billing-audit-2026-05-07.md F2 already flags the bearer secret as the only barrier on RC):
- A rogue actor who learns the RC bearer can spam thousands of fabricated events/sec. Each one parses JSON, hits `markWebhookEventSeen` (DB write), and short-circuits on duplicate. CPU + DB load with no hard cap.
- LS HMAC is the safer one, but signature verification on a 25 MB body per event still costs CPU. Without a rate-limit, a target of unsigned spam still consumes function-time budget (Vercel function-seconds are billed).
- F5 in the billing audit (webhook_events not pruned) compounds: spam grows the table.

**Fix**: add a per-IP rate-limit at the top of each webhook with a generous budget (LS legitimately fires bursts on subscription_payment_success during a sale). Suggested:
```ts
if (!(await rateLimit(req, 200, 60_000, "lemon-webhook-ip"))) {
  return void res.status(429).json({ error: "Too many requests" });
}
```
`200/min` is well above any real LS firing pattern (their docs say expect retries on backoff, not a burst). RC similar at `100/min`.

The webhook IPs themselves are effectively allowlisted via signature/bearer — the rate-limit is a kill-switch for the case where the secret leaks.

### F4 — `memory-api.ts` and `calendar.ts` and `mcp.ts` use IP-only keys for authed routes (MEDIUM)

**Severity: MEDIUM**

`api/memory-api.ts:51, 87`:

```ts
async function handleRetrieve(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 20))) return res.status(429).json({ error: "Too many requests" });
  ...
  const auth = await resolveUser(req);
```

The rate-limit happens BEFORE `resolveUser` so the user identity isn't available yet — but the limit also runs WITHOUT a per-user suffix even though the route accepts both `em_*` keys and JWTs (`memory-api.ts:31-46`). Result: same as F2 on a different surface — MCP-flavoured retrieve calls and browser retrieve calls from the same IP collide.

`api/calendar.ts:314`:

```ts
if (!(await rateLimit(req, 30))) {
  return void res.status(429).json({ error: "Too many requests" });
}
```

Single bucket per IP for the entire calendar endpoint. Authed Google + Microsoft calendar users behind the same NAT compete.

**Fix**: either move these onto `withApiKey` / `withAuth` (preferred, kills the bug fleet at once), or call `rateLimit` twice — once pre-auth on IP, once post-auth on `<userId>` — mirroring `withApiKey`'s shape.

### F5 — No per-user keying anywhere `withAuth` is used (MEDIUM)

**Severity: MEDIUM** — design issue, NAT-collision risk

`api/_lib/withAuth.ts:128-141`:

```ts
return async (req, res) => {
  const route = startRoute(opts, req, res);
  if (!route.ok) return;
  const { req_id, limitSpec } = route;

  try {
    const limit = routeLimit(limitSpec, req);
    if (limit !== false) {
      const suffix = opts.rateLimitKey?.(req);
      if (!(await rateLimit(req, limit, 60_000, suffix))) {
        res.status(429).json({ error: "Too many requests" });
        return;
      }
    }

    const user = await verifyAuth(req);
```

The rate-limit runs **before** `verifyAuth`. There is no Supabase user yet. So the suffix can include `?action=` or `?resource=` (`opts.rateLimitKey`), but never `user.id`. Buckets are `<ip>:<path>:<action>`.

Consequences for NAT scenarios — a corporate office, a CGNAT mobile carrier, a Wi-Fi at a co-working space:
- 50 employees on `everion.smashburgerbar.co.za`, all logged in.
- They hit `/api/feedback` (limit 30/min) — at 30 RPM combined the 31st user 429s.
- For the home-feed `?resource=undefined`, similar throttle.

Two of the eight `withAuth` consumers manually inject `user.id` into the suffix (gmail-scan, gmail-deep-scan) but that's done via a SECOND `rateLimit` call inside the impl AFTER the outer wrapper has already paid the IP-keyed cost.

**Fix shape (medium-effort)**: split the wrapper into two phases:
1. **Pre-auth IP gate** — keep the existing call with a generous `max(limit*5, 60)` budget on `pre-auth:<ip>`.
2. **Post-auth per-user gate** — after `verifyAuth`, run a second `rateLimit(req, limit, 60_000, "user:<user.id>:<routeSuffix>")`.

This matches the `withApiKey` two-call pattern (`withAuth.ts:222-227, 235-244`). Pre-launch this is a 30-line refactor in `withAuth.ts`. Defers the cost: most legit traffic won't hit the IP gate; the ones who do are rate-limited per-user, which is what we actually want.

Trade-off: 2× Upstash calls per request. Upstash REST pipeline is ~30ms p50. At 1k RPM that's 60k calls/min vs 30k. Upstash free tier = 10k/day; paid tiers are pay-per-request, ~$0.0002/call. Cost: ~$0.10/day at 1k RPM. Cheap.

### F6 — Login/signup/reset flows have no app-side rate-limit because they don't touch our serverless surface (LOW)

**Severity: LOW** — verify Supabase config

Searched `api/*.ts` for `signup|login|reset|password|recovery` — only matches are in:
- `api/_lib/prompts.ts` — system prompt mentions "password" as a sensitive concept
- `api/_lib/logger.ts` — log redaction list
- `api/calendar.ts` — Microsoft auth comments
- `api/user-data.ts` — admin user delete

No `/api/login`, `/api/signup`, `/api/reset`. The browser SDK (`@supabase/supabase-js`) hits Supabase `/auth/v1/login`, `/auth/v1/signup`, `/auth/v1/recover` directly. **None of our rate-limit code runs on those calls.**

Mitigations:
- Supabase has built-in auth rate-limits per project (default 30 emails/hour, sign-up 30/hour per IP, sign-in 30/5min per IP — verify at https://supabase.com/dashboard/project/wfvoqpdfzkqnenzjxhui/auth/rate-limits).
- We have no observability into 429s from Supabase auth — nothing in our logs.

**Fix**: confirm Supabase auth-rate-limit settings are tightened pre-launch (5 sign-ins/min/IP is the recommended credential-stuffing posture). Document the values in `EML/Ops/vendors.md` and `EML/architecture/auth.md`.

If Supabase's bucket isn't tight enough for our launch (we're a high-value vault product → expect credential-stuffing), the only way to add a layer of our own is to put a Vercel rewrite from `/auth/v1/*` → an `api/auth-proxy.ts` that runs `rateLimit` then forwards to Supabase. Out of scope for this audit unless the Supabase config audit says the defaults are loose.

### F7 — `health` route opts out of rate-limiting (LOW)

**Severity: LOW** — informational

`api/user-data.ts:1217`:

```ts
{ methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], rateLimit: false },
```

Health does external probes (DB, Gemini, Groq, Upstash, web-push). With no limit, an attacker can grind unlimited health-checks → unbounded outbound calls from our function. Each call is 4–10s wall-clock and burns provider quota.

Argument for `false`: status pages need it to poll without 429s. Counter: status pollers can authenticate or use a separate `/api/status` endpoint (which `user-data.ts:124, handlePublicStatus` actually exists for and is rate-limited via the wrapper's default).

**Fix**: change `rateLimit: false` → `rateLimit: 30`. The dashboard/admin flows poll at most ~10/min in practice.

### F8 — Pre-auth gate in withApiKey doesn't trip on the user identity (LOW, design note)

**Severity: LOW**

`api/_lib/withAuth.ts:222-227`:

```ts
const preAuthLimit = Math.max(limit * 5, 60);
if (!(await rateLimit(req, preAuthLimit, 60_000, "api-key-auth"))) {
  res.status(429).json({ error: "Too many requests" });
  return;
}
```

Pre-auth bucket is `<ip>:<path>:api-key-auth`. An attacker grinding API keys against the same endpoint from the same IP hits the same bucket — good. But because `_getIp` is broken (F1), the bucket is keyed on the Vercel edge IP, so attackers from different PoPs have separate buckets and the gate is weaker than it looks. Resolves once F1 is fixed.

### F9 — In-memory fallback can mask rate-limit bugs in dev (LOW)

**Severity: LOW**

`rateLimit.ts:163-166`:

```ts
if (!hasUpstash) {
  if (_onVercel) return false; // serverless without Redis = fail closed
  return !_inMemoryLimited(key, windowMs, limit); // dev convenience only
}
```

In dev, the in-memory limiter is per-process. `vite dev` and `vercel dev` each have their own state. A test suite that hits `/api/entries` 100x in a row will see an in-memory bucket fill and throttle — but the production behaviour (Upstash) might be different. Tests that ASSUME rate-limiting are testing the in-memory shim, not the prod path.

**Fix**: add an env var `RATE_LIMIT_FORCE_UPSTASH=1` for tests that want to verify real behaviour against a sandbox Upstash instance. Or run e2e tests with the real Upstash free tier configured.

### F10 — No timeout on the Upstash REST fetch (LOW)

**Severity: LOW**

`rateLimit.ts:96-103`:

```ts
const res = await fetch(`${url}/pipeline`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(pipeline),
});
```

No `AbortController` / `signal` / `timeout`. If Upstash hangs, every request waits the full Vercel function timeout (10s default). The circuit breaker only trips AFTER 3 failures — first three slow requests still pay the full hang.

**Fix**: 800ms timeout via `AbortController`. If the abort fires, that counts as a failure → record + rethrow → caller fails closed. Same pattern `verifyAuth.ts:47-48` already uses with `VERIFY_TIMEOUT_MS = 5_000`. Limit budget should be tighter than auth — 800ms is generous for a Redis hop.

### F11 — `req.url` includes query string before split — bound is on the wrong slice (NIT)

**Severity: NIT**

`rateLimit.ts:160`:

```ts
const path = (req.url || "").split("?")[0].slice(0, 50);
```

Already strips query, then 50-char cap. A 50-char path bound is fine in practice (`/api/user-data` is 14 chars). No real bug — note for future maintainers that the limit applies to the un-encoded path only.

---

## Surface map

```
Authenticated user (browser, JWT)
  └─ withAuth → IP-only key, suffix by ?action=    [F5]
  
Authenticated user (em_* API key, "personal" key)
  └─ withApiKey → IP pre-auth + per-key post-auth   ✓ correct
  
Authenticated user (em_* API key, MCP variant)
  └─ mcp.ts hand-rolled → IP-only, NO per-key       [F2]
  
Authenticated user (Bearer JWT or em_*, memory-api)
  └─ memory-api.ts hand-rolled → IP-only            [F4]
  
Authenticated user (calendar)
  └─ calendar.ts hand-rolled → IP-only              [F4]
  
Unauthenticated (login/signup/recover)
  └─ Supabase /auth/v1/* directly                   [F6 — outside our control]
  
Webhook (LS, RC)
  └─ user-data.ts dispatcher → NO rate-limit         [F3]
  
Cron (Vercel cron, GitHub Actions)
  └─ user-data.ts hand-rolled HMAC → NO rate-limit  ✓ correct (intentional)
  
Health probe
  └─ withAuth(rateLimit: false) → NO limit          [F7]
```

---

## Findings to prove or refute

| # | Finding | Status | Evidence |
|---|---|---|---|
| F | Every mutating endpoint has a rate-limit applied | ⚠ partial | webhooks (`user-data.ts:3023, 3163`) bypass; cron is intentional |
| F | Auth endpoints have aggressive credential-stuffing limits | ❓ outside | login/signup land at Supabase, not our code (F6) |
| F | x-forwarded-for parsing is correct (leftmost client IP, port stripped) | ❌ | takes LAST entry (`rateLimit.ts:124`); no port strip |
| F | Authenticated requests key by user_id, not IP, when possible | ❌ | only gmail-scan / gmail-deep-scan inject `user.id` (`gmail.ts:254, 299`); rest is IP |
| F | Fail-open vs fail-closed is route-appropriate | ⚠ | universally fail-closed; reads should fail-open per the audit spec |
| F | MCP requests keyed separately from user-JWT requests | ❌ | `mcp.ts:766, 878, 980, 996` — IP-only |
| F | No silent fail (Upstash timeout caught & logged, not swallowed) | ✓ | `rateLimit.ts:106, 115` log all paths |
| F | Webhook receivers have idempotency + rate-limit | ⚠ | idempotency yes (`webhookIdempotency.ts`), rate-limit no (F3) |

---

## Limitations

- **Did not exercise live Upstash** (no free credentials in `.env.example` — only template values). Code-only evidence for Upstash behaviour. Verification path: Vercel prod env should have `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set. `health` endpoint at `user-data.ts:1306-1314` probes `/ping` and reports — confirm `upstash: true` on the prod admin tile pre-launch.
- **Did not measure real `x-forwarded-for` chains on Vercel prod**. F1 is grounded in the May 6 audit's analysis + Vercel docs; verify by adding a debug log line `console.log(req.headers["x-forwarded-for"], req.headers["x-real-ip"])` to one route, hit it from a real device, confirm.
- **Did not inspect Supabase auth dashboard rate-limits** — F6 assumes defaults. Check at https://supabase.com/dashboard/project/wfvoqpdfzkqnenzjxhui/auth/rate-limits before launch.
- **Cron HMAC verification not separately audited here** — covered in cron-related audits.

---

## Recommendations

Priority order — most leverage first.

1. **[HIGH] F1 — Fix `_getIp`.** ~5 lines in `rateLimit.ts:120-131`. Switch to `x-real-ip` first, leftmost `x-forwarded-for` second, strip port. Verify with a one-shot debug log on Vercel prod. **Blocks launch — this is the bug that turns the limiter into a footgun.**

2. **[HIGH] F2 — Refactor `mcp.ts` rate-limit calls to include `<userId>:<keyId>` after auth.** Move the per-tool limits below `resolveMcpBearer`. Add a pre-auth `<ip>:<path>:mcp-auth` gate at `max(limit*5, 60)` matching `withApiKey`. ~30 lines. **Blocks launch — MCP is one of the headline external surfaces for thousands of users.**

3. **[HIGH] F3 — Add basic rate-limit to LS + RC webhook handlers.** 200/min for LS, 100/min for RC, IP-keyed with named suffix. ~10 lines total in `user-data.ts:3023, 3163`. Defence-in-depth against secret leaks.

4. **[MEDIUM] F4 — Move `memory-api.ts` and `calendar.ts` onto `withAuth`/`withApiKey`.** Or, if the wrapper shape doesn't fit, do the two-phase pattern manually. ~50 lines net.

5. **[MEDIUM] F5 — Add post-auth `user:<id>:<route>` keying to `withAuth`.** Pre-auth IP gate stays for DoS shield; per-user gate is the real limit. ~30 lines in `withAuth.ts`. Doubles Upstash calls; cost is negligible at our scale.

6. **[LOW] F6 — Confirm Supabase auth rate-limit settings.** Tighten to 5 sign-ins / 5min / IP. Document in `EML/Ops/vendors.md`. Add Sentry alert on Supabase 429 spikes if the dashboard surfaces them.

7. **[LOW] F7 — Set `health` to `rateLimit: 30`.** One word change. Status pages can poll `/api/status` (already exists at `user-data.ts:124, handlePublicStatus`).

8. **[LOW] F10 — Add 800ms timeout on Upstash fetch via `AbortController`.** ~5 lines in `_upstashLimited`. Stops first 3 failure-path requests hanging the full Vercel function budget.

9. **[LOW] F8, F9, F11 — informational.** Pick up F8 once F1 lands. F9 is a test-infrastructure concern. F11 is a NIT.

Pre-launch must-fix: **F1, F2, F3.** Without these, the limiter doesn't actually limit the way the code thinks it does.

---

## Method

- Read `api/_lib/rateLimit.ts` end-to-end (175 lines).
- Read `api/_lib/withAuth.ts` end-to-end (252 lines), confirmed `withAuth` and `withApiKey` keying.
- Grepped `from "../_lib/rateLimit"` and `from "./_lib/rateLimit"` — 7 callsites in api/ root + 1 in `_lib/withAuth.ts`.
- Grepped `rateLimit\(|rateLimit:|rateLimitKey:` — 38 unique call/option lines, every one inspected.
- Read each callsite (`api/calendar.ts:314`, `api/gmail.ts:164/220/254/299`, `api/llm.ts:1086/1106`, `api/mcp.ts:766/878/980/996`, `api/memory-api.ts:51/87`, `api/search.ts:44`, `api/transfer.ts:32`, `api/v1.ts:349`, plus all `api/user-data.ts` instances dispatched via rewrites in lines 80-149).
- Verified `verifyAuth.ts` runs AFTER `rateLimit` in the wrapper (so user.id is unavailable to the outer limit; confirms F5).
- Verified `cronAuth.ts:13-24` uses `crypto.timingSafeEqual` on bearer; confirmed cron callers correctly bypass rate-limit.
- Cross-checked F1 with `EML/Audits/archive/audit-security-2026-05-06.md` line 141 and `EML/architecture/auth.md` line 272/481.
- `.env.example` lines 50-53 confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are documented; production values not readable from this audit.
- Confirmed no `/api/login`, `/api/signup`, `/api/reset` handlers exist — auth flows direct to Supabase (F6).
- Did not run live HTTP probes against prod or sandbox Upstash.

**Audit kicked off by**: user request "do all those highest-leverage audits" on 2026-05-07.
