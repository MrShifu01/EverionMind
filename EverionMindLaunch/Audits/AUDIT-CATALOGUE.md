# Audit Catalogue — narrow-but-deep audits for Everion Mind

> A living registry of focused audits we can run on a cadence. Each one is a single-vertical or single-surface deep cut — narrower than the omnibus `/smash-os:audit` or `/production-audit`, deeper because nothing else competes for context.
>
> **How to use:** pick one row → run the listed command (or run the audit by hand using the listed signals) → save the report into `EverionMindLaunch/Audits/<slug>-YYYY-MM-DD.md`. The dashboard auto-discovers it.
>
> **Cadence legend:** 🔴 weekly (pre-launch) · 🟡 monthly · 🟢 quarterly · 🔵 ad-hoc / per-incident
>
> Run-tracking lives in the cadence column as `· **N× · last YYYY-MM-DD**`. Bump the count and update the date every time the audit is re-run. New runs add a fresh dated `.md` file to `EML/Audits/`; the old report stays as evidence.

---

## How to read each entry

| Field | Meaning |
|---|---|
| **Slug** | filename prefix in `EML/Audits/` |
| **Trigger** | slash command or natural-language phrase that should kick it off |
| **Scope (in)** | exactly what the audit looks at |
| **Scope (out)** | what it deliberately skips (delegated to another audit) |
| **Signals** | data sources — code paths, MCP tools, log queries, browser probes |
| **Invariants** | the questions the audit must answer |
| **Cadence** | recommended frequency |

---

## A. Cross-cutting omnibus audits (rarely)

These look at everything. Don't run them weekly — they overload context and produce noise.

| Slug | Trigger | Cadence | Notes |
|---|---|---|---|
| `smash-os-audit` | `/smash-os:audit` | 🟡 monthly · **1× · last 2026-05-07** | 7-dimension scoring across the whole repo |
| `production-audit` | `/production-audit` | 🔵 pre-launch only · **1× · last 2026-05-07** | 15-section gate, GO/NO-GO verdict |

---

## B. Pipeline audits (vertical slices)

Each pipeline is a domain — capture, retrieval, enrichment, etc. Audits trace one entry from input to durable side-effect, prove every gate, and flag silent failure modes.

