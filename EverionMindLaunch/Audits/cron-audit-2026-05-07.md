# Cron Audit — 2026-05-07

> Scheduled-job harness: GitHub Actions workflows curl into Vercel function endpoints with `Authorization: Bearer ${CRON_SECRET}`. Audits the workflow → handler hop, HMAC bearer verification, fan-out concurrency, runtime budget vs Vercel `maxDuration`, kill-switches, last-run visibility, and missed-run / silent-failure surfaces. Excludes per-feature internals — `enrich-cron` lives in the enrichment audit, `gmail-cron` lives in the gmail-sync audit.

## Verdict

**Architecture is right, auth is right, two real risks remain.** Five scheduled workflows in `.github/workflows/`, all on schedule + `workflow_dispatch`. Two carry product traffic — `cron-daily.yml` (heavy fan-out) and `cron-hourly.yml` (per-user time-aware push). Both POST to `/api/cron/{daily,hourly}` which `vercel.json:40-41` rewrites to `?resource=cron-{daily,hourly}` on `api/user-data.ts`. Bearer secret is verified at the top of each handler with constant-time compare via `verifyCronBearer` (`api/_lib/cronAuth.ts:13-24`). `enumerateUsers` works around a broken `listUsers` admin endpoint by pulling distinct `user_id`s from `public.entries` and single-fetching each user — fine at tens of users, will not scale.

**Two findings worth pre-launch attention**: (a) F1 — fan-out is fully serial (no `mapWithConcurrency`, no chunking). One 60s-stuck user delays everyone behind them, and the entire hourly run is wall-clocked at the function ceiling once user count crosses ~30. (b) F2 — no alerting on cron failure. A failed Action goes to GitHub's default workflow-author email; no Sentry, no Slack, no PagerDuty. Daily cron has reportedly **never auto-fired since landing 2026-04-28** (per `architecture/cron.md:144-149`) and we still haven't confirmed it does. Lower-severity findings: F3 missing per-iteration timeout, F4 enumerateUsers O(N) pattern, F5 no idempotency on cron POSTs (workflow re-run double-fires), F6 cron logs include user IDs (PII gradient), F7 `verifyCronHmac` (HMAC variant) exists but is unused — dead code.

---

## Architecture overview

```
GitHub Actions (cron-daily.yml @ 04:00 UTC)
        │
        │  curl --fail --max-time 600 \
        │    -H "Authorization: Bearer ${CRON_SECRET}" \
        │    -X POST https://everion.smashburgerbar.co.za/api/cron/daily
        ▼
Vercel edge ── rewrite (vercel.json:40)
        │       /api/cron/daily → /api/user-data?resource=cron-daily
        ▼
api/user-data.ts ── route dispatch (line 137)
        │       resource="cron-daily" → handleCronDaily()
        ▼
handleCronDaily (line 2660)
        │
        ├── verifyCronBearer(auth, CRON_SECRET)         line 2662  →  401 on miss
        ├── runGmailScanAllUsers()                      line 2675  →  GMAIL_CRON_DISABLE gates
        ├── enrichAllBrains()                           line 2683  →  ENRICH_CRON_DISABLE gates
        ├── runPersonaDecayPass()                       line 2691  →  always
        ├── runPersonaWeeklyPass() if UTCDay()===0      line 2697  →  Sundays only
        └── admin summary (push + bell)                 line 2710-2769

GitHub Actions (cron-hourly.yml @ 0 * * * *)
        │  curl --fail --max-time 300 ...
        ▼
api/user-data.ts → handleCronHourly (line 2304)
        │
        ├── verifyCronBearer                            line 2306
        ├── enumerateUsers("cron/hourly")               line 2320 → ALL signed-up users
        ├── for-of loop over users (serial)             line 2334-2627
        │     ├── daily prompt (tz + 23h cooldown)
        │     ├── weekly nudge (tz + 6d cooldown)
        │     └── expiry fan-out (per-brain, per-entry)
        └── enrichAllBrains({ mode: "hourly" })         line 2639

GitHub Actions (db-backup.yml @ 03:17 UTC)
        │  uses SUPABASE_DB_URL not CRON_SECRET — does NOT cross the cron endpoint
        ▼
pg_dump → gzip → gh release create → prune >30d

GitHub Actions (weekly-roll-up.yml @ Mon 06:00 UTC)
        │  uses SENTRY/POSTHOG/VERCEL/RESEND tokens — does NOT cross the cron endpoint
        ▼
tsx scripts/weekly-roll-up.ts → Resend email
```

