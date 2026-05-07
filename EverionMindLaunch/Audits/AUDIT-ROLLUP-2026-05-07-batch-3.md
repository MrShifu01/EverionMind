# Audit Rollup — Batch 3 (2026-05-07)

> Findings from the third-batch audits — onboarding, gmail-sync, performance, resilience, ai-provider, brain-sharing, admin-tab, webhook, accessibility, dependencies, pwa-offline, cron. Pending merge into `TODO-AUDIT-FIXES.md` after batch-1 + batch-2 close.
>
> **Status legend:** [ ] open · [x] done · [~] in progress · [-] deferred (post-launch).
> **Source link:** `{audit}` → `EML/Audits/{audit}-audit-2026-05-07.md`

---

## Roll-up by audit

| Audit | Verdict | HIGH | MED | LOW | INFO | File |
|---|---|---:|---:|---:|---:|---|
| onboarding | aha < 60s, 2 silent-loss bugs | 2 | 4 | 3 | — | `onboarding-audit-2026-05-07.md` |
| gmail-sync | architecture right | 2 | 2 | 2 | — | `gmail-sync-audit-2026-05-07.md` |
| performance | bundle 188 KB gz, no blockers | 0 | 2 | 6 | — | `performance-audit-2026-05-07.md` |
| resilience | ~95 unguarded fetches | 3 | 5 | 3 | — | `resilience-audit-2026-05-07.md` |
| ai-provider-abstraction | parallel abstractions, neither complete | 2 | 2 | 2 | — | `ai-provider-abstraction-audit-2026-05-07.md` |
| brain-sharing | architecture right | 1 | 1 | 3 | — | `brain-sharing-audit-2026-05-07.md` |
| admin-tab | F4 closed; drift-hazard remains | 1 | 3 | 4 | — | `admin-tab-audit-2026-05-07.md` |
| webhook | LS+RC only; idempotency-burn race | 4 | 4 | 4 | — | `webhook-audit-2026-05-07.md` |
| accessibility | 78 % WCAG 2.2 AA | 0 | 3 | 5 | — | `accessibility-audit-2026-05-07.md` |
| dependencies | 0 vulns; RC SDK 2 majors behind | 0 | 1 | 5 | 1 | `dependencies-audit-2026-05-07.md` |
| pwa-offline | precache 2.64 MB; manifest mismatch | 2 | 1 | 2 | — | `pwa-offline-audit-2026-05-07.md` |
| cron | auth right; serial loop blows 300s | 2 | 3 | 2 | — | `cron-audit-2026-05-07.md` |
| **Totals** | — | **19** | **31** | **41** | **1** | 92 findings |

---

## Phase C0 — Fix today (one-line, all HIGH) · ~1 hour

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| C0.1 | HIGH | [ ] Move `markWebhookEventSeen` AFTER successful `writePlanChange`. Today: idempotency key burned BEFORE the write — failed write = retry sees `firstTime:false`, returns 200, **tier never lands; user pays, shows free** | `api/user-data.ts` (LS + RC handlers) | webhook F3 |
| C0.2 | HIGH | [ ] `handleTriggerTestPush` — replace `process.env.ADMIN_EMAIL ?? VITE_ADMIN_EMAIL` equality check with `await isAdminUser(user.id)`. `VITE_ADMIN_EMAIL` fallback risks leaking the admin email into the prod JS bundle | `api/user-data.ts:2118-2121` | admin-tab F1 |
| C0.3 | HIGH | [ ] Migration 084 — add `accept_hits` and `reject_hits` to `match_gmail_pattern` RPC return table. Today `recordPatternDecision` reads `match.accept_hits + weight` = `NaN`; pattern hit counters corrupt on every accept/reject | `supabase/migrations/080_gmail_pattern_rules.sql:71-80` (new migration) | gmail-sync F1 |
| C0.4 | HIGH | [ ] Swap `beforeunload` listener for `pagehide` in `useDataLayer.ts:342`. `beforeunload` kills BFCache on iOS Safari (back-button-from-Gmail = full reload, not instant restore) | `src/hooks/useDataLayer.ts:342` | pwa-offline F2 |

---

## Phase C1 — Pre-launch HIGH blockers