| Slug | Trigger | Scope (in) | Scope (out) | Signals | Cadence |
|---|---|---|---|---|---|
| `retrieval-audit` | "audit retrieval" | `api/_lib/retrievalCore.ts`, `api/search.ts`, `api/_lib/generateEmbedding.ts`, vector index health, rerank, BM25 fallback, brain-scope filter, secret exclusion | UI / chat layer | `pg_stat_statements`, advisor 0005 (HNSW scan count), 5 sample queries with `EXPLAIN ANALYZE` | 🟡 monthly · **1× · last 2026-05-07** |
| `enrichment-audit` | "audit enrichment" | `api/_lib/enrich.ts`, `enrichInline`, `enrichmentQueue`, parse → insight → concepts → embed, fallback chain, quota gate, idempotency | retrieval / capture | `entries.metadata.enrichment` row sampling, queue depth, claim-worker, quota counters | 🟡 monthly · **1× · last 2026-05-07** |
| `capture-pipeline-audit` | "audit capture" | `api/capture.ts` → enrichInline → embed → audit_log; bodyParser limits; idempotency-key namespace | UI capture sheet | inline-await proof on every door, audit log row count, time-to-enriched p95 | 🟡 monthly · **1× · last 2026-05-07** |
| `gmail-sync-audit` | "audit gmail sync" | `api/_lib/gmailScan.ts`, OAuth → scan → classify → distill → stage → promote, pattern rules, decisions log, contact upsert | calendar | scan concurrency, fan-out, AbortController, classifier error rate, prompt-injection guards | 🟡 monthly · **1× · last 2026-05-07** |
| `calendar-sync-audit` | "audit calendar" | `api/calendar.ts`, OAuth bootstrap, event fetch, upcoming derivation, reconnect flow | gmail | OAuth state HMAC, token refresh, fetch deadlines, unauth 200 fallback | 🟢 quarterly |
| `vault-unlock-audit` | "audit vault" | `src/lib/crypto.ts`, `vaultPinKey.ts`, `useVaultOps.ts`, PIN → biometric → recovery key, DEK envelope grants, brain_vault_grants | UI vault view | PBKDF2 iterations, AES-GCM IV uniqueness, key never in plaintext, recovery rotation, F1 from prod-audit (native confirm) | 🔴 weekly until launch · **1× · last 2026-05-07** |
| `brain-sharing-audit` | "audit brain sharing" | `brain_invites`, `brain_members`, `brain_vault_grants`, `entry_shares`, owner vs member RBAC, invite redemption | retrieval | RLS policies for the four tables, FK CASCADE chain, invite expiry | 🟡 monthly · **1× · last 2026-05-07** |
| `account-delete-audit` | "audit account delete" | GDPR cascade list at `api/user-data.ts:1851-1862`, migration 054 cascade, auth.users delete trigger | per-table cleanup | each table on the cascade list, leftover rows after delete in staging | 🟢 quarterly |
| `auth-flow-audit` | "audit login + signup" | Supabase Auth, Google OAuth, magic-link, password fallback, recovery, session, JWT cache TTL, signOut | vault unlock | every entry point in `src/LoginScreen.tsx`, `src/SignupModal.tsx`; `_lib/verifyAuth.ts` cache; redirect flows; rate limit on /reset | 🔴 weekly until launch · **1× · last 2026-05-07** |
| `onboarding-audit` | "audit onboarding" | `useFirstRunChecklist.ts`, first-capture flow, aha-in-60s, empty states, step-timing telemetry | landing | PostHog funnel events, drop-off rates, time-to-first-entry, sticky-done table | 🟡 monthly · **1× · last 2026-05-07** |
| `billing-audit` | "audit billing" | LemonSqueezy checkout + webhook, RevenueCat webhook + SDK, `user_profiles` tier columns, `_lock_billing_columns` trigger, idempotency on webhooks, dual-provider reconciliation | UI BillingTab | webhook signature, replay, `markWebhookEventSeen`, `appstore_otx_idx`, tier-mutation audit | 🔴 weekly until launch · **1× · last 2026-05-07** |
| `webhook-audit` | "audit webhooks" | every webhook receiver (LS, RC, GitHub Sentry, etc.), signature verify, replay, idempotency, dead-letter | billing-audit overlap OK | constant-time compare, `idempotency_keys` table, retry semantics | 🟡 monthly · **1× · last 2026-05-07** |
| `cron-audit` | "audit crons" | `.github/workflows/cron-{daily,hourly}.yml`, `?resource=cron-*` handlers, HMAC, fan-out concurrency, runtime budget | enrichment-audit overlap OK | last-run timestamps, run-duration p95, error rate, missed runs | 🟡 monthly · **1× · last 2026-05-07** |
| `mcp-server-audit` | "audit mcp" | `api/mcp.ts`, OAuth `/.well-known`, `signMcpAccessToken`, every tool definition vs handler, error shape | chat | tool param validation, ownership-via-`brain_id` on every mutating tool, rate-limit suffix | 🟡 monthly · **1× · last 2026-05-07** |

---

## C. Surface audits (per page / per major UI)

These audit one rendered surface — invariants, accessibility, performance, copy.