---

## Cron inventory

| # | Name | File | Schedule | Handler | Vercel maxDuration | Concurrency | Kill-switch |
|---|---|---|---|---|---|---|---|
| 1 | Daily Cron | `cron-daily.yml` | `0 4 * * *` (04:00 UTC) | `handleCronDaily` (`user-data.ts:2660`) | 300s (`vercel.json:5`) | n/a — task-level | `GMAIL_CRON_DISABLE`, `ENRICH_CRON_DISABLE` |
| 2 | Hourly Cron | `cron-hourly.yml` | `0 * * * *` | `handleCronHourly` (`user-data.ts:2304`) | 300s (`vercel.json:5`) | **fully serial per user** | `ENRICH_CRON_DISABLE` only |
| 3 | DB Backup | `db-backup.yml` | `17 3 * * *` (03:17 UTC) | direct `pg_dump` | n/a (GH runner, 20 min timeout) | n/a — single dump | none — manual `gh workflow disable` |
| 4 | Weekly roll-up | `weekly-roll-up.yml` | `0 6 * * 1` (Mon 06:00 UTC) | `scripts/weekly-roll-up.ts` | n/a (GH runner, 5 min timeout) | n/a — single email | `dry_run` input gates send |
| 5 | Test push | `test-push.yml` | manual only (`workflow_dispatch`) | `scripts/test-push.mjs` | n/a (GH runner) | n/a | n/a — manual |

Out of scope (not cron, listed for completeness): `ci.yml`, `e2e.yml`, `lighthouse.yml`. Lighthouse runs Sun 04:00 UTC (`0 4 * * 0`) and e2e runs `30 6 * * 1-5` — both observability, not product traffic.

---

## What's solid

- **Constant-time bearer check**. `api/_lib/cronAuth.ts:13-24`: `verifyCronBearer` does length precheck → `crypto.timingSafeEqual` over `Buffer.from(header)` vs `Buffer.from("Bearer " + secret)`. Try/catch wraps the compare so a malformed header (non-ASCII, raw bytes) returns false instead of throwing. Both daily (`user-data.ts:2662`) and hourly (`user-data.ts:2306`) gate on this *before* any side-effect work.

- **Single source of truth for the secret**. `process.env.CRON_SECRET` referenced exactly twice in handler code (`user-data.ts:2306, 2662`) and twice in workflows (`cron-daily.yml:29, 40`, `cron-hourly.yml:27, 34`). No duplication, no per-job override. Rotation = update GitHub repo secret + Vercel project env, both sides.

- **Workflows fail loud**. `--fail` on the curl call (`cron-daily.yml:39`, `cron-hourly.yml:33`) makes a 5xx from the endpoint exit non-zero — the GH Action goes red. Stated reason in the workflow comment: *"Vercel cron silently eats errors — that's why we moved off it"* (`cron-daily.yml:36-38`). This is the entire reason the project is on GH Actions cron rather than Vercel native cron.

- **No Vercel native cron in `vercel.json`**. Confirmed — `vercel.json` has no `crons:` block. All scheduled work is in `.github/workflows/*.yml`. Removes one whole class of "did Vercel cron silently fail" mystery.

- **Curl timeout aligned with Vercel function ceiling**. `--max-time 600` on daily (`cron-daily.yml:39`), `--max-time 300` on hourly (`cron-hourly.yml:33`). Daily's 600s is double the function's 300s `maxDuration` — gives the runner network headroom; the function will cap itself first.

- **Per-task try/catch with degraded-shape fallback** in daily handler. Each of the 4 task calls (`runGmailScanAllUsers`, `enrichAllBrains`, `runPersonaDecayPass`, `runPersonaWeeklyPass`) is `.catch(e => { console.error(...); return <fallback shape> })` (`user-data.ts:2675, 2683, 2691, 2697`). One task failure does not poison the rest; response always returns 200 with structured per-task results.

