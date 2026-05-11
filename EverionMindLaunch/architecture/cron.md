# Workflows + Cron Pipelines

Every scheduled or out-of-band job in the project. All scheduled work
runs from GitHub Actions — Vercel Hobby cron is not used (one-shot,
opaque, was silently failing). This doc is the index of *what fires
when, what it does, and how to verify it ran*.

## TL;DR

- **Eight workflows** in `.github/workflows/`. Five run on a schedule, two
  on push/PR or deployment, one is manual-only.
- The two that do real product work are `cron-daily.yml` and
  `cron-hourly.yml`. Both POST to `/api/cron/{daily,hourly}` with a
  bearer `CRON_SECRET`. The endpoint rewrites land in `handleCronDaily`
  / `handleCronHourly` in `api/user-data.ts`.
- Cron-daily is the heavy fan-out: enrich-all-brains, persona decay (+
  weekly dedup/digest on Sundays), admin summary push + bell row.
- Cron-hourly is the per-user time-aware fan-out: walks every signed-up
  user, checks if "now" matches their stored local-time + IANA timezone
  for daily prompt or weekly nudge, sends push + writes notification.
- Common pattern: each workflow is a thin curl-the-endpoint wrapper.
  Real logic lives in the API handlers (or in `scripts/*` for diagnostics).
  Workflow files exist mainly for scheduling, secret injection, and timeouts.

---

## File map

| Workflow | Schedule | Triggers | Hits |
|---|---|---|---|
| `ci.yml` | — | push to main, PR to main | typecheck + lint + format + test + build |
| `cron-daily.yml` | `0 4 * * *` (04:00 UTC) | schedule + manual | `POST /api/cron/daily` |
| `cron-hourly.yml` | `0 * * * *` (every hour) | schedule + manual | `POST /api/cron/hourly` |
| `db-backup.yml` | `17 3 * * *` (03:17 UTC) | schedule + manual | `pg_dump` → GitHub Release; prunes >30d |
| `e2e.yml` | `30 6 * * 1-5` (06:30 UTC, weekdays) | schedule + post-deploy + manual | Playwright vs `https://everion.smashburgerbar.co.za` |
| `lighthouse.yml` | `0 4 * * 0` (Sun 04:00 UTC) | schedule + manual | Lighthouse audit, uploads HTML+JSON |
| `test-push.yml` | — | manual only | `node scripts/test-push.mjs` (web-push diagnostic) |
| `weekly-roll-up.yml` | `0 6 * * 1` (Mon 06:00 UTC) | schedule + manual | `tsx scripts/weekly-roll-up.ts` |

| API handler | File:line | Rewrite source |
|---|---|---|
| `handleCronDaily` | `api/user-data.ts:1307` | `/api/cron/daily` (vercel.json:35) |
| `handleCronHourly` | `api/user-data.ts:1172` | `/api/cron/hourly` (vercel.json:36) |
| `insertCronNotification` | `api/user-data.ts:1088` | helper used by both |
| `enumerateUsers` | `api/user-data.ts:1118` | broken-listUsers workaround |
| `verifyCronBearer` | `api/_lib/cronAuth.ts` | constant-time `CRON_SECRET` check |

---

## Auth model

All cron-driven endpoints share one secret: `CRON_SECRET`.

```
Authorization: Bearer ${CRON_SECRET}
↓
verifyCronBearer(headerValue, env.CRON_SECRET) → boolean
↓
401 if missing or mismatched
```

The same secret is shared between both cron workflows and the cron
endpoints. Set in GitHub repo secrets and in Vercel project env. No
per-job rotation; rotation = update both sides.

`test-push.yml` and `db-backup.yml` use *different* secrets
(`SUPABASE_SERVICE_ROLE_KEY` for the dump path, VAPID + service-role for
push) because they don't go through the cron endpoint — they hit
Supabase / web-push directly from the runner.

---

## `cron-daily` — heavy fan-out

### Workflow (`cron-daily.yml`)

Single-step curl. `--fail` makes a 500 from the endpoint surface as a
failed Action run (Vercel Hobby cron silently ate errors — that's why we
moved off it). `--max-time 600` matches Vercel's 300s function ceiling
plus headroom.