| Slug | Trigger | Scope (in) | Scope (out) | Signals | Cadence |
|---|---|---|---|---|---|
| `landing-audit` | "audit landing" | `src/views/Landing.tsx`, hero, pricing, CTAs, animations, OG card, sitemap row | login / app | Lighthouse (perf/SEO/a11y), `clamp()` usage, scroll perf, signup-CTA conversion | 🟡 monthly |
| `login-signup-audit` | "audit login screen" | `src/LoginScreen.tsx`, `SignupModal`, OAuth + magic-link + password forms, error messaging, rate-limit feedback | auth-flow-audit overlap OK | iOS auto-zoom (≥16 px input), aria-label coverage, focus order, redirect target validation | 🔴 weekly until launch |
| `memory-grid-audit` | "audit memory grid" | `src/Everion.tsx`, `MemoryHeader.tsx`, EntryList, virtualizer, filters, sort, infinite scroll | detail modal | virtualizer scroll-container binding, filter perf, empty-state CTAs, time-to-first-paint with cached entries | 🟡 monthly |
| `detail-modal-audit` | "audit entry detail" | `src/views/DetailModal.tsx` (1,590 LOC god component), edit flow, share flow, vault gate, audit-log writes | memory grid | every code path's enrichment-trigger, focus trap, undo coverage | 🟢 quarterly |
| `capture-sheet-audit` | "audit capture sheet" | `src/views/CaptureSheet.tsx`, file parse (`useCaptureSheetParse.ts`), AI classification, secret detection, vault branch, voice modal | capture-pipeline-audit overlap OK | offline queue replay, file-size guards, `extractFromBuffer` PDF safety | 🔴 weekly until launch |
| `vault-view-audit` | "audit vault view" | `src/views/VaultView.tsx`, `VaultUnlocked.tsx`, `VaultPinSetup.tsx`, `SecurityTab.tsx`, recovery key UI | vault-unlock-audit overlap OK | inline confirm dialogs (no native `confirm()`), recovery-key copy / print / download flows, brand-asset usage | 🔴 weekly until launch |
| `chat-view-audit` | "audit chat" | `src/views/ChatView.tsx`, retrieval call, citations, vault-gated answers, tool calling, streaming UX | retrieval-audit overlap OK | stream-cancel on unmount, error-boundary, scroll-anchor, rate-limit feedback | 🟡 monthly |
| `todo-view-audit` | "audit todos" | `TodoView.tsx`, `TodoCalendarTab`, `TodoSomedayTab`, recurring rules, calendar overlay | calendar-sync-audit overlap OK | timezone correctness, completion idempotency, large-list virtualization | 🟢 quarterly |
| `settings-views-audit` | "audit settings" | every tab in `src/components/settings/` — Profile / Admin / Brain / Connections / Privacy / Billing | dedicated tab audits OK | URL_ALIASES preserve old `?tab=` deep links, sidebar navigation, write-confirmation patterns | 🟡 monthly |
| `profile-tab-audit` | "audit profile tab" | `ProfileTab.tsx` (2,328 LOC), persona-facts grid, fading-section, history timeline | settings overlap OK | persona dedup, soft-retire flow, scroll perf on big grids | 🟢 quarterly |
| `admin-tab-audit` | "audit admin" | `AdminTab.tsx`, `AdminCRMSection.tsx`, `isAdminUser` gate, tier-changer, mock-review, debug runners | F4 from prod-audit | server-side admin gate (currently client + endpoint check), audit_log on every mutation | 🔴 weekly until launch · **1× · last 2026-05-07** |

---

## D. Cross-cutting concern audits