- **Per-user try/catch in hourly handler**. Daily prompt push (`user-data.ts:2374-2385`), weekly nudge push (`user-data.ts:2424-2427`), expiry fan-out (`user-data.ts:2614-2620`) — each has its own `try { ... } catch (err) { console.error(...); errors++ }`. One stuck user does not kill the loop. (Caveat: see F1 — serial execution.)

- **Subscription auto-prune on 410/404**. `user-data.ts:2376-2383`: if web-push returns Gone/Not-Found, the subscription is stripped from `user_metadata` so the next hour's run does not retry forever. Other status codes (429, 500, network) leave the subscription intact. Surgical and correct.

- **Kill-switches for the heavy children**. `envFlagEnabled("GMAIL_CRON_DISABLE")` (`user-data.ts:2673`) and `envFlagEnabled("ENRICH_CRON_DISABLE")` (`user-data.ts:2637, 2681`). Set the env var to `1`/`true`/`yes` in Vercel → next cron pass skips that subsystem with a clean `disabled: true` shape in the response. Documented in `.env.example:98-99` and the audit-fix tracker (`Audits/TODO-AUDIT-FIXES.md:106`).

- **Workflow-level disable** documented in `Ops/crons.md:60-71`. `gh workflow disable "Daily Cron"` is the operator escape hatch. Re-enable sequencing for post-incident is also documented (`Ops/crons.md:76-83`) — hourly first, daily second, backup last.

- **DB backup uses a separate secret** (`SUPABASE_DB_URL`, not `CRON_SECRET`) and runs entirely on the GH runner — never crosses a Vercel function. Smaller blast radius if `CRON_SECRET` leaks: backups keep working.

- **DB backup matches Postgres server version**. `cron-daily.yml`-adjacent `db-backup.yml:40-45` installs `postgresql-client-17` because Supabase server is 17.6 and Ubuntu's default is older. SQL is fully restorable.

- **DB backup pruning is bounded**. `db-backup.yml:80-97` deletes releases tagged `backup-YYYY-MM-DD` older than 30 days, leaving anything not matching the pattern alone. Working set bounded; manual releases are not at risk.

- **Workflow file-level `timeout-minutes`** set on every cron job: 10 min (daily, hourly), 20 min (db-backup), 5 min (weekly-roll-up). Bounds GH runner cost even if curl hangs past `--max-time`.

- **No PII in workflow stdout**. `cron-daily.yml:43-44` and `cron-hourly.yml:37-38` echo only `head -c 4096` of the response body — which is the structured task summary (`{ daily: { sent, skipped, errors }, ... }`), not user data. The body never contains user emails or IDs. (Caveat: see F6 — handler-side console logs *do* contain user IDs, which appear in Vercel function logs, not GH Action logs.)

- **GitHub Actions `permissions:` minimised**. `cron-daily.yml:18-19` and `cron-hourly.yml:16-17` set `contents: read`. `db-backup.yml:26-28` sets `contents: write` because it creates releases. No write tokens leaking into the cron-call jobs.

---

## Findings

### F1 — Hourly cron fan-out is fully serial; one stuck user blocks everyone behind them
**Severity: HIGH** — pre-launch correctness risk

`user-data.ts:2334`:

```ts
for (const user of users) {
  // daily prompt push (network call to web-push)
  // weekly nudge push (network call to web-push)
  // expiry fan-out: brain owners + members fetch, brain_notification_prefs fetch,
  // entries fetch per brain, expiry_notification_log POST, web-push send,
  // notifications insert, patchUserPrefs PUT
}
```

Plain `for-of` over the entire user array. No `mapWithConcurrency`, no chunking, no `Promise.allSettled`. Each user's iteration is itself **multiple round trips**: 1× web-push (daily prompt), 1× web-push (weekly nudge), then for the expiry block: brains-owned fetch + brain_members fetch + brain_notification_prefs fetch + per-brain entries fetch + per-entry expiry_notification_log insert + web-push + notifications insert + patchUserPrefs. Conservative estimate per user: 50-200ms typical, **5-30s pathological** (slow web-push gateway, slow Supabase round-trip, network blip).