Schedule pinned at 04:00 UTC (06:00 SAST, the project's home timezone).
Adjust the cron expr if the user relocates.

### Endpoint (`handleCronDaily` at `api/user-data.ts:1307`)

Five tasks, each independently best-effort. One failure doesn't block the rest:

```
1. enrichAllBrains()                        → { brains, processed }
2. runPersonaDecayPass()                    → { scanned, decayed, faded, archived }
3. runPersonaWeeklyPass()  (Sundays only)   → { dedups_proposed, digests_written }
4. webpush admin summary  (gated)           → fire-forget push to admin device
5. insertCronNotification 'cron_summary'    → bell row regardless of VAPID
```

The whole block is wrapped — each task has its own `.catch(e =>
console.error(...))` and a degraded fallback shape so the next task
still runs. Response always returns 200 with a structured summary; the
admin sees per-task counts in the bell card body.

#### Sunday gate

```ts
if (new Date().getUTCDay() === 0) {
  personaWeekly = await runPersonaWeeklyPass();
}
```

UTC day-of-week — matches the cron schedule expression's UTC reference.
Persona weekly pass does dedup proposals + digest write; running it
seven times a week would mean seven digest emails.

#### Admin summary — push + bell row are independent

Two failure modes are deliberately separated:

```
push: requires VAPID env vars + saved push_subscription on admin user
bell: requires only Supabase reachability
```

A user without web-push support (Safari before 16.4, locked-down
browser, expired subscription) still sees the bell card next time they
open the app. Without that split, the daily-cron-fired-but-I-saw-nothing
window was real.

Notif type: `cron_summary`. Renders in the bell as a generic
`AutoMergedCard` (catch-all for non-merge types — see `bell.md`).

### Verification

| Question | How |
|---|---|
| Did it actually fire today? | GitHub Actions → "Daily Cron" → check most recent run timestamp |
| Did it succeed? | Same view — green check; click for the curl response body in logs |
| Did enrich/persona actually do work? | Open the bell on the admin account → look for "Everion · daily cron ✓" with the per-task counts |
| Did it fire but VAPID is broken? | Look for `cron_summary` row in the bell with no device push received → trigger `test-push.yml` to bisect |

The 04:00 UTC schedule has only ever fired once manually since the
workflow landed 2026-04-28. The `workflow_dispatch` (manual) trigger
works; the `schedule:` trigger has yet to actually run on its real slot.
This is **the** open mystery in the cron stack — likely a GitHub-side
schedule registration delay (new workflow files take 5–60 minutes to
register), but worth verifying once we cross the next 04:00 UTC slot.

---

## `cron-hourly` — per-user time-aware

### Workflow (`cron-hourly.yml`)

Same shape as cron-daily. `--max-time 300` because no single hourly task
should take this long.

### Endpoint (`handleCronHourly` at `api/user-data.ts:1172`)

```
1. Verify CRON_SECRET
2. Skip entirely if VAPID not set (no push possible)
3. enumerateUsers('cron/hourly') → ALL signed-up users
4. For each user:
   - Read user_metadata.push_subscription + notification_prefs
   - daily_enabled?  → check tz + targetHour + 23h cooldown
                     → push + insertCronNotification('daily_prompt') + patchUserPrefs
   - nudge_enabled?  → check tz + targetDay + targetHour + 6d cooldown
                     → push + insertCronNotification('weekly_nudge') + patchUserPrefs
5. Return { daily: {sent,skipped,errors}, nudge: {sent,skipped,errors} }
```

#### Time match logic

```ts
localHour(tz, now) === targetHour && hoursSince >= 23
```

Two-clause check:
- **Hour match** in the user's IANA timezone (e.g. `Africa/Johannesburg`)
- **Cooldown** since `daily_last_sent_at` — prevents double-fires across
  DST boundaries (one local hour can occur twice on fall-back days),
  retries (cron-hourly fires every hour but the user only matches one),
  and timezone changes mid-day.

Weekly nudge adds a third clause: `localWeekday(tz, now) === targetDay`
plus a 6-day cooldown.

`localHour` and `localWeekday` use `Intl.DateTimeFormat` with
`hour: 'numeric', hour12: false` / `weekday: 'long'` against the user's
stored `daily_timezone` / `nudge_timezone`. Default to `UTC` if not set.

#### Subscription auto-prune

```ts
if (err.statusCode === 410 || err.statusCode === 404) {
  const { push_subscription: _rm, ...rest } = meta;
  await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT', body: JSON.stringify({ user_metadata: rest }),
  });
}
```

410 (Gone) and 404 (Not Found) from web-push mean the subscription is
permanently dead — the push service revoked it. Strip it from
`user_metadata` so we don't keep retrying every hour. Other error codes
(429, 500, network) leave the subscription intact for the next attempt.

#### `enumerateUsers` — workaround for broken listUsers

The Supabase admin `listUsers` paginated endpoint is broken on this
project (returns "Database error finding users" 500). The paginated
`SELECT` trips on a bad row in `auth.users`. Two routes that work:

1. Pull distinct `user_id` from `public.entries`
2. Single-fetch each via `/admin/users/{id}`

`enumerateUsers(tag)` does exactly that, with a 1000-row pagination loop
on `public.entries` and per-id fetches. Same workaround used in
`scripts/test-push.mjs:73` for the same reason.

Side effect: a brand-new user with **zero entries** is invisible to the
hourly cron until they capture something. Acceptable today; if it ever
matters, the fallback route is `/admin/users?filter=<localPart>` which
also works.

---

## Shared helper: `insertCronNotification`

Single helper at `api/user-data.ts:1088`. Mirrors a cron-driven push into
the bell so the admin / user sees it even if the device push didn't fire
or got missed. Three call sites:

| Caller | Notif type | Triggered by |
|---|---|---|
| `handleCronDaily` admin summary | `cron_summary` | Daily 04:00 UTC, gated by `admin_summary_enabled` |
| `handleCronHourly` daily prompt | `daily_prompt` | Top of every user's chosen local hour |
| `handleCronHourly` weekly nudge | `weekly_nudge` | Top of every user's chosen weekly slot |

Plus `scripts/test-push.mjs` writes the same row with `type='test_push'`
when the diagnostic workflow fires. All four render in the bell as
`AutoMergedCard` (catch-all). See `Docs/Components/bell.md`.

Failure mode: best-effort. A failed insert logs but doesn't fail the
push or the cron task — the device push is the primary, the bell row is
the safety net.

---

## `db-backup` — daily pg_dump

Stop-gap until Supabase Pro is on (Pro gives real automated backups via
the dashboard).

```
03:17 UTC daily
↓
Install postgresql-client-17 (matches Supabase server version)
↓
pg_dump --schema=public --no-owner --no-privileges --no-comments
↓
gzip -9 > db-YYYY-MM-DD.sql.gz
↓
gh release create backup-YYYY-MM-DD --title "DB backup YYYY-MM-DD"
↓
Prune releases older than 30 days
```

| Detail | Why |
|---|---|
| `03:17` not `03:00` | Quiet hours globally; offset to avoid overlap with cron-daily (04:00) and cron-hourly's heaviest tick |
| `--schema=public` only | `auth` schema is Supabase-managed; not safe to restore from a logical dump |
| `postgresql-client-17` | Server is Postgres 17.6 — Ubuntu's default ships an older minor that emits SQL not parseable by 17 |
| Session pooler URL (port 5432) | Transaction pooler (6543) doesn't support `pg_dump` |
| Releases as storage | Private repo + releases = unlimited storage. ~5–10 MB compressed per dump |
| 30-day rolling window | Bounded working set; if you need older you reach for Supabase Pro point-in-time recovery |
| `cleanup-tag` on delete | `gh release delete --cleanup-tag` removes both the release AND the git tag — without it, dangling tags accumulate |

`SUPABASE_DB_URL` secret format must be the session pooler — the
workflow comment spells out the full template.

### Restore

See `RUNBOOK.md`. Workflow doesn't restore — only dumps.

---

## `e2e` — Playwright vs production

Three triggers, one job. The `if:` filter is the load-bearing line:

```yaml
if: |
  (github.event_name == 'deployment_status'
    && github.event.deployment_status.state == 'success'
    && github.event.deployment.environment == 'Production') ||
  github.event_name == 'schedule' ||
  github.event_name == 'workflow_dispatch'
```

Two reasons for the production-only filter:

1. **Vercel preview URLs return 401** — Deployment Protection is on for
   non-prod. Playwright can't authenticate past the SSO gate. (See the
   `vercel-deployment-protection` memory entry.)