### C1A — resilience hardening (~3.5h, biggest lift)

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| C1A.1 | HIGH | [ ] Wrap ~95 Supabase REST fetches with `AbortSignal.timeout(8_000)`. Helper: extend `sbHeaders.ts` to include a default `signal`. Today one PostgREST hang freezes the function for 300s | `api/**/*.ts` (~95 sites) | resilience F1 |
| C1A.2 | HIGH | [ ] Wrap 14 third-party fetches with `AbortSignal.timeout(...)`: LS + RC + Resend + Anthropic + Google OAuth + Microsoft OAuth + Whisper + Groq + Upstash health probes | various | resilience F2 |
| C1A.3 | HIGH | [ ] `/api/health` — wrap each probe in `Promise.allSettled` with per-probe `AbortSignal.timeout(2_000)`. Add `Retry-After: 30` on 503. Today serial probes time out external monitor before the endpoint responds | `api/v1.ts` (health handler) | resilience F4 |
| C1A.4 | HIGH | [ ] Zero AbortController coverage on every Gmail-API `fetch()` in `gmailScan.ts`. One stalled TCP connection blocks one of three concurrent cron slots for 5 minutes. Compare `googleAiFetch` which DOES wrap with `AbortSignal.timeout(15_000)` | `api/_lib/gmailScan.ts` (token refresh, message list, history, threads, attachments) | gmail-sync F2 |

### C1B — onboarding silent-loss

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| C1B.1 | HIGH | [ ] `OnboardingModal.handleSave` — POST directly to `/api/capture`, missing `trackFirstCapture` + `trackCaptureMethod`. Cleanest activation path goes untracked. 2-line fix | `src/components/OnboardingModal.tsx:72-95` (or equivalent) | onboarding F1 |
| C1B.2 | HIGH | [ ] `OnboardingModal` — no `r.ok` check, no abort timeout, no error surface. Failures fall through to `markOnboarded()` and `onComplete()`, silently losing the user's first capture and disabling the modal forever on that device | `src/components/OnboardingModal.tsx:72-95` | onboarding F2/F4 |

### C1C — webhooks (beyond idempotency-burn)

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| C1C.1 | HIGH | [ ] `webhookIdempotency.ts` — fail CLOSED on Upstash outage (currently fails OPEN). Mirror `rateLimit.ts` posture. Inconsistent fail-mode = duplicate side-effects on every retry during outage | `api/_lib/webhookIdempotency.ts` | webhook F2 |
| C1C.2 | HIGH | [ ] Doc drift — billing-audit F5 referenced a `webhook_events` Postgres table; idempotency is Upstash Redis only with 24h TTL. Bump to 7d retention; update the audit-doc reference. **Fix:** raise TTL in `webhookIdempotency.ts`; correct billing-audit | `api/_lib/webhookIdempotency.ts` + audit doc | webhook F1 |

### C1D — ai-provider abstraction

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| C1D.1 | HIGH | [ ] BYOK keys (`anthropic_key`, `openai_key`, `gemini_key`, `openrouter_key`) stored plaintext in `user_ai_settings`, written from browser via anon key. Application-level encrypt with `OAUTH_TOKEN_ENCRYPTION_KEY` envelope. Match vault entry handling | `api/user-data.ts` (settings handler) + `user_ai_settings` schema | ai-provider F1 |
| C1D.2 | HIGH | [ ] Quota gate (`opts.quota` on `callAI`) used by 1 of 4 `callAI` callsites. 19 non-`callAI` callsites (persona extraction, gmail classifier, distill family, retrieval rebuild, feedback, `/api/llm` chat + split) run unmetered → pro/max users uncapped at the only gate that exists | many call sites | ai-provider F2 |

### C1E — brain-sharing

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| C1E.1 | HIGH | [ ] `requireBrainAccess` collapses viewer+member into one role. ~13 callsites in `capture.ts` / `transfer.ts` / `feedback.ts` / `mergeEntries.ts` rely on RLS to reject viewer writes. Switch to `requireBrainRole(["owner","member"])` so errors surface as 403, not 502 | `api/capture.ts` · `api/transfer.ts` · `api/feedback.ts` · `api/_lib/mergeEntries.ts` | brain-sharing F1 |

### C1F — cron concurrency

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| C1F.1 | HIGH | [ ] Hourly cron is fully serial (`for-of` in `user-data.ts:2334`). At 1000+ users the per-user multi-RTT loop + expiry fan-out blows 300s `maxDuration`. Use `mapWithConcurrency` (already exists at `enrich.ts:1313-1335`) with `HOURLY_CONCURRENCY=8` | `api/user-data.ts:2334` (cron-hourly handler) | cron F1 |
| C1F.2 | HIGH | [ ] No cron failure alerting. No `if: failure()` step in GH Actions, no Sentry hook. Per `architecture/cron.md:144-149` the daily cron schedule trigger has never proven auto-fired since 2026-04-28 | `.github/workflows/cron-{daily,hourly}.yml` | cron F2 |

### C1G — pwa manifest

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| C1G.1 | HIGH | [ ] Manifest mismatch: live `manifest.webmanifest` lacks maskable + apple-touch icons; `public/manifest.json` exists but is never loaded. Move maskable + apple-touch into `vite.config.js` PWA plugin and delete `public/manifest.json` | `vite.config.js` + `public/manifest.json` | pwa-offline F1 |