**Numbers**: `vercel.json:5` sets `api/user-data.ts maxDuration: 300`. `enumerateUsers` walks `public.entries`-distinct user IDs and `/admin/users/{id}`s each — at 30 active users with 100ms typical and one 5s outlier, hourly run = ~8s. At 100 users = ~30s. At 300 users with one stuck `web-push.sendNotification` = function timeout. **The expiry fan-out makes it worse** — it does `O(brains_per_user × entries_per_brain × leadDays.length)` work, all serial.

`api/_lib/enrich.ts:1313-1335` already implements `mapWithConcurrency<T,R>(items, concurrency, fn)`. `api/_lib/gmailScan.ts:2345-2365` has a duplicate. The pattern is in the codebase; the hourly cron just doesn't use it.

**Fix**: wrap the user loop in `mapWithConcurrency(users, 5, processOneUser)`. Daily prompt + weekly nudge + expiry fan-out → all inside `processOneUser`. Pick a concurrency cap that web-push and Supabase can absorb (5-10 is safe). Drops worst-case wall time from `O(N × max_user_latency)` to `O(N × avg_user_latency / concurrency)`.

**Defer-cost**: at the current ~tens-of-users beta, this is invisible. At launch (target: thousands of users per `MEMORY.md` public-launch-trajectory), the hourly cron times out **silently from the user's perspective** — they just don't get their 9am prompt. Vercel function logs will show the timeout but no user-facing alert (see F2).

---

### F2 — No alerting on cron failures. GitHub email is the only channel
**Severity: HIGH** — silent-failure risk at launch

Per `architecture/cron.md:435-437`: *"A failed Action run goes to GitHub's email list (default: workflow author). No PagerDuty / Slack hook. Add one before any user ever depends on the daily prompt firing."* Confirmed by inspecting the workflows — neither `cron-daily.yml` nor `cron-hourly.yml` has a `failure:` step, no `if: failure()` block, no Slack/Discord/Sentry hook, no Resend email-on-fail.

Worse: `architecture/cron.md:144-149` notes *"the 04:00 UTC schedule has only ever fired once manually since the workflow landed 2026-04-28. The `workflow_dispatch` (manual) trigger works; the `schedule:` trigger has yet to actually run on its real slot."* That doc is dated within the same audit window — meaning **as of 2026-05-07 we still cannot prove the daily cron auto-fires**. No alerting means we'd never know.

**Fix shape** (smallest):
1. Add a `notify-on-failure` step at the bottom of each cron workflow gated `if: failure()`. Resend (already a project secret per `weekly-roll-up.yml:49`) → email `WEEKLY_REPORT_TO`. ~10 lines per workflow.
2. Verify the schedule trigger has actually fired at least once. `gh run list --workflow cron-daily.yml --event schedule --limit 5` — if zero rows, the cron has never auto-run.
3. Add a heartbeat: a `last_run` row in a small `cron_runs` table written at the end of `handleCronDaily` / `handleCronHourly` with `(name, started_at, ended_at, ok, summary_json)`. Build a 24h "last seen" check into the admin dashboard or weekly roll-up. **No table exists today** — grep `cron_runs` returns zero hits.

**Why it's HIGH**: pre-launch the user has admin email + bell-row visibility for daily summary (`user-data.ts:2756-2764`). Post-launch with thousands of users the operator has no way to spot a stuck cron other than support tickets piling up.

---

### F3 — No per-iteration timeout. A single hung web-push call eats the function budget
**Severity: MEDIUM**

`user-data.ts:2359-2366`:

```ts
await webpush.sendNotification(
  { endpoint: sub.endpoint, keys: sub.keys },
  JSON.stringify({ title, body, url: "/capture" }),
);
```

No `AbortController`, no `Promise.race(send, timeout)`. `web-push` defaults to its underlying `https` agent timeout, which is OS/runtime-dependent and usually generous (60s+). Combined with F1 (serial loop), one slow Apple/Mozilla push gateway becomes a Vercel function timeout.

Daily cron's `runGmailScanAllUsers` and `enrichAllBrains` have their own internal budget enforcement (`enrich.ts` enforces a time budget per `Ops/crons.md:14`); the issue is hourly cron's per-user push and per-entry expiry-log calls, which have none.

**Fix**: wrap each web-push call in `Promise.race([send, sleep(5_000).then(() => { throw new Error("push timeout") })])`. Catch logs "timed out" and the iteration moves on. Same pattern for Supabase REST calls inside the loop — bound each at 5-10s.