2. **`deployment_status` fires repeatedly** for pending/in_progress as
   well as success — without filtering by `state == 'success'` we'd run
   tests against half-deployed builds.

### URL resolution

The workflow ignores `event.deployment_status.target_url` even on prod
deploys because Vercel reports the underlying `*.vercel.app` URL — which
**also** has Deployment Protection. The custom domain
`https://everion.smashburgerbar.co.za` aliases to the same deploy and is
unprotected. Hardcoded as the default URL.

### Warm-up

Three pre-Playwright curl rounds against `/`, `/api/vault`, and
`/api/brains` so cold lambdas + cold CDN are hydrated before tests
start. A fresh deploy can take 20–30s on the first request.

### Schedule path

`30 6 * * 1-5` — 06:30 UTC, weekdays only. Catches drift even when no
deploys are happening (Supabase / Gemini / DNS changes).

---

## `lighthouse` — weekly synthetic audit

`0 4 * * 0` — Sunday 04:00 UTC, low-traffic globally. Doesn't gate
deploys; Lighthouse scores wobble ±5–10 points run-to-run on shared
runners. Reports upload as artifacts (HTML + JSON, mobile + desktop) for
trend tracking. 90-day retention.

`include-hidden-files: true` is required because the report dir is
`.lighthouse/` (dot-prefixed) — default `actions/upload-artifact`
filters out hidden files and would silently drop everything.

---

## `weekly-roll-up` — Monday morning summary