| Slug | Trigger | Scope (in) | Scope (out) | Signals | Cadence |
|---|---|---|---|---|---|
| `frontend-architecture-audit` | `/improve-frontend-architecture` | 8-px grid, tap targets, fluid type, container queries, contrast, CWV | per-page semantics | Playwright crawl + computed styles | 🟡 monthly · **1× · last 2026-05-07** |
| `db-audit` | "audit db" | schemas, RLS, FK CASCADE, dead tables, indexes, function security | per-pipeline DB queries | Supabase MCP advisors + 13-invariant probe | 🟡 monthly · **1× · last 2026-05-07** |
| `security-audit` | "audit security" | auth, RLS, headers, CSP, secrets, input validation, rate limit, crypto, supply chain | per-pipeline auth | grep + advisors + npm audit + RLS scan | 🟡 monthly · **1× · last 2026-05-07** |
| `performance-audit` | "audit perf" | CWV, bundle, SW precache, lazy chunks, font loading, network waterfall | per-page perf | `npm run lighthouse`, `vite-bundle-visualizer`, Vercel Speed Insights | 🟡 monthly · **1× · last 2026-05-07** |
| `accessibility-audit` | "audit a11y" | semantic HTML, keyboard nav, focus, aria, contrast, screen reader, reduced-motion, zoom-200% | a11y inside other audits | axe-core run, manual SR walk, contrast calc on tokens | 🟡 monthly · **1× · last 2026-05-07** |
| `seo-audit` | "audit seo" | meta, OG, sitemap, robots, AI-bot allowlist, JSON-LD, 404 status, canonical | content strategy | every public route, search console, AI-bot fetch logs | 🟢 quarterly |
| `observability-audit` | "audit observability" | Sentry init + alert rules, source-map upload, structured logs, audit_log coverage, /api/health shape | per-pipeline logs | `createLogger` adoption, audit_log row coverage per action, alert-rule list | 🔴 weekly until launch · **1× · last 2026-05-07** |
| `privacy-legal-audit` | "audit privacy" | Privacy, ToS, cookie consent, GDPR delete, data export, data retention, AI disclosure, third-party DPAs | content tone | every collection point, third-party allowlist in CSP, retention SQL | 🟢 quarterly |
| `dependencies-audit` | "audit deps" | `npm audit`, license check, dep age (`npm outdated`), postinstall scripts, lockfile freshness | per-feature deps | `npm audit`, `npm outdated`, `license-checker`, `npm-check-unused` | 🟡 monthly · **1× · last 2026-05-07** |
| `ci-cd-audit` | "audit ci" | every workflow under `.github/workflows/`, branch protection, secrets coverage, preview deployments, rollback plan | per-pipeline ci | `gh api repos/.../branches/main/protection`, `gh secret list`, every workflow's runtime + failure rate | 🟡 monthly |
| `infrastructure-audit` | "audit infra" | Vercel plan + limits, Supabase plan + backups, DNS, SSL, custom domain, CDN, edge regions | per-platform pricing | Vercel dashboard, Supabase dashboard, `dig`, `curl -I` headers | 🟢 quarterly |
| `resilience-audit` | "audit resilience" | rate-limit fail-closed paths, AbortController coverage, circuit breaker thresholds, third-party degradation, graceful 503 | per-pipeline error paths | `_lib/rateLimit.ts`, every external `fetch` (Gemini, Anthropic, Resend), every `Promise.all` | 🟡 monthly · **1× · last 2026-05-07** |
| `pwa-offline-audit` | "audit pwa" | service worker, precache, runtime cache, offline empty-states, BFCache, iOS resume, install prompt | mobile native | DevTools → Application → SW lifecycle, precache size, offline e2e flow | 🟡 monthly · **1× · last 2026-05-07** |
| `mobile-native-audit` | "audit native shell" | Capacitor wrap, deep-link callback, splash, native network listener, push, biometric, keychain | per-page UX | iOS Safari + Android Chromium parity, `cap:sync` output, `fix-cap-paths.mjs` | 🟢 quarterly |
| `realtime-audit` | "audit realtime" | Supabase realtime channels, replica identity, optimistic UI revert, sync conflict resolution | per-table data flow | migration 047/048, channel subscription leaks, `useEntryRealtime` | 🟡 monthly |
| `cost-quota-audit` | "audit cost" | AI provider token usage, Vercel function-secs, Supabase rows + bandwidth, Resend email volume, RC + LS payouts | per-feature cost | provider dashboards, `enrichQuota` table, Vercel usage tab, Supabase usage tab | 🟡 monthly |
| `pii-leak-audit` | "audit pii in logs" | every `console.log` / `log.info` / `log.error` call, Sentry breadcrumbs, `audit_log.metadata`, third-party telemetry | per-pipeline logs | grep for `email`, `password`, `token`, `pin`, `recovery`, `phone` in log call sites | 🔴 weekly until launch · **1× · last 2026-05-07** |
| `error-boundary-audit` | "audit error boundaries" | `src/ErrorBoundary.tsx`, named `ViewError` per risky view, fallback copy, retry semantics | per-page error states | Sentry-captured errors that did NOT bubble through a boundary, view-level coverage | 🟡 monthly |
| `empty-states-audit` | "audit empty states" | every list / view first-time render, helpful CTAs, copy tone, no-results vs not-yet-loaded distinction | per-pipeline UX | every view component's empty branch, screenshot inventory | 🟢 quarterly |
| `test-coverage-audit` | "audit tests" | Vitest unit, Playwright e2e, component tests, mock fidelity, integration coverage of each god component | per-feature tests | `vitest --coverage`, `e2e/specs` count vs feature count, mock vs real DB tests | 🟡 monthly |