---

## Phase C2 — Pre-launch MEDIUM hardening

| # | Severity | Fix | Source |
|---|---|---|---|
| C2.1 | MEDIUM | [ ] PostHog event-taxonomy contract drift — 10 events documented in `EML/Analytics/event-taxonomy.md` (`first_memory_created`, `first_ai_answer_viewed`, `vault_setup_completed`, etc.) don't fire in code. Wire them in `src/lib/events.ts` OR delete the doc lines | onboarding F3 |
| C2.2 | MEDIUM | [ ] `buildPrompt` interpolates email `From:` / `Subject:` / `Body:` raw into the classifier prompt with no `<untrusted_email>` delimiter. Compare `distillGmail` which DOES wrap. Same fix in `deepExtractEntry` | gmail-sync F3 |
| C2.3 | MEDIUM | [ ] Add `mammoth` (101 KB gz) to SW `globIgnores`. Currently precaches a `.docx` parser for every first visitor who'll never use it | perf F1, `vite.config.js:140` |
| C2.4 | MEDIUM | [ ] Self-host Google Fonts via `@fontsource-variable/*` — removes one cross-origin RTT on first paint | perf F2 |
| C2.5 | MEDIUM | [ ] Resilience: 5 MED across mixed-fetch `Promise.all` patterns and missing retry-budget logging — see source audit | resilience F5–F9 |
| C2.6 | MEDIUM | [ ] Provider failover chain — `callAI` tries one provider, returns `""` after retry exhaustion. Add Anthropic / OpenAI fallback for premium tiers; surface explicit `provider_unavailable` error for free | ai-provider F4 |
| C2.7 | MEDIUM | [ ] Two parallel LLM abstractions (`callAI` vs `_lib/providers/*`) with overlapping responsibilities. Pick one as canonical; deprecate the other | ai-provider F3 |
| C2.8 | MEDIUM | [ ] Brain-sharing: 60/min rate limit applies to invite + accept + members combined. Split invite to 10/min for spam mitigation | brain-sharing F3 |
| C2.9 | MEDIUM | [ ] `handleAdminSetTier` writes audit_log AFTER PATCH and fire-and-forget. Crash window between the two = tier change with no audit row. Write pending row BEFORE PATCH, or wrap in a Postgres function | admin-tab F2 |
| C2.10 | MEDIUM | [ ] Four persona/gmail mutating handlers (`audit-persona`, `wipe-persona-extracted`, `backfill-persona`, `revert-persona-backfill`) have `requireBrainAccess` only — no `isAdminUser` gate, no audit_log. `wipe-persona-extracted` is a bulk hard-delete with zero trail | admin-tab F3, `api/entries.ts:882-931` |
| C2.11 | MEDIUM | [ ] Webhook RC fallback id collapses distinct events when both `event.id` AND `event_timestamp_ms` are missing. Hash full body in fallback | webhook F4 |
| C2.12 | MEDIUM | [ ] Webhook LS fallback to `data.id` permanently locks subscriptions — once a subscription's data.id idempotency key burns, future legitimate events for that sub are ignored | webhook F6 |
| C2.13 | MEDIUM | [ ] `--ember`, `--ink-faint`, `--ink-ghost` drop below 4.5:1 on `--surface-high`; `--moss` (3.91:1) and `--blood` (3.52:1) fail body-text contrast on `--bg`. Re-tune tokens or restrict usage to ≥18pt | a11y F4 |
| C2.14 | MEDIUM | [ ] Two `<div onClick>` patches break keyboard parity in `TodoEditPopover.tsx` and `GmailStagingInbox.tsx`. Convert to `<button>` | a11y F2 |
| C2.15 | MEDIUM | [ ] `outline:none` on `LoginScreen.tsx` inputs without `:focus-visible` ring — keyboard users lose focus indicator | a11y F3 |
| C2.16 | MEDIUM | [ ] `@revenuecat/purchases-capacitor 11.3.2 → 13.1.0`. 2 majors behind on billing-critical SDK. Schedule before launch with RC sandbox tests | deps F7 |
| C2.17 | MEDIUM | [ ] `beforeinstallprompt` not captured — install prompt UX missing. Apple-touch-startup-image missing for iOS standalone | pwa-offline F3 |
| C2.18 | MEDIUM | [ ] No per-iteration timeout on web-push / Supabase REST inside the hourly cron loop. Wrap each in `AbortSignal.timeout(5000)` | cron F3 |
| C2.19 | MEDIUM | [ ] Cron daily logs leak user IDs in handler-side Vercel logs. Strip via structured-log redaction | cron F6 |

---

## Phase C3 — LOW + nits (post-launch acceptable)

