# Observability Audit — 2026-05-07

> Sentry init + alert rules + structured log adoption + audit_log coverage + /api/health shape. The thing that determines whether you find out about prod issues from telemetry or from angry users.

## Verdict

**Telemetry is wired but unattended.** Sentry SDK ships, ErrorBoundary captures, source maps generated when DSN is set. PostHog deferred behind consent. Structured logger exists at `_lib/logger.ts` and is adopted at the route boundary + 12 critical sites. `audit_log` table holds 1,749 rows from 9+ write sites. Health endpoint exists with detailed dependency probing.

**The gap is alerts.** Errors are captured but no one is paged. Log queries work but no one reviews them. `audit_log` has 90% coverage but billing webhooks and gmail decisions don't write rows. Public `/status` endpoint exposes too much.

This is a "set up Sentry alert rules + tighten the public status response" pre-launch sprint. ~1 hour total.

---

## What's solid

- **Sentry init gated by consent** (`src/main.tsx:87`): only fires if `localStorage.getItem("everion_analytics_consent") === "accepted"`. Decline → no Sentry.
- **Sentry init deferred to idle** (`src/main.tsx:84`): `requestIdleCallback(run, { timeout: 4000 })` with `setTimeout(run, 2000)` Safari fallback. Doesn't compete with first-paint.
- **`Sentry.init({ sendDefaultPii: false })`** (`src/main.tsx:64`) — no auto-PII (no usernames, IPs, request bodies).
- **ErrorBoundary integration** (`src/ErrorBoundary.tsx:42-52`): captures with `tags: { boundary, staleBundle }` + `extra: { componentStack }`. Re-checks consent before sending. ChunkLoadError detection routes to recovery flow.
- **Stale-bundle recovery** (`ErrorBoundary.tsx:22-39`): unregisters SW + clears caches + reloads with `?_sw=<ts>` cache-bust. Catches the most common dynamic-import-failed scenarios.
- **Source maps generated when Sentry enabled** (`vite.config.js:sentryEnabled`); `filesToDeleteAfterUpload: ["./dist/**/*.map"]` strips them post-upload so they're never served publicly. (W17 from production audit — verify the conditional fires in prod.)
- **Structured logger** (`api/_lib/logger.ts`): `createLogger(req_id, { user_id, key_id })` with `info / warn / error` methods. JSON output for Vercel log queries. 12 hot sites adopted.
- **Request-ID propagation**: `withAuth.ts:111` (`unhandled error in ${label}`), `:149` (per-request log), `:246` (per-API-key log). Every route logs at least error events with `req_id` for trace.
- **`audit_log` table live** (migration 057): 1,749 rows. Service-role insert only; users read own rows via RLS. Schema includes `user_id`, `action`, `resource_id`, `request_id`, `timestamp`, `metadata`.
- **Health endpoint with dep probing** (`/api/health` via withAuth): real DB probe, real Gemini probe (lists models + generates 5 tokens), real Groq probe — not fake booleans.
- **Public `/status` cached** (`/api/status` 15-second edge cache + 60-second SWR): incident-spike-resistant.

## Findings

### F1 — Sentry alert rules not configured (carried, HIGH)
**Severity: HIGH** — F2 from `production-audit-2026-05-07.md`, also pass-11 carry-forward.

SDK captures errors. Source maps upload. **Nobody is paged**. Without alerts, prod issues come in via user complaints — defeating the entire telemetry stack.

Required Sentry alert rules (3-rule minimum from `EML/LAUNCH_CHECKLIST.md`):

1. **Error-rate spike**: `count(*) > 50 in 10m` for any project — baseline alert.
2. **New issue**: any `is:unresolved is:new` issue in the last 24h — first-fire alert (catches regressions).
3. **Slow transaction**: `p95(duration) > 5s` on `/api/llm` and `/api/capture` — UX regression detector.

Routing: email + Slack (or just email at MVP) to user@everion.smashburgerbar.co.za.

**Fix path**: 30 min in Sentry UI → Settings → Alerts. No code change.

### F2 — `/status` endpoint exposes too much (carried — F10 May 6)
**Severity: MEDIUM**

`api/user-data.ts:1198-1212` `handlePublicStatus`:

```ts
const ok = db && ai;
res.status(200).json({ ok, ts: new Date().toISOString() });
```

Wait — actually this returns `{ ok, ts }` only, NOT `{ db, ai, ts }`. **F10 from May 6 was already fixed** here. Verifying: yes, `db` and `ai` are computed but not exposed in the response. ✅ closed.

**However**: the timing of the response *itself* leaks DB latency. A blocked DB → response takes 5s. An attacker can poll `/status` to detect maintenance windows. Edge cache (s-maxage=15) softens this.

Acceptable as-is. **Mark as observed, not a finding**.

### F3 — `audit_log` coverage gaps
**Severity: MEDIUM**

Audit log rows present for: entry create / update / soft-delete / hard-delete / restore / merge / merge_into / empty_trash, capture, llm transcribe, account delete, admin tier change.