---

## E. App-specific deep cuts

These are unique to Everion Mind — wouldn't make sense as generic audits.

| Slug | Trigger | Scope (in) | Signals | Cadence |
|---|---|---|---|---|
| `ai-provider-abstraction-audit` | "audit ai provider" | `_lib/aiProvider.ts`, `callAI`, provider failover, BYOK, quota gate, model registry, retry budget | every `callAI` site, fallback ordering, `enrichQuota.checkAndConsumeQuota` adoption | 🟡 monthly · **1× · last 2026-05-07** |
| `concept-graph-audit` | "audit concept graph" | `concept_graphs` table, build, prune, write-paths, growth, similarity edges | row sampling, JSONB size, recency, write-source distribution | 🟢 quarterly |
| `persona-facts-audit` | "audit persona facts" | persona extraction, hygiene, dedupe, soft-retire, history timeline | `extractPersonaFacts.ts`, persona dedup heuristic, retire flow tests | 🟡 monthly |
| `important-memories-audit` | "audit important memories" | `important_memories` table, hierarchy, retire, deterministic memory_key | row sampling, churn pattern, RLS | 🟢 quarterly |
| `tags-audit` | "audit tags" | `tags`, `entry_tags`, orphans, suggestions, dedupe, normalization | orphan tag count (was 33 on 2026-05-07), tag-count distribution | 🟢 quarterly |
| `trash-soft-delete-audit` | "audit trash" | soft-delete columns, retention, hard-delete flow, undo, audit_log | `entries.deleted_at` distribution, 30-day purge job, undo race | 🟡 monthly |
| `audit-log-audit` | "audit audit_log" | every security-relevant mutation has a row, retention, schema completeness, gaps | grep for mutating service-role calls without `audit_log` write, row count by `action` | 🟡 monthly |
| `rate-limiter-audit` | "audit rate limiter" | `_lib/rateLimit.ts`, per-IP vs per-user keying, NAT collisions, circuit-breaker thresholds, Upstash health | failure-mode test, `x-forwarded-for` parsing, `withApiKey` vs `withAuth` keying | 🟡 monthly · **1× · last 2026-05-07** |
| `vector-index-audit` | "audit vector index" | HNSW index build params, scan stats, rebuild after model change, dimensionality | advisor 0005 unused-index, F2 from db-audit, `pg_stat_user_indexes` | 🟡 monthly |
| `embedding-drift-audit` | "audit embeddings" | model swap detection, dim mismatch, partial reindex, drift on `entries` rows | check_embedding_drift MCP tool, model registry, embed timestamp distribution | 🟢 quarterly |
| `time-tz-audit` | "audit timezones" | every `new Date()`, UTC vs user TZ, capture timestamps, calendar event TZ, schedule cron times | grep for `new Date(`, `toISOString`, `Intl.DateTimeFormat`, user-profile tz column | 🟢 quarterly |
| `file-extraction-audit` | "audit file extract" | PDF (`pdfjs`), .xlsx (`exceljs`), images (vision API), file size, malicious file safety | each extractor's max size, OOM behavior, prompt-injection on document text | 🟡 monthly |
| `voice-transcription-audit` | "audit voice" | recorder, mime types, fallback, length cap, transcription provider, retry | `useVoiceRecorder.ts`, `/api/transcribe` body limit, e2e flow | 🟢 quarterly |
| `push-notifications-audit` | "audit push" | VAPID keys, web push, subscribe / unsubscribe, expiry handling, mobile push parity | `push_subscriptions` (currently 0 rows), `expiry_notification_log`, mobile toggle | 🟢 quarterly |
| `idempotency-audit` | "audit idempotency" | every webhook + capture path, namespace prefix collisions, retention, replay window | `idempotency_keys` table sample, namespace prefix lint, salt usage | 🟡 monthly |
| `service-role-usage-audit` | "audit service role" | every `sbHeaders()` call site, paths that should use user JWT instead, RLS bypass surface | `_lib/sbHeaders.ts`, `scripts/check-service-role-headers.mjs`, audit each `?id=eq.` write | 🔴 weekly until launch · **1× · last 2026-05-07** |
| `email-deliverability-audit` | "audit email" | Resend transactional templates, magic-link, welcome, password-reset, SPF/DKIM/DMARC, mail-tester score | DNS records, mail-tester.com run, bounce rate, spam folder rate | 🟡 monthly · **1× · last 2026-05-07** |
| `cookie-storage-audit` | "audit storage" | every `document.cookie`, `localStorage`, `sessionStorage`, IndexedDB, SW caches; secure / sameSite / httpOnly | grep + DevTools → Application → Storage; consent banner gating | 🟡 monthly |
| `telemetry-funnel-audit` | "audit funnels" | PostHog event taxonomy, funnel completeness, signup → first-capture → second-capture, retention cohorts | PostHog dashboard, event-name registry in `lib/posthog.ts`, missing-event grep | 🟡 monthly |
| `brand-assets-audit` | "audit brand" | logo / wordmark / colours / fonts — every reference is the canonical asset, no silent swaps (CLAUDE.md rule) | grep `logoNew.webp`, `--ember`, `Newsreader`, `Inter Tight`, `Fraunces`; visual diff | 🟢 quarterly |
| `copy-tone-audit` | "audit copy" | UX copy, error messages, microcopy, button labels, helper text, empty states — caveman skill alignment, brand voice consistency | grep for "Something went wrong", "Oops", "click here"; sample 30 strings | 🟢 quarterly |
| `feature-flag-audit` | "audit feature flags" | every flag in `AdminTab.tsx` flag panel, owner, expiry, default value, rollout coverage | grep flag names in code, dashboard list, stale flag detection | 🟡 monthly |