| # | Severity | Fix | Source |
|---|---|---|---|
| C3.1 | LOW | [ ] 9 design-family stylesheets `@import`-ed in `src/index.css:8-16`; only one active. Lazy-load inactive families saves ~22 KB gz | perf F3 |
| C3.2 | LOW | [ ] jszip eager-graph leak risk; posthog + sentry consent-load cost (~200 KB gz); no font preload; anonymous Landing 2-RTT waterfall | perf F4–F8 |
| C3.3 | LOW | [ ] Resilience LOW × 3 — see source audit for the trio | resilience F9–F11 |
| C3.4 | LOW | [ ] `ai-provider`: no token-cost telemetry; partial model-registry centralisation (5–9 files) | ai-provider F5–F7 |
| C3.5 | LOW | [ ] Brain invites: token equality at DB layer only (no plaintext compare). Note for future HMAC migration | brain-sharing F2 |
| C3.6 | LOW | [ ] Brain invites: expired invites never pruned; pending-list query missing `expires_at>now()` filter | brain-sharing F4 |
| C3.7 | LOW | [ ] `entry_shares` rows survive source-entry soft-delete — minor info leak + UX bug | brain-sharing F5 |
| C3.8 | LOW | [ ] Admin: `handleHealth` accepts every HTTP method with `rateLimit:false`; `handleSentryIssues` not admin-gated; eight `entries.ts` admin handlers skip audit_log | admin-tab F4–F7 |
| C3.9 | LOW | [ ] Webhook: no audit_log on webhook tier change (carry billing F6); no dead-letter / retry-budget tracking | webhook F7, F11 |
| C3.10 | LOW | [ ] A11y: logo `<img alt="">` may leave it unnamed on mobile shell (`MobileHeader.tsx:79`, `MobileMoreMenu.tsx:179`, `LoadingScreen.tsx:108`) — add accessible label | a11y F1 |
| C3.11 | LOW | [ ] A11y: 5 LOW (heading order in 2 views, missing skip-to-search on memory grid, etc.) — see source audit | a11y F5 et al. |
| C3.12 | LOW | [ ] Deps: 17 deprecated transitives (8 prod, 9 dev). Add `rimraf`/`glob`/`inflight` to `overrides` to kill 6 of 8 prod-tree deprecations | deps F1 |
| C3.13 | LOW | [ ] `posthog-js@1.372.1 → 1.372.9` patch bump avoids dragging Node OpenTelemetry SDK transitives | deps F2 |
| C3.14 | LOW | [ ] Deps: 5 LOW + 1 INFO — see source audit | deps F3–F8 |
| C3.15 | LOW | [ ] PWA: woff2 not in precache; no explicit `/sw.js` `Cache-Control` header | pwa-offline F4–F5 |
| C3.16 | LOW | [ ] Cron: 2 LOW — see source audit | cron F4–F5, F7 |
| C3.17 | INFO | [ ] (deps) `exceljs@4.4.0` last released 2023-10-19 (19 months stale). Used in 3 prod paths. Stay for launch, replace post-launch with `xlsx-parse-stream` or similar | deps F3 |

---

## Limitations carried into batch 3

| Audit | Blocked signal | Re-run trigger |
|---|---|---|
| onboarding | No live PostHog dashboard access; no real-device timing | Beta week 1 with real users |
| gmail-sync | Supabase MCP not authenticated → no `gmail_decisions` counts, no `/api/gmail` 5xx logs, no `entries_contact_email_uniq` index check | Re-run when MCP OAuth done |
| performance | No real-device LCP/INP measurement (config-only evidence) | Lighthouse CI run pre-launch |
| resilience | No live Vercel function-secs measurement of stalled-fetch impact | Beta week 1 |
| brain-sharing | Supabase MCP not authenticated → policies derived from migration files, not `pg_policies` | SQL cross-check before launch |
| accessibility | No axe-core run (no browser available); no SR walk | Manual VoiceOver iOS + NVDA pre-launch |
| dependencies | No `license-checker` (used disk walk); no `npm audit signatures`; no SBOM | Run `npm audit signatures` in CI |

---

## Merge plan

When batch-1 (`TODO-AUDIT-FIXES.md`) and batch-2 (`AUDIT-ROLLUP-2026-05-07-batch-2.md`) close:

1. Merge phases B0–B3 (batch-2) and C0–C3 (batch-3) into the existing TODO numbering.
2. Header update: "across all 11 reports" → "across all 29 reports" (12 archived + 18 active = 30; minus omnibus duplicates if any).
3. Per-finding workflow: when [x], add `## Resolution — YYYY-MM-DD` section to source audit + `git mv` to `archive/`.
4. Delete the rollup files once merged; preserve in git history.

---

**File created**: 2026-05-07 by audit batch-3 rollup.
**Maintenance**: keep `[ ]` checkboxes synced with the source audit files.