---

### F4 — `enumerateUsers` is O(N) round-trips; broken-listUsers workaround does not scale
**Severity: MEDIUM**

`user-data.ts:2246-2278`. Walks `public.entries` 1000 rows at a time pulling distinct `user_id`, then for each ID does `GET /auth/v1/admin/users/{id}`. **Single-fetch per user**. At 100 users = 100 admin API calls before any per-user work starts. At 1000 users = 1000.

The workaround is documented (`architecture/cron.md:211-227`) and the upstream cause is real — paginated `listUsers` returns `"Database error finding users"` 500 because of a bad row in `auth.users`. The fallback at the end of the doc notes `/admin/users?filter=<localPart>` works.

**Implications**:
- **Cold-start cost** before any actual work runs.
- **Brand-new user with zero entries is invisible** to the hourly cron until they capture something (`architecture/cron.md:224-226`). A user who signs up at 8:55 and sets `daily_time: 09:00` gets no push that first day. Acceptable today; quietly broken at scale.
- **No retry on the per-id fetch** — a transient 500 on `/admin/users/{id}` skips that user for the whole hour (line 2271-2274 just `continue`s).

**Fix path**:
1. Identify the specific bad row in `auth.users` and clean it. (`Working/` likely has the diagnostic context — out of audit scope, but it is the actual root cause of the workaround.)
2. Once `listUsers` works again, switch back to the paginated path and delete `enumerateUsers`.
3. Until then, add `Promise.allSettled` around the per-id fetches — turn the serial loop into bounded concurrent.

---

### F5 — No idempotency on cron POSTs. Workflow re-run double-fires
**Severity: MEDIUM**

Per `architecture/cron.md:450-453`: *"A workflow re-run fires a duplicate cron pass — Gmail scan dedup catches the email side, but the enrichment / persona decay does extra work."* Confirmed: neither workflow sends an `Idempotency-Key`, neither handler checks one.

The bell-row writes already protect against double daily-prompt push at the `daily_last_sent_at >= 23h` cooldown check (`user-data.ts:2349-2355`) — that's a real per-user idempotency. The expiry log uses a UNIQUE constraint with `expiry_notification_log` returning 409 on duplicate (`user-data.ts:2566-2569`). These are good.

What's NOT idempotent:
- `runPersonaDecayPass` — re-running ages every fact a second time
- `runPersonaWeeklyPass` — re-running writes a second weekly digest
- `enrichAllBrains` — re-running burns Gemini quota
- `runGmailScanAllUsers` — partly idempotent (Gmail message-id dedup), but re-classifies pending threads

**Fix**: pass `Idempotency-Key: ${{ github.run_id }}-${{ github.run_attempt }}` from the workflow. Handler checks an `idempotency_keys` table (already exists per `Audits/archive/billing-audit-2026-05-07.md:124`) — if the key is seen, return the prior response.

---

### F6 — Cron handler logs include user IDs (PII gradient)
**Severity: LOW** — Vercel function logs scope, not GH Actions

`user-data.ts:2331`: `users=${users.length}` — fine.
`user-data.ts:2339`: `[cron/hourly] user=${user.id} skip: no push subscription` — user ID in plaintext.
`user-data.ts:2353`: same — full `user.id` printed.
`user-data.ts:2375`: `[cron/hourly] daily push failed for ${user.id}: ${err.message}`.
`user-data.ts:2616`: `[cron/hourly] expiry block failed for ${user.id}`.

User UUIDs are not directly identifying but are joinable to email via service-role access. Vercel function logs persist 24h on Hobby and longer on Pro. `enrichment-audit.md:276` already flagged similar in cron logs (S-11).

**GH Actions logs are clean** (only the response body summary is echoed) — this is purely a Vercel function-log issue.

**Fix**: redact to a hash or first-8-chars of the UUID. `user.id.slice(0, 8)` is enough to debug while not directly grep-joinable.

---

### F7 — `verifyCronHmac` is dead code
**Severity: LOW** — code hygiene

`api/_lib/cronAuth.ts:3-10`:

```ts
export function verifyCronHmac(header: string, secret: string): boolean {
  const date = new Date().toISOString().slice(0, 10);
  const expected = `HMAC ${crypto.createHmac("sha256", secret).update(date).digest("hex")}`;
  ...
}
```