---

## F. Suggested cadence calendar

Pre-launch (until 2026-05-30):

| Day | Run |
|---|---|
| Mon | retrieval · enrichment · capture-pipeline (rotating) |
| Tue | auth-flow · login-signup |
| Wed | vault-unlock · vault-view |
| Thu | observability · pii-leak · service-role-usage |
| Fri | landing · billing · admin-tab |
| Sat | smash-os omnibus (alternating with frontend-architecture) |
| Sun | rest |

Post-launch (week 5+):

| Cadence | Audits |
|---|---|
| 🔴 weekly | observability (alerts), capture-pipeline (regression), retrieval (drift), billing |
| 🟡 monthly | smash-os, frontend-architecture, db, security, performance, accessibility, gmail-sync, mcp, ai-provider, persona-facts, telemetry, etc. |
| 🟢 quarterly | onboarding, calendar-sync, account-delete, infrastructure, brand-assets, copy-tone, persona / important-memories long-form |
| 🔵 ad-hoc | per-incident · per-feature-launch · per-major-refactor |

---

## G. How to add a new audit

1. Pick a single subsystem or surface that fits in one Markdown file's worth of attention.
2. Add a row to the right table above with `slug · trigger · scope-in · scope-out · signals · cadence`.
3. First time you run it: write `EML/Audits/<slug>-YYYY-MM-DD.md`. The dashboard auto-discovers.
4. After running it three times, add a `references/<slug>.md` if there's a stable methodology worth preserving.

If the audit overlaps existing ones, the deeper one wins — don't run both. If it duplicates >50% of an existing audit, fold it in instead.

---

## H. Existing audits in this folder (2026-05-07 snapshot)

### Active (root `EML/Audits/`)

Findings still need triage into `TODO-AUDIT-FIXES.md` or addressed-and-archived.