**Missing**:
- LemonSqueezy webhook tier writes (F6 in billing audit)
- RevenueCat webhook tier writes (same)
- gmail_decisions (accept/reject swipes)
- Vault entry CRUD
- brain_invites / brain_members admin actions
- /v1/* writes via API key
- MCP mutating tool invocations (createEntry, updateEntry, deleteEntry, gmailSync)

Each missing audit row is a "what happened to this user's data?" question that can't be answered after the fact.

**Fix**: extract `writeAuditLog(user.id, action, resource_id, req_id, metadata?)` helper (F4 from service-role-usage audit). Adopt at the listed sites. Carries from May 6 production audit Strategic Refactor list.

### F4 — Health endpoint returns 200 even on degraded deps
**Severity: MEDIUM** — carried (W12 production audit)

`handleHealth` returns `{ db, gemini, groq, ... }` booleans. Some callers (uptime monitors) expect `200 = healthy, 503 = degraded`. Today the endpoint always returns 200; a uptime monitor watching `/api/health` would never alert on a degraded Gemini state.

**Fix**: when `db === false`, return `503` with the same body. When non-critical deps (gemini/groq) degraded, return `200` with a `degraded: ["gemini"]` field. Pure response-shape change inside the handler. ~10 min.

### F5 — Bare `console.log` for audit-relevant events (carried, W6)
**Severity: LOW** — observability hygiene

15+ sites use `console.log` for audit events when `log.info` would correlate with `req_id`. Already on the pii-leak audit (F5 there) and prior smash-os audit. Migrate to structured logger.

### F6 — No external uptime monitor cited (W15 production audit)
**Severity: MEDIUM**

Sentry tracks errors; `/api/health` exists; but no external pinger watches them. If the entire deployment is wedged, Sentry can't capture (the app isn't running) and `/api/health` isn't being polled (you'd have to load the app to know).

**Fix**: pick one — UptimeRobot (free), BetterStack, Sentry Crons (uptime add-on). Point at `https://everionmind.com/api/status` (which is fast + cached). Alert on 2 consecutive 503/timeout. ~15 min.

### F7 — No PostHog event taxonomy review
**Severity: LOW** — separate audit

PostHog is initialised, gated by consent, used in `lib/posthog.ts`. No audit of event names, funnel completeness, or cohort coverage in this pass — flagged for a separate `telemetry-funnel-audit` (catalogue entry exists).

---

## Coverage matrix

| Telemetry surface | Status | Notes |
|---|---|---|
| Frontend errors → Sentry | ✅ | ErrorBoundary + Sentry.captureException |
| Backend errors → Sentry (server) | ❌ | Sentry only on client. Server logs to Vercel only. |
| Backend errors → Vercel logs | ✅ | structured via `_lib/logger.ts` |
| Auth flow errors → user-visible | ✅ | `friendlyError` mapping |
| Slow transactions → Sentry | ⚠ | Sentry SDK can capture, but no alert rule (F1) |
| Audit log coverage | 🟡 | 90% — F3 lists gaps |
| Source maps → Sentry | ✅ | conditional, deleted post-upload |
| Real-user metrics → Vercel SpeedInsights | ✅ | lazy-loaded, consent-gated |
| Health endpoint → uptime monitor | ❌ | F6 |
| Webhook events → audit log | ❌ | F3 |
| Stale bundle → recovery | ✅ | ErrorBoundary + main.tsx recover |
| PostHog funnels | 🟡 | wired, taxonomy unaudited |

---

## Pre-launch fix list (priority)

1. **[HIGH] F1** — configure 3 Sentry alert rules (error-rate, new-issue, slow-transactions on /api/llm + /api/capture). 30 min in Sentry UI.
2. **[MEDIUM] F4** — health endpoint returns 503 when DB unreachable. 1 line of logic. ~10 min.
3. **[MEDIUM] F6** — set up uptime monitor on `/api/status`. 15 min.
4. **[MEDIUM] F3** — `writeAuditLog()` helper + adopt at the listed gap sites. ~45 min.
5. **[LOW] F5** — migrate bare `console.log` audit lines to `log.info`. ~30 min, low risk.
6. **[INFO] F7** — schedule `telemetry-funnel-audit` separately.

## Verification gauntlet

After F1 + F4 land:

```bash
# Trigger a deliberate error in a non-prod env, confirm Sentry email arrives.
# Take down the staging DB, confirm /api/health returns 503.
# Add an uptime monitor, confirm it fires when staging is down.
# Manually re-check audit_log row count after the next deploy:
SELECT action, COUNT(*) FROM audit_log GROUP BY action ORDER BY 2 DESC;
# Should show: tier_change_billing, gmail_decision, vault_create after F3.
```

## Method

- Read `src/main.tsx:59-87` (Sentry init + consent gate + idle defer).
- Read `src/ErrorBoundary.tsx` (capture + tags + recovery).
- Read `api/_lib/logger.ts` (createLogger contract).
- Greped 273 console.* sites in api/+src/, classified.
- Read `api/user-data.ts:1196-1280` (status + health endpoints).
- Cross-referenced production audit F2 (Sentry alerts) + W12 (health shape) + W15 (uptime monitor).
- DB query: `SELECT COUNT(*) FROM audit_log;` → 1,749 rows.

**Audit kicked off by**: user request "do all those highest-leverage audits" on 2026-05-07.