Composes one email summarising Sentry, PostHog, Vercel, Lighthouse, and
e2e. Each section degrades gracefully when its secret is missing — runs
usefully even before all integrations are wired.

`scripts/weekly-roll-up.ts` is the actual logic. Uses `tsx` (TypeScript
runner, no build step). Sends via Resend.

`dry_run` input: log the composed email body to stdout instead of
sending. Use for first-run shape verification before flipping to live.

---

## `test-push` — manual diagnostic

Bypasses Vercel entirely. `scripts/test-push.mjs` runs `web-push`
directly from the GitHub Actions runner with VAPID secrets +
service-role key, looks up a target user, sends one push, mirrors a row
into `notifications` so the bell also lights up.

Use when: daily cron reports `push.errors=0 AND push.sent=0` (i.e.
nothing happened), and you need to know whether VAPID/subscription are
the broken link or whether Vercel's path is.

Trigger: `gh workflow run test-push.yml [-f title=… -f body=…
-f target_email=…]`

---

## `ci` — pre-merge gate

```
push to main + PR to main
↓
typecheck → lint → format:check → test → build
```

Filtered to `pull_request: branches: [main]` because the long-running
audit PR (#51, head=main → base=audit-base) would re-fire CI on every
push to main without it, doubling email noise. Dependabot PRs target
main and are still covered.

`VITE_SUPABASE_URL: https://placeholder.supabase.co` — `src/lib/supabase.ts`
evaluates `new URL(VITE_SUPABASE_URL)` at module load, which throws when
imported by tests without env. Real values aren't needed (tests mock
`@supabase/*`) but the URL must parse.

---

## Recent changes worth knowing

- **2026-04-29**: `insertCronNotification` extracted as a shared helper.
  All three cron-driven push sites now also write a bell row, so users
  see "the cron ran" even when the device push failed or wasn't
  delivered.
- **2026-04-28**: Migrated off Vercel Hobby cron. Vercel Hobby gives one
  static schedule, no logs, no retries. Replaced with GitHub Actions
  workflows hitting the same endpoints — full logs, configurable
  schedules, manual triggers, retries via re-run.
- **2026-04-28**: `db-backup.yml` landed. Daily pg_dump as
  release-stored backup; 30-day rolling.
- **`weekly-roll-up.yml`**: new — first run requires `dry_run=true`
  manual trigger to eyeball the composed email before flipping live.
- Cron-hourly's subscription auto-prune (410/404) — added to stop the
  hourly run from forever-retrying dead subscriptions.

---

## Known limitations / future work

- **Cron-daily's 04:00 UTC schedule has not yet auto-fired**. Only
  `workflow_dispatch` runs have happened. Likely GitHub-side schedule
  registration delay; verify after the next 04:00 UTC slot. If it still
  doesn't fire, check the workflow's Action permissions (Settings →
  Actions → General → Workflow permissions).
- **No retry on cron failures**. A 500 from the endpoint fails the
  workflow run; nothing automatically re-runs. Manual trigger via
  `gh workflow run cron-daily.yml` is the recovery path.
- **`enumerateUsers` is O(N)** — fetches every user one-by-one via
  `/admin/users/{id}`. Fine for tens of users; will need pagination /
  batching at hundreds. The broken `listUsers` is the upstream bug; if
  Supabase ever fixes it, restore the paginated path.
- **`SUPABASE_DB_URL` is in plain GitHub Secrets** — single-key
  compromise = full read of public schema. Rotation is manual. Acceptable
  given the schema doesn't contain raw user data unencrypted (vault
  entries are AES-GCM, push subscriptions are stripped from exports —
  see `api/user-data.ts:757`'s `strip` config).
- **No alerting on cron failures**. A failed Action run goes to GitHub's
  email list (default: workflow author). No PagerDuty / Slack hook. Add
  one before any user ever depends on the daily prompt firing.
- **e2e against prod** means a flaky test or transient outage marks the
  workflow red even when no code changed. Acceptable today (the project
  has one operator, who reads the inbox); won't scale.
- **Lighthouse trend** is artifact-only — no dashboard. Eyeball-based.
  PostHog could ingest the JSON if trend tracking ever matters.
- **Cron-hourly does not wake users in time-zones GitHub doesn't have an
  on-the-hour run for**. The schedule fires at the top of every UTC
  hour. A user in a 30-minute-offset timezone (Iran, India, parts of
  Australia) gets matched to whichever UTC hour their `daily_time` falls
  inside — close enough for "9am-ish" but not for "9:00 sharp." If a
  user sets `daily_time: 09:30 IST`, they'll get the push at the 09:00
  IST tick (UTC 03:30 fires at 03:00 UTC) — 30 minutes early.
- **No idempotency token on cron POSTs**. A workflow re-run fires a
  duplicate cron pass — enrichment / persona decay does extra work. Worth
  pinning if cron re-runs become routine.