| File | Verdict | Batch |
|---|---|---|
| `security-audit-2026-05-07.md` | PASS w/ conditions — 1 HIGH, 4 MED, 3 LOW | 2 |
| `capture-pipeline-audit-2026-05-07.md` | PASS w/ edge gaps — 2 HIGH, 2 MED, 3 LOW | 2 |
| `retrieval-audit-2026-05-07.md` | architecture sound — 3 HIGH, 3 MED, 2 LOW | 2 |
| `mcp-server-audit-2026-05-07.md` | mostly right — 3 HIGH, 2 MED, 5 LOW, 2 INFO | 2 |
| `email-deliverability-audit-2026-05-07.md` | NOT launch-ready — 2 HIGH, 2 MED, 1 LOW | 2 |
| `rate-limiter-audit-2026-05-07.md` | mechanism right — 3 HIGH, 3 MED, 4 LOW | 2 |
| `onboarding-audit-2026-05-07.md` | aha lands < 60s; 2 silent-loss bugs — 2 HIGH, 4 MED, 3 LOW | 3 |
| `gmail-sync-audit-2026-05-07.md` | architecture right — 2 HIGH, 2 MED, 2 LOW | 3 |
| `performance-audit-2026-05-07.md` | bundle 188 KB gz, no blockers — 2 MED, 6 LOW | 3 |
| `resilience-audit-2026-05-07.md` | ~95 unguarded fetches — 3 HIGH, 5 MED, 3 LOW | 3 |
| `ai-provider-abstraction-audit-2026-05-07.md` | parallel abstractions, neither complete — 2 HIGH, 2 MED, 2 LOW | 3 |
| `brain-sharing-audit-2026-05-07.md` | architecture right — 1 HIGH, 1 MED, 3 LOW | 3 |
| `admin-tab-audit-2026-05-07.md` | F4 closed, drift-hazard remains — 1 HIGH, 3 MED, 4 LOW | 3 |
| `webhook-audit-2026-05-07.md` | LS+RC only, idempotency-burn race — 4 HIGH, 4 MED, 4 LOW | 3 |
| `accessibility-audit-2026-05-07.md` | 78% WCAG 2.2 AA — 0 HIGH, 3 MED, 5 LOW | 3 |
| `dependencies-audit-2026-05-07.md` | 0 vulns; RC SDK 2 majors behind — 1 MED, 5 LOW, 1 INFO | 3 |
| `pwa-offline-audit-2026-05-07.md` | precache 2.64 MB; manifest mismatch — 2 HIGH, 1 MED, 2 LOW | 3 |
| `cron-audit-2026-05-07.md` | auth right; serial loop blows 300s — 2 HIGH, 3 MED, 2 LOW | 3 |

### Archived (`EML/Audits/archive/`)

Findings either addressed (linked commits) or rolled into `LAUNCH_CHECKLIST.md`.

| File | Verdict |
|---|---|
| `smash-os-audit-2026-05-07.md` | 79/100 PASS WITH WARNINGS |
| `frontend-architecture-audit-2026-05-07.md` | 5 grill tickets queued |
| `production-audit-2026-05-07.md` | CONDITIONAL GO, 4 FAILs |
| `db-audit-2026-05-07.md` | RLS holds; 6 dead tables; 23 unused indexes |
| `audit-architecture-deepening-2026-05-07.md` | discovery-mode RFC catalogue |
| `vault-unlock-audit-2026-05-07.md` | crypto holds; sessionStorage→IDB migration queued |
| `auth-flow-audit-2026-05-07.md` | gate solid; redirect-allowlist hardened |
| `billing-audit-2026-05-07.md` | dual-provider sane; F1 host-header → APP_ORIGIN open |
| `service-role-usage-audit-2026-05-07.md` | choke-point enforced; F1 pre-fetch by id-only carried |
| `observability-audit-2026-05-07.md` | Sentry live; F3 audit_log gaps queued |
| `pii-leak-audit-2026-05-07.md` | low surface; F1 user.email log fix queued |
| `enrichment-audit.md` | fallback chain holds; queue-depth alert added |
| `audit-{security,stability,architecture,production,production-hardening}-2026-05-06.md` | superseded by 2026-05-07 set |
| `codex-2026-04-30.md`, `codex-performance-2026-04-30.md`, `perf-first-paint-2026-04-30.md` | early-stage Codex passes |

---

**File kicked off by**: user request "What other narrow but deep Audits can we do still? Save an Md file that lists specific audits we can do often" on 2026-05-07.
**Maintenance rule**: when an audit is run, bump `N×` and `last YYYY-MM-DD` in the cadence column AND add the new dated `.md` file to section H Active. When findings are addressed, `git mv` to `archive/` and move the row to section H Archived. The catalogue is the index, not the history.