This is the *real* HMAC-with-replay-window check from `docs/superpowers/specs/2026-04-07-security-hardening-design.md:34` (*"Sign requests with `HMAC-SHA256(CRON_SECRET, ISO-date-string)`. Verifier accepts ±5 minute window..."*). The spec proposed it; the implementation only ever materialised the bearer fallback. `verifyCronHmac` is **never called** — grep returns the export only.

The bearer scheme (`verifyCronBearer`) is fine for the threat model: the secret is in GitHub Actions secrets and Vercel env, neither of which leak through the request path. But the dead HMAC variant is confusing — a future reader assumes the project does HMAC + replay window when it does not.

**Fix**: either delete `verifyCronHmac` or wire it up. Deleting is the surgical pre-launch move; wiring it would also require updating both workflows to compute the daily HMAC and would break on day-boundary edge cases (UTC midnight retry). Delete.

---

## Runtime-budget audit

| Cron | Function ceiling | Real worst-case at current scale | Real worst-case at 1000 users | Risk |
|---|---|---|---|---|
| Daily | 300s (`vercel.json:5`) | Gmail (~30s/user × 5) + enrich (~60s) + persona (~10s) ≈ 220s with 5 active Gmail users | Linearly worse — Gmail is the long pole | Will hit 300s before launch if active Gmail users >10 |
| Hourly | 300s (`vercel.json:5`) | ~10s (low user count, no expiry hits) | F1: serial loop × per-user multi-RTT × expiry fan-out = **very likely >300s** | **HIGH** — see F1 |
| DB backup | 20-min GH timeout, no Vercel function | ~30s (current DB size) | scales with DB size, not user count | Low |
| Weekly roll-up | 5-min GH timeout, no Vercel function | ~10s | n/a (one email regardless) | Low |

The hourly cron is the only one running close to its budget at scale — and it is the only one with the serial-loop antipattern.

---

## Auth posture

```
GH repo secret CRON_SECRET ─┐
                            ├──── matches by definition (single source: ops sets both)
Vercel env CRON_SECRET ─────┘

Workflow:  Authorization: Bearer ${CRON_SECRET}      (cron-daily.yml:40, cron-hourly.yml:34)
Handler:   verifyCronBearer(header, env.CRON_SECRET) (user-data.ts:2306, 2662)
           → constant-time, length-prechecked, try/catch wrapped
           → 401 + "Unauthorized" on miss
           → no information leak
```

- **Single shared secret.** Documented as a known limitation in `architecture/cron.md:53-65`. No per-cron-job secret rotation. Acceptable for a 2-cron, single-tenant, single-secret-manager setup.
- **No replay protection.** A captured request can be replayed forever (until the secret is rotated). Mitigated by HTTPS, GH-hosted runner egress, and GitHub Actions secret encryption. The HMAC+window scheme exists in `verifyCronHmac` (F7) but is dead.
- **No nonce/timestamp.** Same theme — replays would re-fire crons. Practical impact bounded by handler-level idempotency (per F5).
- **Rotation guidance** in `EML/Ops/env-vars.md:106` (*"Rotate on any leak. Coordinate with workflow secret update."*) and `Roadmap/week-1.md:72`.
- **Endpoint is otherwise unauthenticated.** Without `verifyCronBearer` at the top, anyone could POST and trigger the entire fan-out. This is why F1 cannot be "downgraded" — a leaked bearer plus a serial-fan-out function = O(N) DoS amplifier.

---

## Recommendations (priority)

