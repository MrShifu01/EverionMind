# Audit Schedule — Pre-launch + Beta + Recurring

> Day-by-day audit calendar for Everion Mind. Aligns with `EML/LAUNCH_CHECKLIST.md` (avoids stacking audits on heavy operational days). Companion file `audit-schedule.json` is importable into Everion via the bulk-import flow; this document lives in EML so the schedule is itself git-tracked.
>
> **One entry per day** in Everion Schedule. Each entry's content lists the audits to run that day. Full audit specs (scope, signals, invariants) live in `EML/Audits/AUDIT-CATALOGUE.md`.

## Phases

| Phase | Window | Cadence | Audit count |
|---|---|---|---|
| Pre-launch | 2026-05-08 → 2026-05-30 (23 days) | 1–2 audits/day, intensive | ~32 audits |
| Beta phase | 2026-05-31 → 2026-07-01 (32 days) | 1 audit/day (5 days/week) | ~28 audits |
| Recurring (post-launch) | 2026-07-02 → 2026-08-31 (60 days) | weekly Mon, biweekly Wed, monthly 1st | ~25 audits |
| **Total scheduled** | 2026-05-08 → 2026-08-31 (115 days) | — | **85 days with audits** |

## Pre-launch (intensive · 2026-05-08 → 2026-05-30)

Goal: hit every never-run audit at least once before closed beta opens. Cross-referenced against `LAUNCH_CHECKLIST.md` so audit days match the launch-eve cadence.

| Date | Day | Audits | Why this day |
|---|---|---|---|
| 2026-05-08 | Fri | rate-limiter, dependencies | Light — domain cutover dominates |
| 2026-05-09 | Sat | retrieval | Deep audit, weekend headspace |
| 2026-05-10 | Sun | enrichment | Deep audit, weekend headspace |
| 2026-05-11 | Mon | mcp-server, ai-provider-abstraction | Brain Feed v0 work alongside |
| 2026-05-12 | Tue | webhook | Verify before LS+RC live launch Thu |
| 2026-05-13 | Wed | idempotency, error-boundary | Streak counter day |
| 2026-05-14 | Thu | gmail-sync | LS+RC live = need email auth audit |
| 2026-05-15 | Fri | accessibility | Real-device QA Android matrix |
| 2026-05-16 | Sat | brand-assets, copy-tone | Pre-asset-creation pass |
| 2026-05-17 | Sun | landing | Pre-Play-Store asset day |
| 2026-05-18 | Mon | seo, privacy-legal | Play Console listing data-safety form |
| 2026-05-19 | Tue | ci-cd | AAB upload day, verify pipeline |
| 2026-05-20 | Wed | performance | RC pre-launch report = perf must be green |
| 2026-05-21 | Thu | production-audit (re-run) | **HARD DEADLINE: prod review submitted** |
| 2026-05-22 | Fri | infrastructure | Lighthouse green + E2E pass |
| 2026-05-23 | Sat | resilience, cookie-storage | Real-device QA cross-browser |
| 2026-05-24 | Sun | email-deliverability, telemetry-funnel | mail-tester 10/10 deadline |
| 2026-05-25 | Mon | empty-states | LS+Android sub cancellation E2E |
| 2026-05-26 | Tue | audit-log, time-tz | Backup restore rehearsal |
| 2026-05-27 | Wed | brain-sharing, account-delete | Pre-launch audit doc + legal review |
| 2026-05-28 | Thu | file-extraction, voice-transcription | Final polish |
| 2026-05-29 | Fri | smash-os-audit (final omnibus) | Launch eve — comprehensive re-pass |
| 2026-05-30 | Sat | production-audit (**LAUNCH GATE**) | Closed beta opens — final go/no-go |

## Beta phase (1 audit/day, 5 days/week · 2026-05-31 → 2026-07-01)

Goal: regression-watch the highest-risk pipelines once real users hit them. Weekends rest unless a P0 needs verification.