1. **[HIGH] F1** — wrap the hourly per-user loop in `mapWithConcurrency(users, 8, processOneUser)`. Reuse `enrich.ts:1313-1335` or extract to `api/_lib/concurrency.ts`. ~30 min code, ~2h test (load-test against staging with 200 fake users).
2. **[HIGH] F2** — add `if: failure()` Resend notification step to both `cron-daily.yml` and `cron-hourly.yml`. Verify daily cron has actually auto-fired with `gh run list --workflow cron-daily.yml --event schedule`. ~15 min.
3. **[HIGH] F2 part 2** — add a 24h heartbeat check to the weekly roll-up: query GH Actions API for last successful run of cron-daily / cron-hourly, alert in the digest if >25h. ~1h.
4. **[MEDIUM] F3** — wrap web-push and Supabase REST calls inside the hourly loop with `Promise.race(call, sleep(5_000))`. ~20 min.
5. **[MEDIUM] F4** — investigate the broken `auth.users` row that breaks `listUsers`; clean it; restore the paginated path; delete `enumerateUsers`. Out-of-scope for this audit — deserves its own diagnostic session.
6. **[MEDIUM] F5** — pass `Idempotency-Key: ${{ github.run_id }}-${{ github.run_attempt }}` from both workflows; check it in the handler against `idempotency_keys` table. ~30 min.
7. **[LOW] F6** — redact user IDs to first 8 chars in the 5 console.log call sites in `handleCronHourly`. ~5 min.
8. **[LOW] F7** — delete `verifyCronHmac` from `api/_lib/cronAuth.ts`. ~1 min.

---

## Pre-launch checklist

| Item | Status | Owner |
|---|---|---|
| F1 — hourly cron concurrency cap | ❌ blocking at scale | dev |
| F2 — failure alerting (Resend on `if: failure()`) | ❌ blocking — silent failure today | dev |
| F2 — verify schedule trigger has fired ≥1× | ⚠ unverified per architecture/cron.md:144-149 | ops |
| F3 — per-call timeouts in hourly loop | ❌ | dev |
| F4 — `enumerateUsers` workaround → cleaned auth.users → restore paginated | ⚠ deferred | ops |
| F5 — idempotency-key on cron POSTs | ❌ | dev |
| F6 — redact user IDs in cron logs | ❌ | dev |
| F7 — delete dead `verifyCronHmac` | ❌ | dev |
| Confirm `CRON_SECRET` set in Vercel prod (matches GH repo secret) | ⚠ confirm | ops |
| Confirm `GMAIL_CRON_DISABLE` / `ENRICH_CRON_DISABLE` documented in `Ops/env-vars.md` | partial | ops |
| Confirm `gh workflow list` shows both crons enabled | ⚠ confirm | ops |
| Confirm 04:00 UTC daily cron has fired automatically (not just manual) | ⚠ unverified | ops |
| `db-backup.yml` last successful run within 25h | ⚠ confirm | ops |

---

## Method

- Read every `.yml` in `.github/workflows/` matching the cron pattern. Confirmed five scheduled workflows; two of them carry product traffic via `/api/cron/*`.
- Read `api/_lib/cronAuth.ts` end-to-end (24 lines). Identified `verifyCronBearer` (used) and `verifyCronHmac` (dead).
- Read `handleCronHourly` (`user-data.ts:2297-2653`) and `handleCronDaily` (`user-data.ts:2655-2777`) end-to-end. Cross-checked the rewrite chain in `vercel.json:40-41` and the dispatch table in `user-data.ts:137-138`.
- Read `enumerateUsers` (`user-data.ts:2246-2278`), `envFlagEnabled` (line 2207-2210), `insertCronNotification` (line 2217-2240), `patchUserPrefs` (line 2281-2294) — all the supporting helpers.
- Cross-referenced `architecture/cron.md` (full 454 lines) and `Ops/crons.md` (full 92 lines) — the operator-facing docs. Pulled the *"daily cron has not auto-fired yet"* line directly from `architecture/cron.md:144-149`.
- Searched for `mapWithConcurrency` / `Promise.allSettled` / `semaphore` patterns in the cron handlers — confirmed neither exists in either cron handler. Both patterns exist elsewhere in the codebase (`enrich.ts:1313-1335`, `gmailScan.ts:2345-2365`).
- Searched `cron_runs` (heartbeat table) — zero hits. Confirmed F2's "no last-run table" claim.
- Did not run live cron — relies on architecture-doc claim that daily has not auto-fired since 2026-04-28. Pre-launch verification step in the checklist above.
- Did not load-test the hourly handler — F1 is theoretical until reproduced. The math (`O(N × multi-RTT × expiry fan-out)` against 300s ceiling) is solid given the codebase patterns; a real reproduction would need a staging environment with ≥100 fake users with subscriptions and entries with due-dates.

**Audit kicked off by**: user request "evidence-based cron audit" on 2026-05-07.