| Date | Day | Audit |
|---|---|---|
| 2026-05-31 | Sat | (rest — just launched) |
| 2026-06-01 | Sun | (rest) |
| 2026-06-02 | Mon | observability (alerts tuning with real traffic) |
| 2026-06-03 | Tue | capture-pipeline (regression check) |
| 2026-06-04 | Wed | retrieval (regression check) |
| 2026-06-05 | Thu | vault-unlock (verify F2 sessionStorage fix) |
| 2026-06-06 | Fri | billing (verify F1 host-header fix) |
| 2026-06-07 | Sat | pii-leak (verify F1 user.email fix) |
| 2026-06-09 | Mon | enrichment |
| 2026-06-10 | Tue | gmail-sync |
| 2026-06-11 | Wed | ai-provider-abstraction |
| 2026-06-12 | Thu | rate-limiter |
| 2026-06-13 | Fri | cost-quota |
| 2026-06-14 | Sat | vector-index, embedding-drift |
| 2026-06-16 | Mon | persona-facts |
| 2026-06-17 | Tue | concept-graph |
| 2026-06-18 | Wed | trash-soft-delete |
| 2026-06-19 | Thu | audit-log |
| 2026-06-20 | Fri | telemetry-funnel |
| 2026-06-21 | Sat | onboarding (real-user funnel) |
| 2026-06-23 | Mon | capture-pipeline (regression 2) |
| 2026-06-24 | Tue | retrieval (regression 2) |
| 2026-06-25 | Wed | tags |
| 2026-06-26 | Thu | important-memories |
| 2026-06-27 | Fri | realtime |
| 2026-06-28 | Sat | feature-flag, mobile-native |
| 2026-06-30 | Mon | cost-quota (monthly checkpoint) |
| 2026-07-01 | Tue | smash-os-audit (month-1 omnibus) |

## Recurring (post-launch · 2026-07-02 → 2026-08-31)

Goal: sustainable cadence. Weekly observability + capture/retrieval regression + monthly omnibus + quarterly deep cuts.

| Date | Day | Audit | Type |
|---|---|---|---|
| 2026-07-07 | Mon | observability | weekly |
| 2026-07-09 | Wed | capture-pipeline | weekly regression |
| 2026-07-14 | Mon | observability, dependencies | weekly |
| 2026-07-16 | Wed | retrieval | weekly regression |
| 2026-07-21 | Mon | observability | weekly |
| 2026-07-23 | Wed | pii-leak | weekly regression |
| 2026-07-28 | Mon | observability, cost-quota | weekly |
| 2026-07-30 | Wed | capture-pipeline | weekly regression |
| 2026-08-01 | Fri | **monthly omnibus**: smash-os-audit | monthly |
| 2026-08-04 | Mon | observability, frontend-architecture | weekly + monthly |
| 2026-08-06 | Wed | db | monthly |
| 2026-08-08 | Fri | performance, accessibility | monthly |
| 2026-08-11 | Mon | observability | weekly |
| 2026-08-13 | Wed | retrieval | weekly regression |
| 2026-08-15 | Fri | mcp, ai-provider | monthly |
| 2026-08-18 | Mon | observability, persona-facts | weekly + monthly |
| 2026-08-20 | Wed | capture-pipeline | weekly regression |
| 2026-08-22 | Fri | telemetry-funnel | monthly |
| 2026-08-25 | Mon | observability, audit-log | weekly + monthly |
| 2026-08-27 | Wed | retrieval | weekly regression |
| 2026-08-29 | Fri | brain-sharing (quarterly), copy-tone, brand-assets | quarterly |
| 2026-08-31 | Sun | smash-os-audit (month-2 omnibus retro) | monthly |

## How to use

### Option A — Everion MCP (recommended)

I create one entry per audit-day in your Everion via `mcp__everionmind__create_entry`. Each entry has `type=task`, content begins with `Scheduled for YYYY-MM-DD.` so the natural-language parser populates `metadata.scheduled_for`, and tags include `["audit", "<phase>"]`. Schedule view will show the day's audits when you tap into the day.

### Option B — JSON bulk import

`audit-schedule.json` (sibling file) is a flat array of `{ title, type, content, tags }` objects ready to feed to `/api/capture` or the Everion bulk-import flow. Same shape as Option A.

### Option C — manual

Read this file. Sigh. Open Everion. Type each one in by hand. (Don't.)

## Maintenance rule

If you skip a day, mark the task done with a note saying why (real launch fire, PTO, whatever). Don't reschedule — the next slot for that audit is the next monthly/quarterly cycle. Skipping is fine; quietly losing an audit is what we don't want.

When an audit is run, the produced report (`EML/Audits/<slug>-YYYY-MM-DD.md`) becomes the artefact. The Everion task is just the trigger.

---

**File generated**: 2026-05-07.
**Companion**: `audit-schedule.json` (Everion-importable).
**Source spec**: `EML/Audits/AUDIT-CATALOGUE.md`.
