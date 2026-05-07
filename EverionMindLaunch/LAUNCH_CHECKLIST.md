# Everion Mind — Public Launch Checklist

Project-specific, prioritized for solo dev shipping a public-scale product.

**How to use:** Work through P0 first (blocks launch). P1 is the strong-recommendation tier — get there before opening signups beyond closed beta. P2 is the post-launch backlog. Update the status icons as you go.

**Status icons:** ✅ done · 🟡 partial · ❌ missing

---

## Production Hardening Audit Deferrals — 2026-05-06

Traceability source: [`Audits/audit-production-hardening-2026-05-06.md`](Audits/audit-production-hardening-2026-05-06.md).

- [ ] **P0-1** Rotate local/prod secrets if `.env.local` values or this audit transcript ever left the machine.
- [ ] **P0-4** Add `OAUTH_TOKEN_ENCRYPTION_KEY` to Vercel production/staging and run `Ops/oauth-token-plaintext-audit.sql`.
- [x] **P1-3** Harden Gmail/enrichment cron with bounded concurrency, queueing, timeouts, and paginated pending-work scans.
- [x] **P1-7** Define and enforce explicit shared-brain roles for member write/delete permissions.
- [x] **P1-8** Run bundle visualizer and split heavy chunks on non-capture paths.
- [x] **P1-10** Resolve the shadcn transitive `ip-address` advisory without breaking local shadcn component styling.
- [x] **P1-11** Extract first `api/entries.ts` handler module without adding Vercel functions; continue incremental extraction as quality backlog.
- [x] **P1-12** Centralize service-role Supabase headers through `_lib/sbHeaders.ts` and add lint enforcement.
- [x] **P2-2** Regenerate `.env.example` from `Ops/env-vars.md` with required-vs-optional labels.
- [x] **P2-6** Move API request bodies from `any` to `unknown` plus endpoint validators.
- [x] **P2-7** Review app copy so PIN is described as an app lock, not strong local encryption.
- [x] **P2-8** Plan CSP migration away from `style-src 'unsafe-inline'`. Plan: [`Ops/csp-inline-style-migration-plan.md`](Ops/csp-inline-style-migration-plan.md).
- [x] **P3-3** Route audit/security logs through structured logger helpers.
- [x] **P3-4** Remove build chunk-warning noise by splitting bundles or documenting an intentional threshold.

---

## Enrichment Audit Deferrals — 2026-05-07

Traceability source: [`Audits/archive/enrichment-audit.md`](Audits/archive/enrichment-audit.md).
Resolution details are prepended to that audit.

- [x] **S-01 / E2E-01** Remove Gemini API keys from Google AI request URLs and route them through `x-goog-api-key`.
- [x] **T-02 / E2E-04** Change managed/free enrichment quota checks from fail-open to fail-closed.
- [x] **T-04** Guard `entries.ts` audit JSON parsing against malformed LLM output.
- [x] **S-05 / E2E-06** Harden Gmail distillation against prompt-learning poisoning.
- [x] **E2E-08** Clamp `GMAIL_CRON_SCAN_CONCURRENCY` and default invalid env input to `3`.
- [x] **E2E-09** Reset context-dependent enrichment flags on cross-brain moves.
- [x] **E2E-11** Load persona extraction context from the personal brain before writing persona facts there.
- [x] **E2E-12** Validate batch embedding vector count and 768 dimensions.
- [ ] **S-02 / A-03** Reduce service-role/RLS bypass on user-scoped entry writes. Minimum viable pass: convert delete/update/transfer paths to user-JWT or RPCs that enforce tenant checks in SQL.
- [ ] **S-04 / E2E-16** Add DB-backed admin verification and audit-log writes for admin diagnostic endpoints.
- [ ] **A-02 / S-06** Add audit-log coverage for `/v1/*` and MCP write tools.
- [ ] **T-01 / E2E-03** Finish hard external timeouts for non-Google Supabase, OAuth, Gmail, OpenAI, Anthropic, OpenRouter, Groq, and webhook fetches.
- [ ] **A-04 / E2E-02 / E2E-05** Move enrichment to a durable async job path so capture, Gmail scan, v1, MCP, and chat writes return fast and share one queue contract.
- [ ] **E2E-07** Replace O(all brains) cron enrichment sweeps with pending-work indexing or job-table scanning.
- [ ] **E2E-10** Decide and implement shared-entry overlay semantics: source-brain metadata by design, or destination-specific enrichment artifacts.
- [ ] **E2E-14** Make Gmail accept/reject mutation and learning-decision recording a single server action.
- [ ] **U-02 / U-03** Surface Gmail/Calendar reconnect prompts on repeated token refresh failure.
- [ ] **E2E-17** Decide whether localStorage prompt learning remains low-trust local UX memory or moves server-side with provenance/reset controls.
- [ ] **E2E-19** Add named-entity/facts extraction alongside generic concepts for precise personal recall.
- [ ] **E2E-20** Persist and display Gmail attachment extraction coverage and skipped-file reasons.
- [ ] **E2E-21** Refresh enrichment, Gmail, and cron architecture docs against current code.
- [ ] **E2E-22** Add workflow-level tests for capture state, Gmail staged decisions, shared-brain move/share behavior, quota failure, prompt injection, and cron starvation.

---

## Readiness Scorecard — 2026-04-27

Evaluation across the seven dimensions that decide whether a SaaS is "open the gate" ready. Scores are honest, not aspirational. **Overall: 6.5/10 — closed-beta ready, not full-public-launch ready.** Several P0 stability gaps below would bite within the first 1k users.

| Dimension              | Score    | Verdict                                                                                                                                                                                                                                                                                            |
| ---------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Security**           | 7.0 / 10 | RLS hardened (053), service-role isolated, vault crypto sound (AES-256-GCM, PBKDF2-310k), every endpoint rate-limited. Drag: CSP `style-src 'unsafe-inline'`, rate-limit fail-open path when Upstash misconfigured. `.env*.local` correctly gitignored — no leak.                                  |
| **Performance**        | 6.5 / 10 | Lazy-loaded heavy chunks (pdfjs/mammoth/jszip), virtualised entries grid, inline app shell. Drag: cold-load fires several `/api/*` calls sequentially in `useDataLayer.ts`; `entryRepo.list(limit:1000)` has no cursor; `og.png` ships uncompressed at 41 KB.                                      |
| **UI / Visual**        | 7.5 / 10 | Strong design language (Espresso/Ivory/Bronze + serif/sans pairing), WCAG AA dark-theme contrast bump shipped, mobile + desktop layouts diverge cleanly. No tablet hack. Settings sidebar consolidated 12 → 5 sections (Personal / Account / Brain / Connections / Privacy & danger), Admin gated. |
| **UX**                 | 6.0 / 10 | Capture flow is tight, OmniSearch + keyboard shortcuts feel native, friendlyError mapping in place. Drag: no mandatory first-run walkthrough, modals don't trap focus, empty-states for Vault/Calendar/Chat lack action CTAs, no skip-to-content link.                                             |
| **Maintainability**    | 8.6 / 10 | TypeScript strict, 11 e2e specs, 450 unit tests passing, Vitest + Playwright separated cleanly, CLAUDE.md + RUNBOOK.md present. ESLint warning ratchet at **73** (down from 297, -224, -75%). Drag: 6 `as any` casts in src/ (all legit ESM-compat or annotated Supabase quirks). **Zero god-components >1000 lines.** TodoCalendarTab split 1576 → 430 + 3 sibling files; VaultView split 1207 → 101 + 4 sibling files; EntryList split 918 → 244 + 2 sibling files (EntryCard 424, EntryRow 276).                                                                  |
| **Stability**          | 5.5 / 10 | Single top-level ErrorBoundary, AI provider calls have no retry, idempotency on capture + Lemon/RevenueCat webhooks + a few action endpoints. Health check returns booleans without 5xx-ing on degraded deps. **This is the weakest dimension and the most likely to surface as a public-traffic bug.**                           |
| **Compliance / Legal** | 7.0 / 10 | Privacy + ToS drafted in plain English, AI-output disclaimer surfaced, GDPR delete cascade (054) + full export endpoint working, consent banner gates Sentry + PostHog. Drag: drafts not lawyer-vetted; SPF/DKIM/DMARC for sender domain unverified.                                               |

**Where to spend the next sprint:** Stability (5.5) and UX (6.0) are the two dimensions where the score-to-effort ratio is highest. Specific items below.

---

## Week-plan cross-reference

Every open `[ ]` item below has a calendar slot in one of the four weekly plans in `Roadmap/`. When working from this checklist, find your current week below to see which items land that week.

> **Maintenance rule:** if you re-prioritize an item, update its row in this table AND in the relevant week plan. Drift between this index and the week plans is the failure mode.

### Week 1 — DECIDE & PROVISION (Fri 2026-05-01 → Thu 2026-05-07)

Plan: [`Roadmap/week-1.md`](Roadmap/week-1.md)

| Day | Checklist item | Section |
| --- | -------------- | ------- |
| Fri 05-01 | Trademark search "Everion Mind" | (new — added to schedule, not in checklist body yet) |
| Fri 05-01 | Vercel Pro upgrade | P0 / Infrastructure |
| Fri 05-01 | Supabase Pro upgrade | P0 / Infrastructure |
| Fri 05-01 | Google Play Developer enrollment | Owner-only / Before public launch |
| Fri 05-01 | Customer support `support@` forward (legacy host) | Owner-only / Before public launch |
| Sat 05-02 | Rotate exposed keys (Resend, Groq, Upstash, CRON_SECRET, VAPID) | P0 / Security |
| Sat 05-02 | Sentry alerts (3 rules) | P0 / Telemetry |
| Sat 05-02 | Add `SUPABASE_DB_URL` GH secret + trigger first backup | P0 / Infrastructure |
| Sat 05-02 | Confirm SSL grade A + DNS A/AAAA (legacy host) | P0 / Infrastructure |
| Sun 05-03 → Mon 05-04 | **Onboarding test with 3 strangers** | Owner-only / People stuff |
| Tue 05-05 | Co-admin on 7 dashboards (Vercel/Supabase/Sentry/PostHog/Resend/Upstash/GitHub) | Operations & bus factor |
| Wed 05-06 | Weekly roll-up email setup (8 GH secrets + script + workflow) | P0 / Telemetry / Weekly automated roll-up |
| Thu 05-07 | Slack day + week-1 retro | (operational, not a checklist item) |

### Week 2 — DOMAIN + ONBOARDING + INSTRUMENT + FEED v0 (Fri 2026-05-08 → Thu 2026-05-14)

Plan: [`Roadmap/week-2.md`](Roadmap/week-2.md). Sub-specs: [`Specs/brain-feed-v0.md`](Specs/brain-feed-v0.md), [`Specs/streak-counter.md`](Specs/streak-counter.md), [`Specs/archive/cmd-k-capture.md`](Specs/archive/cmd-k-capture.md).

| Day | Checklist item | Section |
| --- | -------------- | ------- |
| Fri 05-08 | Domain cutover to `everionmind.com` (Vercel + Supabase auth + LS/RC webhook URLs) | (new — schedule item, not yet in checklist) |
| Fri 05-08 | Custom domain SSL + DNS verified (new domain) | P0 / Infrastructure |
| Fri 05-08 | Sender domain SPF/DKIM/DMARC for new domain | P1 / Compliance follow-ups |
| Fri 05-08 | Customer support `support@everionmind.com` forward | Owner-only / Before public launch |
| Sat 05-09 | Onboarding aha-in-60s polish + step-timing telemetry | (sourced from week-1 stranger test notes) |
| Sun 05-10 | PostHog funnel pinned + cohorts saved | (new — funnel events shipped 2026-05-01 in commit `052db23`) |
| Sun 05-10 | Sentry alerts re-verification on new domain | P0 / Telemetry |
| Mon 05-11 → Tue 05-12 | Brain Feed v0 (backend + render) | (new — schedule item) |
| Wed 05-13 | Streak counter (DB migration 068 + increment + chip) | (new — schedule item) |
| Thu 05-14 (AM) | Cmd+K global capture shortcut | (new — schedule item) |
| Thu 05-14 (PM) | LemonSqueezy live store configured | P0 / Billing |
| Thu 05-14 (PM) | RevenueCat dashboard configured | P0 / Billing |

### Week 3 — QA + Play Console submission (Fri 2026-05-15 → Thu 2026-05-21)

Plan: [`Roadmap/week-3.md`](Roadmap/week-3.md). Sub-specs: [`Specs/play-console-submission.md`](Specs/play-console-submission.md), [`Specs/android-qa-matrix.md`](Specs/android-qa-matrix.md).

| Day | Checklist item | Section |
| --- | -------------- | ------- |
| Fri-Sat 05-15/16 | Real-device QA pass (Android matrix) | P1 / Quality |
| Sun 05-17 | Play Store assets (icons, screenshots, feature graphic) | Mobile app launch |
| Mon 05-18 (AM) | Play Console listing copy + data safety form | Mobile app launch |
| Mon 05-18 (PM) | App Store Connect + **Play Console subscription products** | P0 / Billing |
| Tue 05-19 | Sign + upload AAB to internal testing | Mobile app launch |
| Wed 05-20 | RC subscription cancellation flow E2E (Android sandbox) | P0 / Billing |
| Wed 05-20 | Play Console pre-launch report green | Mobile app launch |
| Thu 05-21 | Production review submitted (HARD DEADLINE) | Mobile app launch |

### Week 4 — Polish + closed-beta launch (Fri 2026-05-22 → Sat 2026-05-30)

Plan: [`Roadmap/week-4.md`](Roadmap/week-4.md).

| Day | Checklist item | Section |
| --- | -------------- | ------- |
| Fri 05-22 | Lighthouse pass on production (≥90 perf, ≥95 a11y/best/SEO) | P1 / Quality |
| Fri 05-22 | E2E suite back to green | P1 / Quality |
| Sat 05-23 | Real-device QA pass (web cross-browser) | P1 / Quality |
| Sun 05-24 | Welcome email tested across clients | P1 / Communications |
| Sun 05-24 | mail-tester.com 10/10 (SPF/DKIM/DMARC) | P1 / Compliance follow-ups |
| Mon 05-25 (AM) | LemonSqueezy subscription cancellation flow E2E (web) | P0 / Billing |
| Mon 05-25 (PM) | Native sandbox subscription E2E (Android, if approved) | P0 / Billing |
| Tue 05-26 (AM) | Closed beta invite list (50-100 named) | (new — operational) |
| Tue 05-26 (PM) | Test Supabase backup restore (one-time rehearsal) | Operations & bus factor |
| Wed 05-27 (AM) | Pre-launch audit doc (security/perf/content/billing) | (synthetic — covers many items) |
| Wed 05-27 (PM) | 30-min legal review of Privacy + ToS | P1 / Compliance follow-ups |
| Thu 05-28 | Final polish slack + dress rehearsal | (operational) |
| Fri 05-29 | LAUNCH EVE — sleep cutoff 22:00 | (operational) |
| **Sat 05-30** | **Closed beta launch — first 50-100 invites sent** | (Day 30 — schedule's hard deadline) |

### Beta phase ops (Sun 2026-05-31 → Mon 2026-07-01) and post-launch deferrals

Doc: [`Roadmap/beta-phase.md`](Roadmap/beta-phase.md).

| Window | Checklist item | Section |
| ------ | -------------- | ------- |
| Days 30-60 | Daily PostHog walk + Sentry/Vercel scan + build-in-public tweet | (operational cadence) |
| Day ~35 | PH "upcoming" page submission | (marketing — lives in `marketing/ProductHunt/upcoming-page.md`) |
| Day ~38 | Brain Feed v1 (full ROADMAP version) | (deferred from week 2 v0) |
| Day ~42 | iOS App Store submission | Mobile app launch (week 5-6 of arc) |
| Day ~45 | PH hunter outreach (3-5 candidates) | `marketing/ProductHunt/hunter-outreach.md` |
| Day ~60 | Public launch — PH + HN + Reddit blast | `marketing/ProductHunt/launch-day-checklist.md` |
| Post-day-60 | Audit-log UI surface | P2 / Post-launch hardening |
| Post-day-60 | CSP nonce migration (drop `'unsafe-inline'`) | P2 / Post-launch hardening |
| Post-day-60 | Settings sidebar density review (if data shows decision fatigue) | P1 / UX & accessibility |
| Post-day-60 | Shared brains phase 2+ (invites, members, RLS) | P2 / Post-launch backlog |

---

## P0 — Blocks launch (must have)

### Infrastructure

- [ ] **Vercel Pro upgrade** ❌
      Currently on Hobby (12-function cap, 100 GB bandwidth, 60s function timeout). `vercel.json` already configures `maxDuration: 300` on `gmail.ts` / `llm.ts` / `user-data.ts` — those will time out at 60s on Hobby. Upgrade before launch ($20/mo).
- [ ] **Supabase Pro upgrade** ❌ (CRITICAL — confirmed on Free tier 2026-04-28)
      Free tier ships with **zero automated backups** and a 500 MB database cap. At ~3 KB per entry (768-dim embedding + content) you fit ~150k entries before hitting the cap, then writes start rejecting. For a public-scale product this is a launch blocker.
      Pro ($25/mo) gets:
      - Daily automated backups, 7-day retention
      - 8 GB DB (16× headroom)
      - 250 GB bandwidth/month (125× headroom)
      - Branching for safer DDL changes
      - Restore via dashboard one-click
      Optional PITR add-on (~$100/mo) for restore-to-any-second; daily is fine for a memory app where users can re-import.
      Upgrade at <https://supabase.com/dashboard/project/wfvoqpdfzkqnenzjxhui/settings/billing>.

      **DIY pg_dump backup workflow shipped 2026-04-28** — `.github/workflows/db-backup.yml` runs daily at 03:17 UTC, dumps the `public` schema, gzips, uploads as a private GitHub Release tagged `backup-YYYY-MM-DD`, and prunes anything older than 30 days. Restore procedure is in `RUNBOOK.md`. **One setup step left:**

      - [ ] Add `SUPABASE_DB_URL` to repo secrets (Settings → Secrets and variables → Actions). Format:
            `postgresql://postgres.<project-ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`
            (Session pooler mode, port 5432 — NOT the transaction pooler on 6543, which doesn't support pg_dump.) Get the URI from Supabase dashboard → Project Settings → Database → Connection string → URI.
      - [ ] Trigger the workflow once via `workflow_dispatch` to confirm the first dump lands. Then it runs daily.

      **DIY backups are a stop-gap.** They cover "I dropped the wrong table" but not "the project got nuked" (the `auth` schema isn't dumped, so users can't be restored). Pro is still the right answer before public launch.
- [ ] **Custom domain SSL + DNS verified** 🟡
      `everion.smashburgerbar.co.za` is live. Confirm SSL grade A on ssllabs.com and DNS has both A + AAAA records.
- [x] **Vercel Deployment Protection on previews** ✅
      ON. Right setting for a launching product — keep it.

### Security

- [ ] **Rotate any keys exposed in dev sessions** 🟡
      Resend, Groq, Upstash token, CRON_SECRET, VAPID private key — rotate as a precaution if shared with any AI assistant or pasted into chat. Don't rotate Supabase keys mid-launch (it logs everyone out).
- [x] **Supabase RLS policies audit** ✅
      Done 2026-04-27 (migration `053_rls_audit_hardening.sql`). All 29 public tables enforce RLS with `auth.uid()`-scoped policies. Three legacy SECURITY DEFINER functions had hardcoded user_ids and `anon` execute grants — `recall()` and `link_entries()` dropped (unused MCP-era helpers); `increment_usage()` locked down to `service_role` only. `user_personas` policy tightened from `public` to `authenticated`. Trigger-only functions revoked from anon/authenticated for defense-in-depth.
- [x] **Service-role key isolation** ✅
      Verified 2026-04-27. `SUPABASE_SERVICE_ROLE_KEY` is referenced only under `api/_lib/` and `api/*.ts` (server-only), never imported in `src/`. Browser SDK uses anon key per `src/lib/supabase.ts`.
- [x] **Rate limiting on key endpoints** ✅
      Audited and tightened 2026-04-27 (commit `c6ec035`). Every endpoint now has a cap. Notable: `/api/notification-prefs` 30/min, `/api/push-subscribe` 20/min, gmail outer baseline 60/min + OAuth 30/min. Capture/LLM/v1/search were already covered. **Caveat:** see "Rate-limit fail-open audit" finding below.
- [x] **OAuth callback/state hardening** ✅
      Shipped 2026-04-30. New `api/_lib/oauthState.ts` HMAC-signs state payloads with a 10-min expiry + 16-byte nonce, replacing the tamperable `Buffer.from(JSON.stringify(...)).toString("base64url")` pattern in both `api/gmail.ts` and `api/calendar.ts`. The OAuth-start endpoints (`/api/gmail-auth?provider=google`, `/api/calendar-auth?provider=google|microsoft`) now require POST with `Authorization: Bearer ...` and return `{ redirect_url }` JSON — Supabase bearer tokens no longer land in URL query strings (logs/history/Referer are clean). Frontend callers (`GmailSyncTab.tsx`, `CalendarSyncTab.tsx`) updated to use `authFetch(..., { method: "POST" })` then `window.location.href = redirect_url`. Callback paths verify the signed state before any DB write; bad signature → `gmailError=invalid_state`, expired → `gmailError=expired_state`. Set `OAUTH_STATE_SECRET` in Vercel env (falls back to `SUPABASE_SERVICE_ROLE_KEY` until provisioned).
- [x] **Encrypt Calendar OAuth tokens** ✅
      Shipped 2026-04-30. `api/_lib/gmailTokenCrypto.ts` generalised with a `TokenNamespace` parameter (`"gmail" | "calendar-google" | "calendar-microsoft"`) — namespace varies the scrypt salt so each provider's blobs are key-isolated. Default `namespace="gmail"` preserves the original Gmail salt so existing encrypted Gmail rows decrypt unchanged. `api/calendar.ts` now `encryptToken()`s access + refresh on initial OAuth + every refresh, and `decryptToken()`s before any Bearer-header use. Existing plaintext rows fall through unchanged (`decryptToken` returns input when no `enc:v1:` prefix) and migrate lazily on next refresh. Env var: `OAUTH_TOKEN_ENCRYPTION_KEY` (legacy `GMAIL_TOKEN_ENCRYPTION_KEY` still honoured).

### Compliance / Legal

- [x] **Privacy Policy** ✅ (drafted in `src/views/PrivacyPolicy.tsx`)
      Covers data location (Supabase EU West, Vercel edge), retention (48h scrub on delete), third parties (Supabase, Vercel, Resend, Sentry, PostHog, Gemini), POPIA + GDPR rights. **Recommend a 30-min legal review before launch — drafted in plain English, not lawyer-vetted.**
- [x] **Terms of Service** ✅ (drafted in `src/views/TermsOfService.tsx`)
      Covers acceptable use, account termination, AI output disclaimer, governing law (South Africa), liability limits, third-party processors. **Same legal-review caveat as Privacy.**
- [x] **Data export endpoint working** ✅
      `/api/user-data?resource=full_export` ships a 16-table dump with secrets stripped. e2e covered by `e2e/specs/settings-export.spec.ts`. `/api/transfer` is the in-product migration helper (separate concern).
- [x] **Data deletion endpoint working** ✅
      Migration `054_delete_user_cascade.sql` adds a SECURITY DEFINER `delete_user_data(p_user_id)` that DELETEs across 22 user-owned tables in dependency order. Wired into `handleDeleteAccount` in `api/user-data.ts`. e2e gated by `e2e/specs/settings-delete-account.spec.ts`.
- [x] **Cookie/analytics consent gate** ✅
      `src/components/ConsentBanner.tsx` gates both Sentry and PostHog on `everion_analytics_consent`. PostHog re-identifies after init when a user signs in pre-consent (fix in commit `fdee1af`).
- [x] **AI-generated content disclosure** ✅
      Persistent line under the chat composer ("AI-generated. Can be wrong — check anything that matters."). ToS also has a dedicated "AI output" section.

### Telemetry / Observability

- [x] **Sentry wired** ✅ (in `main.tsx` + `ErrorBoundary.tsx`)
- [x] **PostHog wired** ✅ (consent-gated, lazy-imported, re-identifies after init — see `src/lib/posthog.ts`)
- [x] **Vercel Analytics enabled** ✅ (`@vercel/analytics` + `@vercel/speed-insights` mounted in `main.tsx`, consent-gated)
- [x] **Production e2e watchdog** ✅ (smoke + onboarding + capture, daily + on-deploy)
- [ ] **Sentry alerts configured** 🟡
      Three rules to add: error-rate spike (>10/min), new issue type, and slow `/api/llm`+`/api/capture` p95. Click-by-click playbook with exact thresholds in `docs/launch-runbook-alerts-and-dns.md`. ~5 min.
- [x] **Lighthouse weekly synthetic audit** ✅
      `.github/workflows/lighthouse.yml` runs Sun 04:00 UTC + on-demand. Mobile + desktop, scores never fail the build (monitoring not gating). Reports uploaded as 90-day artifacts. Retries once per preset on Chrome protocol flakes.

### Weekly automated roll-up (custom — wire after API tokens are in place)

A single Monday-morning email aggregating all five tools so I see the whole picture in one inbox instead of five dashboards. Runs as a GitHub Actions cron, sends via Resend.

- [ ] **Add GitHub Actions secrets** ❌
      Repo → Settings → Secrets and variables → Actions:
  - `SENTRY_AUTH_TOKEN` (Sentry → Settings → Auth Tokens; scopes: `event:read`, `project:read`, `org:read`)
  - `SENTRY_ORG`, `SENTRY_PROJECT` (slugs from project URL)
  - `POSTHOG_API_KEY` (PostHog → Personal API Keys; scopes: `query:read`, `project:read`)
  - `POSTHOG_PROJECT_ID` (numeric, top of Project Settings)
  - `VERCEL_TOKEN` (vercel.com/account/tokens; scope: Read)
  - `VERCEL_PROJECT_ID` (`prj_xxx` from project settings)
  - `RESEND_API_KEY` (same as in Vercel — duplicate it here for the workflow to send the digest)
  - `WEEKLY_REPORT_TO` (recipient email)

  Lighthouse + e2e numbers come from this repo's own workflow runs — `GITHUB_TOKEN` is auto-injected, no extra secret needed.

- [ ] **Wire `scripts/weekly-roll-up.ts`** ❌
      Pulls last-7d metrics: Sentry error count + new issues, PostHog DAU + total captures, Vercel pageviews + bandwidth, latest Lighthouse scores (from artifact), e2e pass rate (from workflow runs). Composes one HTML email, sends via Resend.

- [ ] **Wire `.github/workflows/weekly-roll-up.yml`** ❌
      Cron `0 6 * * 1` (Mon 06:00 UTC). On-demand `workflow_dispatch` for manual runs. Calls the script, fails the workflow if the email send fails so I notice in GitHub.

- [ ] **Dry-run the first send** ❌
      First run: log the composed email body to stdout instead of sending, eyeball the numbers. Flip to live send once the format looks right.

  Subject format: `Everion weekly — 23 errors, 142 DAU, e2e ✓, perf 91/85`

### Billing (LemonSqueezy web + RevenueCat mobile)

Stripe was replaced 2026-04-30 (commit `c484030`). Web subs go through LemonSqueezy (merchant of record — handles VAT/tax/global compliance). Native subs go through RevenueCat which abstracts App Store + Google Play. The two sides bridge via the LemonSqueezy webhook calling RevenueCat's promotional entitlement API, so a user who pays on web is recognised as paid on mobile.

- [x] **Code shipped — billing migration to LemonSqueezy + RevenueCat** ✅
      Migration `065` relocated billing columns to `user_profiles` + lock-billing trigger covers Lemon/RC/audit columns. `api/user-data.ts` exposes `lemon-checkout`, `lemon-webhook` (with RC bridge), `lemon-portal`, `revenuecat-webhook`. Frontend `BillingTab.tsx` branches on `Capacitor.isNativePlatform()` — web POSTs to `/api/lemon-checkout`, native dynamic-imports `@revenuecat/purchases-capacitor`. `useSubscription` exposes `provider` so the Manage button knows whether to call the LS portal or surface OS-settings hint.
- [x] **RevenueCat SDK integration shipped** ✅ (commit `3814d13`, 2026-05-06)
      Native flow now goes through RC paywall + Customer Center. `src/lib/revenuecat.ts` wraps the SDK (configure / login / paywall / customer-center / restore / listener — every export no-op on web). `src/hooks/useRevenueCatEntitlement.ts` provides optimistic-unlock React hook layered in front of the canonical `useSubscription()`. Boot wired in `src/Everion.tsx` (configure + login Supabase user.id; re-login on SIGNED_IN; logout on SIGNED_OUT). `BillingTab.tsx` `startNativeCheckout` now calls `presentPaywall()`; `handleManage` calls `presentCustomerCenter()`. **Implementation spec → `Specs/billing-revenuecat.md`.**
- [x] **Webhook idempotency** ✅
      `api/_lib/webhookIdempotency.ts` (replaces `stripeIdempotency.ts`) uses Upstash `SET NX` with 24h TTL, namespaced per provider (`lemon:event:<id>`, `revenuecat:event:<id>`). Both handlers also drop PROMOTIONAL-store RC events to avoid echo-loop with the bridge. **Caveat:** without Upstash configured the dedup is bypassed — see "Webhook idempotency fail-open" finding below.
- [ ] **LemonSqueezy live store configured** ❌
      **Step-by-step → `Setup/lemonsqueezy.md`** (store, products, variants, API key, webhook, test mode round-trip, go-live).
- [ ] **RevenueCat dashboard configured** ❌
      **Step-by-step → `Setup/revenuecat.md`** (RC project, iOS/Android apps, products import, entitlement `everion_mind_pro`, offering `default`, V2 paywall, customer center, webhook). Implementation spec: `Specs/billing-revenuecat.md`.
- [ ] **App Store Connect + Play Console products** ❌
      **Step-by-step → `Setup/ios.md` § Subscription products + `Setup/android.md` § Subscription products** (create matching `monthly` / `yearly` / `lifetime` products in both stores so RC can import them).
- [x] **Tax handling — solved by merchant-of-record** ✅
      LemonSqueezy is the merchant of record so SA VAT, EU VAT, US sales tax are all handled by them — no Stripe Tax / VAT registration needed for the web path. Mobile flows are taxed by Apple / Google in their respective regions automatically. (Original concern was around the R1M/year SA VAT threshold.)
- [ ] **Subscription cancellation flow tested** ❌
      End-to-end: subscribe (LS) → portal → cancel → confirm `lemon-webhook` `subscription_cancelled` fires → RC `revoke_promotionals` succeeds → user_profiles drops to free → BillingTab reflects new state.
- [ ] **End-to-end native sandbox test** ❌
      Once App Store Connect + Play Console products are live and TestFlight/internal track is up, run a sandbox subscribe → renewal → cancel cycle on a real device per platform. **Step-by-step test flow → `Specs/billing-revenuecat.md` § Test flow checklist** (paywall presents → optimistic isPro flip → canonical tier sync within 5s → cross-device tier match → cancel → free).

---

## P1 — Should have at launch

### Shared-brain notifications (fan-out)

- [ ] **Wire shared-brain expiry-reminder fan-out** 🟡
      Plumbing landed 2026-05-05. Migrations `075_brain_notification_prefs.sql` + `076_expiry_log_brain_id.sql` apply on next deploy. `handleCronHourly` has the expiry block gated by `FEATURE_SHARED_BRAIN_REMINDERS=1`, `/api/brain-notification-prefs` endpoint live, `Settings → Notifications` per-brain pills gated by `VITE_FEATURE_SHARED_BRAIN_REMINDERS=1`. Spec at `Specs/shared-brain-notifications.md`.
      Remaining to ship the feature:
      - [ ] Set `FEATURE_SHARED_BRAIN_REMINDERS=1` on Vercel (server) and `VITE_FEATURE_SHARED_BRAIN_REMINDERS=1` (client build) for staging.
      - [ ] Manual test: create test business brain with 2 members, add an entry with `due_date` 1 day out, run `cron-hourly` at the user's daily-time hour. Verify both members get push + bell row. Verify second cron run does not double-fire.
      - [ ] Set per-brain `level=off` for one member; verify they receive nothing.
      - [ ] Set per-brain `level=owner_only` for non-owner; verify they receive nothing.
      - [ ] Roll to beta cohort; observe for 7 days; flip flag on for production once stable.

### Quality

- [ ] **Lighthouse pass** ❌
      Run on production. Aim ≥90 Performance, ≥95 Accessibility, ≥95 Best Practices, ≥95 SEO. Fix anything red. Mobile + desktop both. 2026-04-30 local production preview baseline from Codex performance audits: mobile Performance 74, desktop Performance 96, mobile FCP 4.1s, LCP 4.5s. Trace: `EverionMindLaunch/Audits/archive/codex-performance-2026-04-30.md` and `EverionMindLaunch/Audits/archive/perf-first-paint-2026-04-30.md`.
- [ ] **E2E suite back to green** ❌
      `npm run test:e2e` failed 9/17 in the 2026-04-30 Codex audit. OmniSearch `cmdk` composition was fixed in `src/components/ui/command.tsx`; rerun Playwright and burn down remaining dialog/capture/delete/onboarding/schedule/search failures plus local `429` timezone-sync warnings. Trace: `EverionMindLaunch/Audits/archive/codex-2026-04-30.md` P1 E2E finding.
- [ ] **Real-device QA pass** ❌
      Critical at scale. Test on real iPhone Safari, real Android Chrome, Windows Chrome + Firefox, Mac Safari + Chrome. PWA install flow alone has ~6 paths across these.
- [ ] **Onboarding tested by 3 strangers** ❌
      Friends/family who haven't seen the app. Have them screen-record while you watch silently. Single highest-value thing on this list.
- [x] **Empty-state polish** ✅
      Every view should have a thoughtful empty state. Memory polished 2026-04-27 (`src/Everion.tsx`, concrete-examples helper). Vault: serif heading + italic subtext + "Add a secret" CTA (`src/views/VaultUnlocked.tsx:179-215`). Chat: serif heading + italic subtext + "Capture a thought" CTA when no entries; "Ask me anything" + suggestion buttons when entries exist (`src/views/ChatView.tsx:411-525`). Calendar: 2026-04-30 `DayAgenda` gained `addHint` prop — Day + Week tabs now show "↑ type above to add an event." under "Nothing scheduled.", Calendar/Month grid keeps the bare empty state since no QuickAdd sits above (`src/views/TodoCalendarTab.tsx:280-307`).
- [x] **Error messages user-friendly** ✅
      Shared `src/lib/friendlyError.ts` rewrites the common Supabase auth + network errors. Wired into auth flow, password reset, vault setup, and account settings. Pass-through preserved for unmapped messages.
- [x] **404 / unknown route handler** ✅
      `src/views/NotFound.tsx` renders for any path not in `KNOWN_PATHS` (`/`, `/login`, `/admin`) via `src/main.tsx`. e2e covered by `e2e/specs/404.spec.ts`.

### Communications

### Admin & support operations

- [x] **Internal admin CRM (user tiers + usage) MVP** ✅
      Shipped 2026-04-30 in commit `421e85d`. Settings → Admin tab now opens with a "Support CRM" section: search by email substring or UUID prefix, click a row to see Profile/Billing + this-month Usage + last 50 Audit events, and override tier inline with a required reason that lands in `audit_log` as `admin_tier_changed { actor_id, previous_tier, new_tier, reason }`.

      - [x] **Schema** — migration `066_admin_crm.sql` adds `user_profiles(tier)` index + two `SECURITY DEFINER` RPCs (`admin_list_users`, `admin_user_overview`) granted to `service_role` only. `user_usage` (031) and `audit_log` (057) reused as-is. Billing columns landed in migration `065` alongside the LemonSqueezy/RevenueCat work.
      - [x] **API** — `api/user-data.ts` exposes three resources: `admin_users` (GET, paginated search), `admin_user_overview` (GET, returns the three-card payload in one round-trip), `admin_set_tier` (POST, validates UUID + tier + reason, supports `Idempotency-Key` header, fire-and-forget audit_log write so logging hiccups can't undo a successful tier change). All gated on `app_metadata.is_admin === true` — non-admins get 403. Rate-limited per-action via `withAuth`'s `rateLimitKey`.
      - [x] **UI** — `src/components/settings/AdminCRMSection.tsx` rendered first inside `AdminTab.tsx`. Inline tier-change panel (no native confirm — design philosophy), tier badges with brand tokens, mono-font for IDs, three Card sections (Profile/Billing, Usage, Audit Timeline). Auto-loads most-recent users on first open.
      - [x] **Safety** — `admin_tier_changed` audit row on every mutation; `Idempotency-Key` namespaced as `admin_set_tier:<target>:<key>`; UUID + tier + reason all server-validated; 12-function Vercel cap respected.
      - [ ] **e2e admin smoke** ❌ — minimal Playwright spec: admin can search + view a user; non-admin gets 403. Acceptable to defer until first non-admin signs up.

- [ ] **Welcome email tested across clients** ❌
      Resend is configured. Verify rendering across Gmail, Outlook, Apple Mail. Use Mailtrap or send to real accounts.
- [ ] **Email sender domain SPF/DKIM/DMARC** 🟡
      `noreply@everion.smashburgerbar.co.za` — copy the records from <https://resend.com/domains> into the DNS provider for `smashburgerbar.co.za`. Step-by-step (including DMARC soak-then-tighten cadence) in `docs/launch-runbook-alerts-and-dns.md`. ~10 min.
- [ ] **Invite emails inbox-not-spam (full deliverability pass)** 🟡
      Reported 2026-05-04: invite emails landing in spam. SPF/DKIM/DMARC alone usually fixes it; the rest below is for cases where it doesn't.
      - [ ] **Domain auth** — SPF + DKIM + DMARC verified at <https://resend.com/domains>; DMARC starts `p=none; rua=mailto:dmarc@smashburgerbar.co.za` then escalates to `p=quarantine` after a week of clean reports.
      - [ ] **Score check** — paste a real invite into <https://www.mail-tester.com>. Target ≥9/10. Iterate on whatever it flags.
      - [ ] **From address** — switch from `noreply@…` to a real human at the brand domain (e.g. `christian@everion.smashburgerbar.co.za`). Personal first-name from-addresses survive Gmail/Outlook filters; `noreply` triggers them.
      - [ ] **Subject + preview** — "Christian invited you to Everion" beats "🎉 You've been invited!". No emoji, no urgency, no exclamation. First 90 chars of body should read like a sentence, not "view this email in your browser."
      - [ ] **Plain-text body** — Resend supports both. HTML-only is a spam signal.
      - [ ] **List-Unsubscribe + List-Unsubscribe-Post headers** — effectively required by Gmail in 2026 to dodge the bulk-sender penalty. Resend has a flag for this.
      - [ ] **One CTA link** — invite + unsubscribe only. Tracking pixels via Resend's domain (not a third-party tracker).
      - [ ] **Dedicated sending subdomain** — send transactional from `mail.everion.smashburgerbar.co.za` (or similar) so marketing reputation can never poison invites.
      - [ ] **Warm-up** — first 3 days, send to a handful of opted-in test inboxes only. Blasting 50 invites on a cold subdomain looks like a botnet.
      - [ ] **Parent domain blocklist check** — <https://mxtoolbox.com/domain/smashburgerbar.co.za>. If the parent is on a blocklist, the subdomain inherits the cloud — file a delisting request before launch.
      - [ ] **Real-inbox smoke test** — send the final invite to Gmail + Outlook + Apple Mail test accounts. Inbox not Promotions, no warning banner. Record the deliverability scorecard in `EML/Audits/<date>-email-deliverability.md` for the launch runbook.
- [x] **Customer support channel** ✅ — mailto:stander.christian@gmail.com surfaced in Landing footer + Settings → Account → Help row. Forward `support@everion.smashburgerbar.co.za` if/when a custom inbox is wanted.
      Where do users complain? Email link in app footer is the minimum. `support@` alias forwarded to your inbox.

### Design system / UI consistency (shadcn migration)

App audit on 2026-04-29 found ~298 hand-rolled UI instances across 49+ files with significant visual drift (5+ button padding variants, 4–18px border radii, hardcoded shadows, no z-index system). `components.json` is configured but `src/components/ui/` is empty. Migration to shadcn primitives (themed with existing design tokens) gives consistency, accessibility-by-default (Radix kbd nav + focus traps), and one-place restyle.

**Phase 1 — Safe wins (low risk, high impact)** 🟡

- [x] **Foundation** ✅ — shadcn primitives installed (Button, Input, Textarea, Card, Separator, Badge, Tabs, Switch, Checkbox, Label) at `src/components/ui/`. All semantic tokens (`--primary`, `--foreground`, `--background`, etc.) aliased to Everion tokens (`--ember`, `--ink`, `--bg`) so primitives auto-skin per `html.family-*` theme. `cn()` helper at `src/lib/utils.ts`. Button customised with `default`/`xs`/`sm`/`lg` sizes for mobile-friendly heights + `moss` variant + `destructive` routed to `--blood`.
- [x] **Button** ✅ — high-traffic surfaces migrated. ✅ done across DetailModal, CaptureEntryBody, ChatView, VaultView, LoginScreen, Landing, StatusPage, OnboardingModal, GmailSetupModal, BackgroundTaskToast, BackgroundOpsToast, TodoSomedayTab, NotificationBell, BulkActionBar, MemoryHeader, TodoQuickAdd, UpdatePrompt, TodoCalendarTab, every Settings tab via SettingsRow/SettingsButton. The remaining ~65 native `<button>` elements across DesktopSidebar nav rows, BottomNav FAB + tabs, EntryRow/EntryCard click areas, OnboardingModal example chips, and a handful of pill/choice-tile selectors (DetailModal type picker, ChatView suggestion cards, GmailSetupModal options, LoginScreen password-toggle) are intentionally bespoke — they're shaped fundamentally differently from `<Button>` (round FABs, multi-line tile cards, inline italic link-style toggles, ember-active pill chips). Same rationale as Input/Card/Badge — design system is more expressive than the standard primitive at these surfaces.
- [x] **Switch** ✅ — SettingsToggle now wraps shadcn Switch, cascading to every settings tab.
- [x] **Input + Textarea** ✅ (kept design system) — `design-input` is the project's family-aware input primitive (12 consumers + 6 family CSS overrides at `tokens.css` + `family-*.css`). Mass-replacing with shadcn Input would lose theme-aware focus rings + per-family styling. shadcn primitive remains available for any *new* form that needs a default-styled input; existing surfaces correctly use `design-input` class on raw `<input>`.
- [x] **Card** ✅ (kept design system) — zero shadcn Card consumers. Project deliberately uses `var(--surface)` containers with theme-aware borders + radius across 49+ component surfaces. Migration would lose family theming. Skipped.
- [x] **Separator** ✅ (kept design system) — only 2 standalone `<div height:1px>` candidates and neither was a divider (one a11y autofill trap, one progress-bar track). The 23 `borderTop: 1px solid var(--line-soft)` hits are styling on existing structural elements, not standalone dividers — replacing them would mean adding extra DOM. Skipped.
- [x] **Badge** ✅ (kept design system) — `design-chip` is the project's family-aware pill primitive (15 consumers + 6 family CSS overrides). Same theming-loss problem as Input/Card. Skipped.
- [x] **Tabs** ✅ — real segmented controls migrated 2026-04-30: `MemoryHeader.tsx` (Grid/List/Timeline) and `TodoView.tsx` (Day/Week/Month/Someday) now use `Tabs/TabsList/TabsTrigger`. `VaultUnlocked.tsx` (grid/list) was already migrated. Wins: keyboard arrow navigation + Home/End + ARIA roles for free. Excluded: `SettingsView.tsx` uses `aria-current="page"` (semantic = nav, not tab list) and `CaptureSheet.tsx` has no internal segmented control.
- [x] **Checkbox** ✅ — `BulkActionBar.tsx` and `VaultUnlocked.tsx` already use shadcn `Checkbox`. Remaining custom-styled checkbox dots in EntryCard/SomedayBulkBar are intentional visual treatments (ember-filled rounded squares, not standard checkboxes).

**Phase 2 — Stateful primitives (medium risk)** ❌

- [x] **DropdownMenu / Select / Popover** ✅ — full sweep done. `BrainSwitcher.tsx`, `BulkActionBar.tsx` (Change-type + brain multi-picker), `AdminTab.tsx`, `ProfileTab.tsx`, `ProvidersTab.tsx`, `NotificationSettings.tsx`, `CapturePreviewPanel.tsx` — all on shadcn primitives. Last holdout `CaptureBrainPill` in `CaptureSheet.tsx` migrated 2026-04-30 (manual escape/click-outside `useEffect` removed; Radix handles ARIA + keyboard nav for free). `MemoryHeader` uses a sort *cycle* button (not a dropdown), `OmniSearch.tsx` belongs to the Command/cmdk batch, `NotificationBell.tsx` is a rich notification panel (not a menu) — all correctly excluded.
- [x] **Sonner (toast library)** ✅ — Toaster mounted in Everion.tsx. `UndoToast.tsx` and `UpdatePrompt.tsx` migrated earlier. 2026-04-30: `BackgroundTaskToast.tsx` and `BackgroundOpsToast.tsx` rewritten as no-render hooks that watch their respective task arrays and emit `toast.loading()` / `toast.success()` / `toast.error()` per task ID via the shared sonner queue. Status transitions update the same toast in place, deletions dismiss, action CTAs (e.g. Gmail-scan "Review") use sonner's native `action: { label, onClick }`. `ConsentBanner.tsx` and `NudgeBanner.tsx` correctly excluded — neither is transient.
- [x] **Tooltip** ✅ — 2026-04-30 wraps applied to icon-only buttons in `MobileHeader` (search, menu), `DesktopHeader` (clear-search, theme toggle, account avatar), and `BulkActionBar` (delete, cancel). `TooltipProvider` already mounted in `Everion.tsx`. Other icon buttons on the page either pair with a visible label (DesktopSidebar nav rows, NotificationBell which opens its own panel) so tooltips would be noise.
- [x] **Accordion** ✅ — 2026-04-30 every `<details>` and every hand-rolled `[collapsed, setCollapsed]` pattern in Settings migrated. `AdminTab` (metadata JSON), `ClaudeCodeTab` (5 setup-guide details → one `<Accordion type="multiple">`), `GmailSyncTab` `GmailPromptDebug`, `ProfileTab` `CollapsibleSection` (rebuilt internals on `@radix-ui/react-accordion` primitive — preserves external API so 8+ call sites unchanged), `ProfileTab` `PersonaPromptDebug`. Net: zero `<details>` tags in src/, zero hand-rolled aria-expanded collapses in Settings. The legacy "6 files have setExpanded" note referred to stateful menus (BulkActionBar overflow, NotificationBell panel, OmniSearch, ChatDebugPanel, OnboardingModal) — those are popovers/menus, not accordions; correctly NOT migrated.
- [x] **Calendar + Popover** ✅ — 3 native `<input type="date">` instances replaced 2026-04-30: `TodoEditPopover.tsx`, `TodoCalendarEvent.tsx` (event editor), and `ScheduleInline` in `TodoSomedayTab.tsx`. New shared `DateField` component (`src/components/ui/date-field.tsx`) wraps `Calendar` (react-day-picker v9) + `Popover` with brand-themed CSS hooks (`.rdp-everion` in `index.css`). Trigger looks like the existing inline date inputs but pops a real calendar grid — no more OS-native UI. Bundle +76KB precache (react-day-picker + day-picker.css).

**Phase 3 — High-touch (high risk, requires care)** ❌

- [x] **Dialog** ✅ — all 7 modals migrated. 2026-04-30: `DetailModal.tsx` and `CaptureSheet.tsx` moved off `focus-trap-react` to Radix Dialog primitive. Body-scroll lock + focus trap + Escape now come from Radix (`react-remove-scroll`). Edit-aware Escape on DetailModal preserved via `onEscapeKeyDown`; preview-aware Escape/dismiss on CaptureSheet preserved via `onEscapeKeyDown` + `onPointerDownOutside`. Regression nets: `e2e/specs/dialog-detail-modal.spec.ts` and `e2e/specs/dialog-capture-sheet.spec.ts` (real-wheel body-lock check + ARIA + Escape + backdrop). `focus-trap-react` removed from `package.json`.
- [x] **Sheet (vaul)** ✅ — superseded by Dialog migration above. Drag-to-close (80px threshold + 200px rubber-band easing) was kept as the existing custom CSS-variable animation rather than ported to vaul, since the existing tuning is already real-device QA'd and the Radix Dialog wrap was the smaller, lower-risk diff. vaul can be revisited if drag-feel ever becomes a complaint, but shipping doesn't block on it.
- [x] **Command (cmdk)** ✅ — `OmniSearch.tsx` already migrated to shadcn `CommandDialog` with `CommandInput`, `CommandGroup`, `CommandItem`, `CommandShortcut`. Cmd/Ctrl+/ shortcut wires to `setOpen`; `scoreEntry` ranker still feeds prefiltered results so search relevance is unchanged. Verified 2026-04-30.
- [x] **window.confirm() removals** ✅ — both already replaced with branded inline UI (BulkActionBar two-tap pattern; settings/ProfileTab uses ConfirmDialog portal). Verified 2026-04-29.

**Cross-cutting cleanup (do as part of migration)**

- [x] **Standardise z-index** ✅ — 13-layer semantic scale defined in `src/index.css` as `--z-base` through `--z-native-overlay`. 16 component files swept to use tokens; no hardcoded numbers remain in active component code (commit 0f96f96, 2026-04-29).
- [x] **Standardise radius** ✅ — `--radius-sm/md/lg/xl/2xl/3xl/full` tokens already canonical and used across the app. No audit changes needed.
- [x] **Standardise shadows** ✅ — `--shadow-sm/md/lg/nav` tokens canonical; two stragglers swept (CaptureSheet + UpdatePrompt rgba → `var(--shadow-lg)`).

### PWA

- [x] **Service worker update flow tested** ✅
      Wired 2026-04-27 (commit `c6ec035`). `src/components/UpdatePrompt.tsx` calls `registerSW` from `virtual:pwa-register`, surfaces a "new version — refresh" toast on `needRefresh`, and posts `SKIP_WAITING` (sw.js handles it). `controllerchange` listener in `main.tsx` triggers reload. **Still owed:** smoke-test by shipping a deploy and confirming a returning user sees the toast.
- [x] **Offline mode tested** ✅
      Three-phase sprint shipped 2026-04-30. **Phase 1 audit:** 20-surface matrix scored each route (capture/entries/chat/vault/search/settings/admin) for boot, render, mutate, and recover behaviour while offline. **Phase 2 P0+P1 fixes:** per-brain entries cache (was single-key, blanked on brain switch), vault entries cache (mirrors AES-GCM ciphertext from server, IDB + localStorage fallback), `OfflineBanner` (top-of-app, role="status", offline + queue-drain modes), `OfflineScreen` reused for web standalone (was native-only), Supabase auth-refresh paused on `offline` event (was firing every 10s and burning retries), entry-update + entry-delete enqueued via `enqueueOfflineOp` instead of dropped, sonner-wired `showToast` (the lib/notifications bus had zero subscribers — every toast was being silently dropped, fixed by wiring directly to sonner), chat send shows calm "needs internet" toast and KEEPS typed text. **Phase 3 e2e:** `e2e/specs/offline.spec.ts` flips `context.setOffline(true)` + `dispatchEvent('offline')` and asserts banner visibility, cached list still renders, and banner clears on reconnect. (from `EML/Working/archive/2026-04-30-offline-first-audit.md`)

### Performance

- [x] **Public Landing split from authenticated boot** ✅
      Shipped 2026-04-30. `src/main.tsx` now lazy-loads both `App` and `Landing` and renders Landing on its own when the user lands at `/` with no auth signals (no `sb-*-auth-token` in localStorage, no magic-link hash, no `?invite=`). Anonymous visitors no longer pay for the App chunk's transitive graph (Supabase auth-js + postgrest-js + MemoryProvider + Everion shell). Returning users (with a session token in localStorage) bypass the Landing fast path and boot App immediately. Build output: separate `Landing-*.js` and `App-*.js` chunks. Frontend CTA on Landing flips state → `/login` pathname → App lazy-mount → LoginScreen renders.

- [ ] **Bundle size review** 🟡
      Run `npm run build`, check `dist/assets/`. Vite's `manualChunks` already splits supabase, sentry, pdfjs, mammoth, jszip. Watch the main chunk: if >500 KB gzipped, lazy-load more views. 2026-04-30 direct fixes: Sentry moved behind dynamic imports, PWA precache tightened, hashed JS cache changed to CacheFirst, launch font preload cut to Fraunces/Inter Tight/JetBrains Mono, duplicate manifest link removed, design-family remote `@import`s removed. 2026-04-30 audit follow-up: visualizer wired behind `BUNDLE_STATS=1 npm run build` (writes `dist/stats.html`) plus `node scripts/bundle-attribute.mjs lib- module-` for per-chunk gzip attribution. Findings: `lib-*` (95 KB gz) is mammoth.js — already lazy via `fileExtract.ts`, NOT in modulepreload list, paid only by .docx importers. `module-*` (60 KB gz) is posthog-js — already lazy behind consent. Replaced `radix-ui` meta-package with declared `@radix-ui/react-*` sub-packages across 18 files so each primitive splits into its own dist-* chunk and the unused set is tree-shaken from the eager modulepreload graph. Remaining: split public landing from authenticated Supabase boot, defer non-critical signed-in data prefetches. Trace: `EverionMindLaunch/Audits/archive/codex-performance-2026-04-30.md`.
- [ ] **Cold-start mitigation** 🟡
      First-paint matters most for new users. Test from a fresh browser, slow 3G throttle. Inline app shell exists; 2026-04-30 fixes removed Sentry from first-load graph, reduced font payload, reduced Workbox install pressure, and made cached hashed JS instant while online. Remaining: mobile Lighthouse must prove FCP <1.8s and LCP <2.5s. Trace: `EverionMindLaunch/Audits/archive/perf-first-paint-2026-04-30.md`.
- [x] **Supabase migration replay hygiene** ✅
      Duplicate `004_*` and `058_*` prefixes are cosmetic — Supabase's `schema_migrations` table tracks by 14-digit timestamp + name, not by filename prefix, so both pairs replay correctly. Documented in `supabase/migrations/README.md` (2026-04-30) with the next-free prefix convention and the rule that new migrations always append at the next integer (currently 064) rather than inserting between historical files. Renaming the existing duplicates would rewrite their `version` in `schema_migrations` and risk re-applying them on a fresh DB — rejected as more dangerous than the cosmetic flaw it solves.
- [ ] **Browser private-cache hardening** 🟡
      Entries, chat history, concept graphs, learning summaries, offline ops, and session vault keys touch local/session storage. Add a privacy mode plus TTL/encryption/clear-cache strategy for sensitive caches. Trace: `EverionMindLaunch/Audits/archive/codex-2026-04-30.md` P2 plaintext browser storage finding.
- [x] **ESLint warning burn-down** ✅
      Cleared 2026-04-30. From 73 → 0 in one pass: every `@typescript-eslint/no-explicit-any` in `src/` either narrowed to a real type or annotated with a single-line `eslint-disable-next-line` plus reason; every `react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps`, `preserve-manual-memoization`, and `use-memo` warning either fixed (e.g. `TodoView.tsx` `entries` wrapped in `useMemo`) or annotated with reason. `package.json` `lint` script now ratchets at `--max-warnings 0` so any new warning fails CI.
- [ ] **Re-verify Supabase Disk IO health on/after 2026-05-07** 🟡
      Migration `063_perf_rls_and_io.sql` (applied 2026-04-30, project `wfvoqpdfzkqnenzjxhui`) cleared all WARN-level perf advisors after a Supabase Disk IO Budget alert. Counters are unreliable until ~1 week of post-migration traffic. After 2026-05-07, run `mcp__plugin_supabase_supabase__get_advisors` (type=performance), check Gmail for any new "Disk IO Budget" alert, then run these SQL probes via `execute_sql`:
      ```sql
      -- 1. Indexes still unused after a week of traffic (now safe to drop, EXCEPT FK covers)
      SELECT relname AS table_name, indexrelname AS index_name, idx_scan,
             pg_size_pretty(pg_relation_size(indexrelid)) AS size
        FROM pg_stat_user_indexes
       WHERE schemaname = 'public' AND idx_scan = 0
       ORDER BY pg_relation_size(indexrelid) DESC;
      -- 2. Cache hit ratio per table — anything <99% = memory pressure / hot scans
      SELECT relname, heap_blks_read, heap_blks_hit,
             round(100.0*heap_blks_hit/NULLIF(heap_blks_read+heap_blks_hit,0), 2) AS hit_pct
        FROM pg_statio_user_tables
       WHERE schemaname = 'public'
       ORDER BY heap_blks_read DESC LIMIT 10;
      ```
      Do NOT drop `idempotency_keys_entry_id_idx` or `user_ai_settings_active_brain_id_idx` even if `idx_scan = 0` — those are FK covering indexes that protect parent UPDATE/DELETE.

---

## P2 — Post-launch backlog

### Shared brains — phase 2+ (deferred from 2026-04-28 brainstorm)

Phase 1 (solo multi-brain plumbing) shipped behind flag `multiBrain`. Spec: `docs/superpowers/specs/2026-04-28-shared-brains-design.md`. Decisions already locked, implementation deferred:

- [ ] **Phase 2: invites + members** — `brain_members`, `brain_invites` tables. POST `/api/user-data?resource=brains&action=invite` (email + link). Email-redemption flow via Resend (signup link → auto-join on first login). Member-list view in Settings → Brains tab. Owner can revoke invites.
- [ ] **Phase 2: roles** — owner / member / observer. Member = wiki-style edit any (locked: brainstorm Q3 = B). Observer = read-only.
- [ ] **Phase 2: RLS for shared access** — replace `brains_owner_all` with policies that grant SELECT to members/observers, INSERT/UPDATE/DELETE on entries to members + owner only. Service-role bypass for system jobs unchanged.
- [ ] **Phase 2: audit-log events** — `brain_invited`, `brain_joined`, `brain_member_removed`, `brain_role_changed` on the existing `audit_log` table (migration 053).
- [ ] **Phase 3: full management UX** — transfer ownership, delete brain with member confirmation broadcast, "leave brain" for members.
- [ ] **Phase 3: brain-level activity feed** — see who added/edited what, when (read from audit_log).
- [ ] **Phase 4: discovery / public brains** — out of scope for 2026; only revisit if community use case re-emerges.

### Enrichment pipeline — Phase 2A shipped, Phase 2B+3 deferred (2026-05-06)

Phase 2A (queue state + daily quota + claim worker) shipped behind the
existing enrichInline path — no behavior change for users. Full design
in `Specs/enrichment-queue-v1.md`. Migrations 081+082. Foundation for
the higher-leverage async work below.

- [x] **Phase 2A — queue + quota** ✅ commit `beecc65`. `enrichment_state`
  column on entries with partial index, `claim_pending_enrichments` RPC
  (FOR UPDATE SKIP LOCKED) for atomic worker claims, `user_enrich_quota`
  table + `consume_enrich_quota` RPC for daily tier-based limits
  (free=20/day, starter=200/day, pro/max=unlimited). Stale-claim
  recovery (>5min). Backward compatible with every existing call site.
- [x] **Pre-Phase-2A enrich hardening** ✅ commits `3bb1be1`, `9302207`,
  `9b403ca`. (1) Dropped invalid Anthropic env path — pro/max env-managed
  enrichment now routes to Gemini per `CLAUDE.md`. (2) Awaited
  `enrichInline` on every entry-creation door (chat/MCP/v1 had been
  fire-and-forget; only capture awaited). (3) Added hourly cron sweep as
  safety net. (4) `last_skip_reason` breadcrumb on silent LLM failures.
  (5) Enrichment now reads `metadata.attachment_text` + `metadata.full_text`
  via `buildEnrichText` so PDF email attachments feed into all 4 LLM
  steps. (6) `metadata.ai_summary` stamped on Gmail entries; card +
  DetailModal prefer it over thin scan-time content. (7) Auto-accepted
  Gmail entries trigger extract+enrich at scan time.
- [ ] **Phase 2B — async capture / fire-fast (P2 deferred).** Switch
  capture/llm/mcp/v1 from `await enrichInline` to fire-fast — entry
  returns `state='pending'` instantly, worker drains within ~1min.
  Trade: capture latency drops from 3-5s to <200ms, but UI shows red
  P/I/C chips for ~30-60s post-capture (need Supabase realtime
  subscription to flip when worker completes). **Trigger:** when
  capture latency or function concurrency limits become user-visible.
  Probably ~3000-5000 active users.
- [ ] **Phase 3 — Vercel Queues / Inngest migration (P2 deferred).**
  When the cron worker can't keep up (~10k+ active users): move from
  cron-driven sweep to event-driven worker, per-user round-robin
  scheduling, step-level durability + exponential backoff. Vercel
  Queues (Beta) is lowest-friction; Inngest is best-in-class for
  workflow durability. Cost ~$50-200/mo. Triggered by p95 cron drain
  time exceeding 1h.

### Gmail pattern rules — shipped (2026-05-06)

- [x] **Phase 1+2+3 — scored accept/reject patterns** ✅ commits `c54edaf`
  + `0986412`. Migration 080. Decoupled accept/reject scores 0–10
  (Alt 1), 7-day probation, hard-block at score 10, contested-state
  flagging. Pre-filter at scan saves embedding + classifier costs.
  Settings UI to view/edit/delete patterns. Probation badge on staging
  inbox. Full design in `Specs/gmail-pattern-rules.md`.
- [ ] **Phase 4 — smarter scoring (P2 deferred).** Wilson lower bound
  (Bayesian confidence) and/or EWMA temporal decay (90-day half-life)
  layered onto current model. Trigger: when users complain about
  "rejected this 3 months ago, why is it back?" Centroid drift via EMA
  on each match would also fit here.
- [ ] **Phase 4 — UX (P2 deferred).** "Test pattern" diagnostic tool,
  pattern merge/split affordances when cosine > 0.95 / contested-state
  patterns surface for splitting.

### Other backlog

- [ ] **More e2e specs** — calendar persona-facts still owed. **Updates:** `404.spec.ts` and `search.spec.ts` (3 sub-tests) shipped 2026-04-27. `vault.spec.ts` smoke layer shipped earlier. `important-memories.spec.ts` shipped 2026-04-29 (full happy path: create → filter chips → retire → API cleanup). `delete-cascade.spec.ts` and `schedule.spec.ts` shipped 2026-04-29 (capture → delete → undo → API cleanup; Schedule Day/Week/Month tab routing).
- [x] **Public status page** ✅ — `/status` lives at `https://everion.smashburgerbar.co.za/status`. Polls `/api/status` every 30s, shows API/DB/AI provider up/down. Public, no auth, edge-cached 15s + SWR 60s. Renders ahead of the auth gate so it works even when Supabase auth itself is down. Built 2026-04-28.
- [x] **Sentry source maps** ✅ — `@sentry/vite-plugin` wired in `vite.config.js`, conditional on `SENTRY_AUTH_TOKEN` + `VITE_SENTRY_DSN`. Maps deleted post-upload so they're not publicly fetchable.
- [ ] **PostHog cohorts + funnels** — set up after a week of real data. Don't pre-cook.
- [x] **Operational runbook** ✅ — `RUNBOOK.md` covers top-5 failure modes + Vercel rollback procedure.
- [x] **Rollback procedure documented** ✅ — covered in `RUNBOOK.md`. One-click in Vercel dashboard → Deployments → ⋯ → Promote to Production.

---

## Owner-only tasks (Christian's flat to-do list)

Distilled from the rest of the file. **Only items that require Christian — clicking dashboard buttons, paying for things, talking to humans, making business decisions.** Code work is tracked in the sections above. Updated 2026-04-28.

### 🚨 Before public launch (P0 — ordered by impact)

- [ ] **Upgrade Supabase to Pro** ($25/mo). No backups exist on Free tier. <https://supabase.com/dashboard/project/wfvoqpdfzkqnenzjxhui/settings/billing>
- [ ] **Upgrade Vercel to Hobby → Pro** ($20/mo). Hobby times out functions at 60s; `vercel.json` already requests 300s.
- [ ] **Add `SUPABASE_DB_URL` secret to GitHub repo**. Settings → Secrets and variables → Actions → New secret. Get the URI from Supabase → Project Settings → Database → Connection string → URI (Session pooler, port **5432** not 6543). This activates the daily DIY backup workflow until Pro is on.
- [ ] **Trigger first DB backup**: `gh workflow run db-backup.yml` then `gh release list` to confirm `backup-2026-04-28` lands.
- [ ] **Rotate keys** exposed in any AI/chat session: Resend, Groq, Upstash REST token, CRON_SECRET, VAPID private key. Don't rotate Supabase keys mid-launch (logs everyone out).
- [ ] **Configure Sentry alerts** — 3 rules from `docs/launch-runbook-alerts-and-dns.md`: error-rate spike (>10/min), new issue type, slow `/api/llm`+`/api/capture` p95. ~5 min.
- [ ] **Confirm SSL grade A** on <https://www.ssllabs.com/ssltest/analyze.html?d=everion.smashburgerbar.co.za>.
- [ ] **Confirm DNS A + AAAA records** for `everion.smashburgerbar.co.za`. Dig from a public resolver: `nslookup everion.smashburgerbar.co.za 1.1.1.1`.
- [ ] **Configure Resend SPF / DKIM / DMARC** for `noreply@everion.smashburgerbar.co.za`. Records in <https://resend.com/domains>; paste into your DNS provider for `smashburgerbar.co.za`. Verify at <https://www.mail-tester.com> — aim for 10/10.
- [ ] **Customer support channel**: forward `support@everion.smashburgerbar.co.za` to your inbox. Add the link in app footer.

### 💳 LemonSqueezy + RevenueCat (only if billing is part of launch)

- [ ] **LemonSqueezy live products + env vars**: create the two variants in LS dashboard, copy variant ids to `LEMONSQUEEZY_STARTER_VARIANT_ID` + `LEMONSQUEEZY_PRO_VARIANT_ID`, set `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET` in Vercel env. Point webhook URL at `https://everion.smashburgerbar.co.za/api/lemon-webhook`.
- [ ] **RevenueCat dashboard + env vars**: create RC project, register iOS + Android app entries, store entitlements `starter` / `pro`. Vercel env: `REVENUECAT_SECRET_API_KEY` + `REVENUECAT_WEBHOOK_AUTH`. Vite-side env (build-inlined): `VITE_REVENUECAT_API_KEY_IOS` + `VITE_REVENUECAT_API_KEY_ANDROID`. Webhook URL → `/api/revenuecat-webhook`.
- [ ] **App Store Connect + Play Console subscription products**: register matching `everionmind.starter.monthly` + `everionmind.pro.monthly` SKUs in both stores; link to RC entitlements.
- [ ] **VAT — handled by merchant of record**: LemonSqueezy bills VAT for you globally, no SA registration needed for the web path. Mobile is taxed by Apple / Google in their own regions.
- [ ] **End-to-end subscription cancellation test**: subscribe → portal → cancel → confirm `lemon-webhook` `subscription_cancelled` → RC `revoke_promotionals` → DB → user sees free tier.

### 📊 Weekly roll-up email setup

Eight GitHub Actions secrets to add (Settings → Secrets and variables → Actions). Detailed in the Telemetry section above. ~10 min if API portals cooperate.

- [ ] `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- [ ] `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`
- [ ] `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`
- [ ] `RESEND_API_KEY` (duplicate from Vercel env)
- [ ] `WEEKLY_REPORT_TO` (your email)
- [ ] **Dry-run** the first send with stdout-only mode, eyeball numbers, then flip to live.

### 👥 People stuff (P0 + P1 — cannot be delegated)

- [ ] **Onboarding test with 3 strangers** — friends/family who haven't seen the app. Have them screen-record while you watch silently, no coaching. Single highest-value pre-launch task. Today/this week.
- [ ] **Real-device QA pass**: real iPhone Safari, real Android Chrome, Windows Chrome + Firefox, Mac Safari + Chrome. PWA install flow on each. ~1 hr.
- [ ] **Co-admin on every dashboard** (bus factor): Vercel team, Supabase organization, LemonSqueezy, RevenueCat, App Store Connect, Play Console, Sentry, PostHog, Resend, Upstash, GitHub repo. ~10 min/provider × 8 = 80 min total.
- [ ] **Optional but cheap insurance**: 30-min legal review of `src/views/PrivacyPolicy.tsx` + `src/views/TermsOfService.tsx` drafts before launch. Plain English drafts exist; lawyer-vet for ZAR-jurisdiction.

### 🔗 Visibility (small but high-leverage)

- [x] **Pin `/status` link** in landing-page footer + login screen "having trouble?" link ✅ (support email signature still owed when sender domain is configured)
      `src/views/Landing.tsx` Support footer column gains "Service status" → `/status`. `src/LoginScreen.tsx` privacy/terms row gains "Having trouble?" → `/status`. Shipped 2026-04-29.

### 🗓️ One-time then quarterly

- [ ] **Test the Supabase backup restore once** — see "Test Supabase backup restore" item above for the 15-min procedure. Repeat every 90 days.

### 🔋 Performance (do once before launch)

- [ ] **Run Lighthouse on production**: target ≥90 Performance, ≥95 Accessibility, ≥95 Best Practices, ≥95 SEO. Fix anything red. Mobile + desktop both. (Weekly synthetic audit already running, but eyeball the numbers once before opening signups.)
- [ ] **Bundle-size eyeball**: `npm run build`, look at `dist/assets/`. If main chunk >500 KB gzipped, lazy-load more views.

---

## What to do this week, in order

1. **Onboarding stranger test** — 3 people, this week, before another line of code. _Cannot be delegated to Claude — needs Christian to recruit._
2. **Vercel Pro upgrade** — flip the switch when ready ($20/mo).
3. **Add the 8 GitHub Actions secrets** for the weekly roll-up (see Telemetry section). 10 min if API portals cooperate.
4. **Optional: legal review of Privacy + ToS** — both are drafted in plain English (P0 unblocked), but a 30-min lawyer pass before launch is cheap insurance.

The rest is a 2-week backlog. Don't try to do everything before launch — you'll never launch. Pick the three things that scare you most and do those first.

---

## Findings from readiness audit (2026-04-27)

New items surfaced by the cross-dimensional audit. Grouped by priority. None are paper-cuts; each one has either a security, stability, or first-impression blast radius for a public launch.

### P0 — Stability-critical (do before opening public signups)

- [x] **AI provider calls have no retry / backoff** ✅
      Embedding paths shipped 2026-04-28. `api/_lib/aiProvider.ts` already had `fetchWithRetry` (100ms → 400ms → 1.6s, 5xx + 429 + network) for all three adapters (Anthropic / OpenAI / Gemini). `api/llm.ts` Groq transcription wired with the same pattern 2026-04-29 (400ms → 1.2s → 3s).

- [x] **Inner ErrorBoundaries on risky views** ✅
      `src/Everion.tsx` wraps `ChatView`, `VaultView`, `CaptureWelcomeScreen`, `GraphView`, `TodoView` each in their own `<ErrorBoundary name="..." fallback={ViewError}>`. A render error in one view shows a localized fallback instead of blowing away the shell.

- [x] **Idempotency only on capture + payment webhook** ✅
      Closed 2026-04-30. New `reserveActionIdempotency()` in `api/_lib/idempotency.ts` covers non-entry write paths via namespaced keys. Wired into `handleVault` POST (`vault-setup:<idem>`), `handleApiKeys` DELETE (`apikey-revoke:<id>:<idem>`), and `admin_set_tier` POST (`admin_set_tier:<target>:<idem>`) in `api/user-data.ts` — all honour an optional `Idempotency-Key` header, replay short-circuits, action failure releases the slot via `releaseIdempotency`. Capture and the Lemon/RevenueCat webhooks have their own SET-NX dedup via `webhookIdempotency.ts`.

- [x] **Health check 5xx on degraded deps** ✅
      `handleHealth` in `api/user-data.ts:493` tests db + Gemini + Groq + Upstash, builds a `failures[]` array, returns **503** when any required dep is down (200 only when fully green). External monitors now see real outages.

- [x] **PII redaction in `api/_lib/logger.ts`** ✅
      `redact()` runs both base context and per-call extras through a regex matcher (`/(password|passwd|secret|token|apikey|api_key|key|jwt|cookie|session|email|authorization|bearer)/i`) with a 4-deep recursion cap. Substring match → no typo can slip through.

### P0 — Security defense-in-depth

- [ ] **CSP `style-src 'unsafe-inline'`** 🟡
      `vercel.json` line 59. Required today because the codebase uses inline `style={...}` on a lot of components. Long-term fix: nonce-based CSP (Vite supports it via `__webpack_nonce__` analog) or move to CSS-in-JS with hash-based source. Short-term: at least lock down `script-src` (already only `'self'` + posthog/vercel — good), document the inline-style allowance and the migration plan.

- [x] **Rate-limit fail-open audit** ✅
      Shipped 2026-04-30. `api/_lib/rateLimit.ts` now trips a circuit breaker after 3 consecutive Upstash failures (HTTP non-2xx OR thrown error) — open for 5 min, every call during that window returns false (denied) so endpoints fail closed instead of silently falling back to per-instance in-memory limiting that gives zero protection in serverless. Successful Upstash response resets the failure counter and clears the breaker. Local dev (`!process.env.VERCEL`) still uses in-memory for convenience. Bonus: separate `rateLimitKey` derivation added to `withAuth` so action/resource queries get their own bucket — `/api/entries?action=gmail-prompt` no longer shares its budget with the memory-feed list call (was 429-ing the admin "Live Gmail Prompt" panel after a normal session).

- [ ] **Webhook idempotency fail-open without Upstash** 🟡
      `api/_lib/webhookIdempotency.ts` (Lemon + RC) returns `{ firstTime: true }` if Upstash isn't configured, so without Redis the dedup is bypassed. Today this is fine because the webhook handlers PATCH to fixed state and the RC bridge `grantEntitlement` is idempotent on RC's side, but it's a trap for any future incrementing operation. Either fail closed (503 with Retry-After) or document the constraint inline.

### P1 — UX & accessibility

- [x] **Modals trap focus** ✅
      All modals on Radix Dialog primitive (`OnboardingModal`, `VaultRevealModal`, `CreateBrainModal`, `MoveToBrainModal`, `ProfileTab.RejectDialog`, plus `DetailModal` + `CaptureSheet` migrated 2026-04-30). Focus trap, body-scroll lock, and Escape come from Radix's `react-remove-scroll`. `focus-trap-react` removed from `package.json`.

- [x] **Skip-to-main-content link** ✅
      `src/Everion.tsx:267` ships `<a href="#main-content" className="sr-only focus:not-sr-only">` with the counterpart `id="main-content"` on the view wrapper at line 388.

- [x] **Empty-state CTAs on Vault + Chat** ✅ (Calendar N/A — month grid IS the visualization)
      `VaultView` empty state has icon + heading + helper + "Add a secret" CTA. `ChatView` no-memory state has heading + helper + "Capture a thought" CTA wired to `onNavigate("capture")`. Calendar's grid renders even with zero events; no separate empty-state surface to add a CTA to.

- [ ] **Settings sidebar density** 🟡
      14 \*Tab.tsx files (Account, Profile, Brain, Data, Appearance, AI, Providers, Security, Calendar Sync, Gmail Sync, Claude Code, Billing, Danger, Admin). For a non-technical first-time user this is decision fatigue. Either collapse to 5–6 logical groups with sub-sections, or hide the technical tabs (Providers, Claude Code, Admin) behind a "Developer" toggle.

- [x] **Mandatory first-run walkthrough — step 1 forced** ✅
      Shipped 2026-04-30. `src/components/OnboardingModal.tsx` no longer renders the Skip control while `step === "capture"` (the first step). Users must traverse step 1 — pick an example, type something, save & continue, OR use sample data — before the dismiss control re-appears. Skip stays available on step 2/3 because the AI demo there is non-deterministic and we don't want users stranded on a Gemini failure. Spec updated: `e2e/specs/onboarding.spec.ts` asserts Skip absent on step 1, present after capture.

### P1 — Performance

- [x] **Sequential `/api/*` calls on cold load** ✅ — shipped in commit `92ff14d`. `src/hooks/useDataLayer.ts:168` now uses `Promise.all([...])` to fan out vault status, vault entries, and search-graph prefetch in parallel.

- [x] **`entryRepo.list` cursor pagination** ✅ — shipped in commit `92ff14d`. `src/lib/entryRepo.ts` now exposes `{ entries, nextCursor, hasMore }`; first call grabs the configured page size, follow-ups stream in. No more 2–3 s blocking fetch for >5k-entry accounts.

- [x] **`public/og.png` compressed** ✅ — down from 41 KB to 8.9 KB (commit `92ff14d`). Below the 15 KB target, no need to ship a separate `.webp`.

- [x] **No `loading="lazy"` on user-uploaded image content** ✅ (N/A)
      Audited `src/`: there are no `<img>` or `<Image>` tags rendering user content. Image extraction goes through Gemini multimodal at capture time and returns extracted text — the binary is never displayed back. Nothing to lazy-load.

### P1 — Maintainability

- [x] **`as any` casts in `src/`** ✅ — down to **6** (from 59 → 32 → 19 → 6 across multiple sessions). Remaining 6 are all legitimate: 3 in `src/lib/fileExtract.ts` (`mod.default ?? mod` ESM compat), 1 in `src/hooks/useEntryRealtime.ts` (Supabase channel typing quirk, has eslint-disable), 1 in `src/lib/enrichEntry.ts` (comment-only), 1 in `src/views/TodoCalendarTab.tsx` (comment-only). All structural casts promoted to first-class fields on `Entry` in `src/types.ts` (open `[key: string]: unknown` index signature). All 49 `catch (e: any)` patterns converted to `e instanceof Error ? e.message : String(e)` narrowing — **zero remaining**. Lint ratchet down to **212** warnings (from 297, -85).

- [x] **All three god-components split** ✅
      ✅ `src/views/TodoCalendarTab.tsx` (was 1576) split into 4 files: orchestrator 430, `todoCalendarHelpers.ts` 244, `TodoCalendarChrome.tsx` 529, `TodoCalendarEvent.tsx` 480.
      ✅ `src/views/VaultView.tsx` (was 1207) split into 5 files: router 101, `VaultLoading.tsx` 184, `VaultSetup.tsx` 184, `VaultGate.tsx` 346, `VaultUnlocked.tsx` 540.
      ✅ `src/components/EntryList.tsx` (was 918) split into 3 files: orchestrator 244 (VirtualGrid + VirtualTimeline), `EntryCard.tsx` 424, `EntryRow.tsx` 276.
      No file in `src/` exceeds 540 lines now (Everion.tsx is the new ceiling at ~700, and that's the top-level shell).

- [x] **e2e for vault unlock + delete cascade** ✅ — `vault.spec.ts` covers vault flow; `delete-cascade.spec.ts` (2026-04-29) covers entry → delete → undo → permanent-delete API backstop.

### P1 — Compliance follow-ups

- [ ] **Sender domain SPF / DKIM / DMARC** ❌
      `noreply@everion.smashburgerbar.co.za` sends auth links + (eventually) weekly digests. Confirm DNS records are configured so email lands in inbox, not spam. mail-tester.com gives a 10/10 score with all three.

- [ ] **30-min legal review of Privacy + ToS drafts** 🟡
      Drafts exist in `src/views/PrivacyPolicy.tsx` + `src/views/TermsOfService.tsx`. Plain English, not lawyer-vetted. Cheap insurance: pay a SA attorney to glance at both before launch.

### P2 — Post-launch hardening

- [x] **Remove `as any` ratchet** 🟡 — `npm run lint` now uses `--max-warnings 297` so any new warning fails CI. Count can only drift down. Existing 32 `as any` casts in src/ + tests are documented; per-cast cleanup is multi-session work that can happen as types are refined. Once count hits 0 the rule flips to `error`.
- [x] **Settings consolidation** ✅ — collapsed 12 sections to 5 (Personal / Account / Brain / Connections / Privacy & danger) + Admin gated. URL aliases preserve OAuth callbacks and `?tab=billing` deep links from /api/capture and /api/llm.
- [ ] **CSP nonce migration** — drop `'unsafe-inline'` from `style-src`. Plan a one-week migration once inline-style hotspots are mapped.
- [x] **Per-user audit log table** ✅ — `audit_log` exists in production with 369 rows since 2026-04-25, written by `api/capture.ts`, `api/entries.ts`, `api/llm.ts`. RLS lets users read their own rows. Migration `057_audit_log.sql` ratifies the schema (idempotent — table was added inline in `000_init.sql`).
- [ ] **Audit-log UI surface** — show users their own activity in `/settings/security`. Backend ready (RLS done); just wire a paginated table reader.

### Operations & bus factor (added 2026-04-28)

- [x] **Staging Supabase project** ✅ — `everion-staging` (`rsnrvebcjbstfxhkfsjq`, eu-west-1, free tier, $0/mo). Schema mirrors production via `supabase/migrations/*.sql`. URL + anon key in `.env.example`. Workflow: apply new migrations to staging FIRST, verify, THEN apply to production. Drift check reminder saved to Christian's Everion memory for 2026-05-28.
- [x] **Pin `/status` link somewhere user-visible** ✅ — landing footer + login "Having trouble?" wired 2026-04-29. Support email signature still owed once sender domain is configured.
- [ ] **Co-admin on every dashboard** ❌ — bus factor. Add a second admin (wife / co-founder / trusted contractor) to: Vercel team, Supabase organization, LemonSqueezy, RevenueCat, App Store Connect, Play Console, Sentry, PostHog, Resend, Upstash, GitHub repo. ~10 min per provider; total ~90 min.
- [ ] **Test Supabase backup restore** ❌ — depends on the Pro-upgrade above. **Currently on Free tier (no automated backups exist).** Once Pro is on, backups run daily automatically with 7-day retention; this item becomes a one-time dry-run + a quarterly habit. A backup you've never restored is a hope, not a backup.

  **Step 0: confirm Pro is active** (1 min, after you've upgraded)
  - Open <https://supabase.com/dashboard/project/wfvoqpdfzkqnenzjxhui/database/backups>
  - You should see 7 daily entries. If empty, you're still on Free — see "Supabase Pro upgrade" item above.

  **Step 1: dry-run a restore to a fresh project** (15 min, do this once before launch)
  - Backups page → pick any daily backup → "Restore"
  - **Choose "Restore to new project"** (NOT in-place; in-place is destructive)
  - Wait ~5 min for the new project to provision
  - Open SQL editor on the restored project: `SELECT COUNT(*) FROM entries;`
  - Row count should match production at the backup snapshot time. If it does, restores work.
  - Delete the test project so it doesn't sit on your bill.

  **Step 2: re-run quarterly**
  - 15 min every 90 days. The only way to know backups are real and not just claimed.

  **Optional: PITR add-on (~$100/mo)** — restore to any second, not just daily snapshots. Toggle in dashboard → Settings → Add-ons. Worth it if your data is irreplaceable; for a memory app where users can re-import, daily is probably enough.

  **What backups DON'T cover**
  - Auth users are backed up on the same schedule (different schema, same dashboard restore).
  - Storage objects need separate config — N/A here, you don't use Supabase Storage.
  - Vault crypto material — vault uses passphrase-derived keys the server can't read. Backups capture the encrypted blobs but a user who forgets their master password can't recover, backup or no backup. By design.

---

## Mobile app launch — Capacitor wrap (Google Play first, App Store deferred)

Separate launch track from the web product. Web launches first (PWA at everionmind.com); Capacitor wrap follows. Items below block native-app submission, not the web launch.

> **🤖 ANDROID-FIRST DECISION (2026-05-05)**: Apple App Store submission is **deferred to a post-launch sprint** (see § Post-launch — iOS launch sprint). Capacitor treats iOS / Android as fully independent native projects — there is zero coupling.
>
> **Why Android first**: Play Console review is hours, not days; $25 one-time vs Apple's $99/yr + tax forms + bank verification; we get a real-user platform iterating on metrics while iOS goes through its own review later. Half-platform billing QA (RevenueCat sandbox covers Android only until iOS ships) is the only meaningful tradeoff and is acceptable for staged rollout.
>
> **iOS-only items below are tagged `[iOS — DEFERRED]`** and consolidated in the post-launch section. Don't burn calendar on them now — they'd just rot.

**Decided 2026-04-29:**

- Wrap technology: **Capacitor 6** (single TS source, native shell per store)
- Stores at launch: **Google Play only**. Apple App Store deferred to post-launch sprint.
- Apple primary category (when iOS ships): **Utilities**, secondary: Productivity `[iOS — DEFERRED]`
- Google Play primary category: **Productivity** (Play's Utilities is dominated by system tools — flashlights/cleaners — wrong neighborhood)
- Bundle identifier (both): `com.everionmind.app`
- Tagline: _"your second brain — kept quietly."_

### Implementation playbook — Capacitor wrap

The smallest serious implementation that gets Everion into the App Store and Google Play without fragmenting the codebase. Wrap the existing PWA — do not rebuild in React Native, do not fork product logic, do not create mobile-only tables. Same backend, same data model, same React app.

**Why Capacitor:** Everion is already React + PWA + Supabase + web-first + Vercel. Capacitor keeps that architecture and adds native iOS/Android containers around it.

```
Everion Web/PWA
        ↓
Capacitor iOS App
Capacitor Android App
        ↓
App Store / Google Play
```

#### Build order (do in this sequence — Android first because iOS auth is fiddlier)

- [x] **1. Install Capacitor** ✅ (commit 5fab46c, 2026-04-29)
  ```bash
  npm install @capacitor/core @capacitor/cli
  npx cap init
  ```
  App name: `Everion Mind` · App ID: `com.everionmind.app` (the bundle ID already decided above — do not casually change it).

- [x] **2. Configure `capacitor.config.ts`** ✅
  ```ts
  import type { CapacitorConfig } from '@capacitor/cli';
  const config: CapacitorConfig = {
    appId: 'com.everionmind.app',
    appName: 'Everion Mind',
    webDir: 'dist', // confirm against actual `npm run build` output
    server: { androidScheme: 'https' },
  };
  export default config;
  ```

- [x] **3. Add native platforms** ✅
  ```bash
  npm install @capacitor/ios @capacitor/android
  npx cap add android
  npx cap add ios
  ```
  Commit `ios/` and `android/` to the repo.

- [x] **4. Build the web app** ✅
  ```bash
  npm run build
  ```
  Fix every build error before continuing.

- [x] **5. Sync into native shells** ✅ — `npm run cap:sync` script wired
  ```bash
  npx cap sync
  ```
  Re-run on every web rebuild, config change, or new plugin.

- [x] **6. Open native projects** ✅ — `npm run cap:android` / `cap:ios` scripts wired (user runs to open Android Studio / Xcode)
  ```bash
  npx cap open android   # Android Studio
  npx cap open ios       # Xcode
  ```

- [ ] **7. Get Android running on a real device first.** Easier path. Resolve build, signing, and basic launch issues here before adding iOS complexity.

- [ ] **8. Get iOS running on a real device.** TestFlight build at minimum. `[iOS — DEFERRED]`

- [x] **9. Fix Supabase magic links** ✅ — schemes registered in iOS Info.plist + Android intent filter; `src/lib/capacitorBridge.ts` handles `appUrlOpen` and hands tokens to `supabase.auth.setSession()`/`exchangeCodeForSession()`. **Still owed:** real-device verification (cold + warm start).

- [x] **10. Add icons + splash screen** ✅ — generated from `public/favicon.svg` via `sharp` + `@capacitor/assets`; 136 Android variants, 13 iOS variants, 7 PWA WebP. Brand-correct espresso/ivory + dark-mode variant.

- [x] **11. Add offline / no-connection state** ✅ — `src/components/NativeOfflineScreen.tsx` mounts on native + no session + no network; `useOfflineSync` extended to subscribe to `@capacitor/network`.

- [ ] **12. Real-device testing pass** (full checklist below).

- [ ] **13. Prepare store assets** (covered by M2/M3/M4 below).

- [ ] **14. Submit to internal testing** (TestFlight + Play Internal Testing).

- [ ] **15. Submit to production** App Store + Play Store review.

#### App-feel requirements (don't ship a "website in a box")

- [ ] **App icon + splash screen** — not generic Capacitor defaults.
- [ ] **Safe-area handling** — top/bottom inset paddings respect notch and home indicator on iOS, gesture nav on Android.
- [ ] **No browser-looking UI** — no visible URL bar, no back button that looks like a browser back, no pull-to-refresh that feels like Safari.
- [ ] **Offline / no-internet screen** — calm copy, no infinite spinner.
- [ ] **Mobile-friendly loading states** — skeletons not spinners where possible.
- [ ] **Mobile-friendly auth flow** — magic links, no clipboard token gymnastics.
- [ ] **Deep-link / magic-link redirects** — see auth section.
- [ ] **File / photo upload support** — if `entries` accept images on web, they must on mobile too.

#### Auth & deep linking — Supabase magic links

The hardest part. Mobile auth must reach the app, not bounce to a browser.

- [ ] **Add mobile redirect URL schemes**
  - `everion://auth/callback`
  - `com.everionmind.app://auth/callback`
- [ ] **Configure Supabase** — add both schemes to Auth → Redirect URLs.
- [ ] **iOS** — register URL scheme in `Info.plist` (`CFBundleURLTypes`). Add Associated Domains entitlement if also using universal links.
- [ ] **Android** — add intent filter to `AndroidManifest.xml` for the scheme on the launcher activity.
- [ ] **Verify the flow end-to-end on a real device**:
  - User requests magic link
  - User taps link in email
  - Link opens Everion mobile app (not a browser)
  - Session is completed inside the app
  - User lands logged-in
- [ ] **Cold-start case** — opening from link with the app killed must work.
- [ ] **Warm-start case** — opening from link with the app already running must work.
- [ ] **No leftover browser tab** — magic-link redirect must not strand the user in Safari/Chrome.

#### Native plugins (V1 — keep minimal)

Only add what's needed before launch. Each plugin is a maintenance liability.

- [ ] `@capacitor/splash-screen` — splash control
- [ ] `@capacitor/app` — back button, app state, URL handling
- [ ] `@capacitor/browser` — in-app browser for external links
- [ ] `@capacitor/network` — offline detection
- [ ] `@capacitor/preferences` — small key-value storage if Supabase session needs it
- [ ] `@capacitor/filesystem` — only if file upload requires it
- [ ] `@capacitor/camera` — only if entry capture from camera ships in V1
- [ ] **Biometric auth plugin** (`capacitor-native-biometric` or `@aparajita/capacitor-biometric-auth`) — required for the Vault PIN+biometric unlock item under "Vault — beyond V3 narrow scope". Native shell uses this for Face ID / Touch ID / Android fingerprint; web build uses WebAuthn. Wire behind the same `lib/biometric.ts` abstraction so callers don't branch on platform.

Defer push notifications until after first store approval — adds review surface and permission complexity.

#### Session storage & secure handling

- [ ] **Sessions persist across app restart** — Supabase session in localStorage works inside Capacitor's WebView; verify on cold launch.
- [ ] **Logout clears session fully** — no stale tokens.
- [ ] **Expired sessions refresh correctly** — no infinite-loop on the auth screen.
- [ ] **No tokens leaked to logs** — audit `console.log` calls in production builds.
- [ ] **Magic-link login leaves no broken browser tabs** — see auth section.
- [ ] **Consider `@capacitor/preferences` (or a stronger secure-storage plugin)** for the Supabase session if WebView storage proves unreliable across iOS/Android updates.

#### Offline behaviour

- [ ] **Detect no network** via `@capacitor/network`.
- [ ] **Show calm offline UI** with copy: _"Everion cannot connect right now. Your connection may be offline. Please try again in a moment."_
- [ ] **Avoid infinite loading screens** — fail fast, recover when network returns.
- [ ] **Preserve unsaved capture text** if connection drops mid-write (offline queue should already handle this on web).

#### Real-device test pass (do not rely on simulators)

Run on at least one real iPhone and one real Android phone:

- [ ] Sign up
- [ ] Magic-link login (cold + warm start)
- [ ] Logout
- [ ] App restart (session persists)
- [ ] Capture entry (text, voice, photo if shipping)
- [ ] Ask Everion (chat / RAG)
- [ ] View entries
- [ ] Switch brain (if multi-brain shipping in V1)
- [ ] File / photo upload
- [ ] Offline state (airplane mode → show offline UI → recover on reconnect)
- [ ] Slow internet (network-throttled — the app must not freeze)
- [ ] Expired session (simulate by clearing token — should refresh or re-prompt)
- [ ] Deep-link auth callback (cold + warm)
- [ ] Keyboard behaviour (no input clipping, no layout jump)
- [ ] Safe-area layout (notch, home indicator, gesture nav)
- [ ] Dark / light mode (if web supports system theme)

#### What NOT to do (pre-launch)

- ❌ Do not rebuild Everion in React Native.
- ❌ Do not create separate native UI screens.
- ❌ Do not add mobile-only Supabase tables or schemas.
- ❌ Do not fork product logic between web and mobile.
- ❌ Do not add complex native sync layers.
- ❌ Do not add push notifications before first store approval.
- ❌ Do not add plugins speculatively.
- ❌ Do not rewrite auth — fix the redirect surface, leave the rest.

#### Acceptance criteria

The wrap is done when:

- [ ] Everion runs as an Android app on a real device.
- [ ] Everion runs as an iOS app on a real device.
- [ ] Supabase auth works on both.
- [ ] Magic links open the app correctly (cold + warm).
- [ ] Sessions persist across app restart.
- [ ] App has proper icon and splash screen (not Capacitor defaults).
- [ ] App handles safe areas correctly.
- [ ] App has an offline / no-connection state.
- [ ] Core features work on real devices: sign up · login · capture · ask · view entries · use brain context · file/photo upload (if shipping) · logout.
- [ ] App does not feel like a lazy browser window.
- [ ] App is ready for TestFlight + Play Internal Testing submission.

### M0 — Submission blockers (Apple/Google will reject without these)

**Identity & legal**

- [ ] **Trademark check on "Everion"** — USPTO + WIPO Madrid + ZA-CIPC. 5 minutes of due diligence saves a rejection. Confirm no conflicting class-9 software mark. (Both platforms.)
- [ ] **Google Play Developer account** ($25 one-time).
- [ ] **Apple Developer Program enrollment** ($99/yr) — under personal name initially; transfer to entity later. `[iOS — DEFERRED]`
- [ ] **D-U-N-S number** (Apple needs it for org accounts; skip if enrolling as individual). `[iOS — DEFERRED]`

**iOS — Privacy Manifest (`PrivacyInfo.xcprivacy`, required iOS 17+)** `[iOS — DEFERRED]`

- [ ] Declare `NSPrivacyAccessedAPICategoryUserDefaults` (localStorage `everion_*` keys). `[iOS — DEFERRED]`
- [ ] Declare `NSPrivacyAccessedAPICategoryFileTimestamp` (PWA cache). `[iOS — DEFERRED]`
- [ ] `NSPrivacyTracking: false`. `[iOS — DEFERRED]`
- [ ] List third-party SDKs that ship in the bundle (Capacitor plugins). `[iOS — DEFERRED]`

**iOS — `Info.plist` usage strings (rejection if any UI triggers these without a string)** `[iOS — DEFERRED]`

- [ ] `NSCameraUsageDescription` — "to capture photos for your entries." `[iOS — DEFERRED]`
- [ ] `NSMicrophoneUsageDescription` — "to record voice memos." `[iOS — DEFERRED]`
- [ ] `NSPhotoLibraryUsageDescription` — "to attach photos from your library." `[iOS — DEFERRED]`
- [ ] `NSFaceIDUsageDescription` — "to unlock your encrypted vault." (only if biometric unlock wired) `[iOS — DEFERRED]`

**Android — `AndroidManifest.xml` permissions**

- [ ] `INTERNET`, `RECORD_AUDIO`, `CAMERA`, `READ_MEDIA_IMAGES` (Android 13+).
- [ ] `POST_NOTIFICATIONS` (Android 13+) for push.
- [ ] **Skip** `WRITE_EXTERNAL_STORAGE` — scoped storage on Android 11+ removes need; including it triggers extra Play review.

**Web vs IAP — RESOLVED (Path B chosen and shipped 2026-04-30)**

- [x] **Path B chosen — RevenueCat-wrapped IAP for native + LemonSqueezy for web** ✅
      Apple takes 15% (Small Business Program, <$1M/yr) or 30%; Google Play Billing applies similarly. Both stores' receipts validate through RevenueCat (no two-store integration code on our side). Web stays on LemonSqueezy where Apple/Play don't apply. Bridge: LS webhook → RC promotional entitlement grant — same user gets entitled across surfaces. Stripe was retired in commit `c484030`.
- [ ] **Operator config** — App Store Connect + Play Console product creation + RC dashboard linking. See "RevenueCat dashboard configured" + "App Store Connect + Play Console products" items in the Billing section above.

### M1 — Listing copy (paste-ready, drafted 2026-04-29)

**Apple App Store** `[iOS — DEFERRED — see § Post-launch — iOS launch sprint]`

- [ ] Title (29/30): `Everion: Second Brain & Vault` `[iOS — DEFERRED]`
- [ ] Subtitle (29/30): `Notes, vault, AI you can ask.` `[iOS — DEFERRED]`
- [ ] Keywords field (98/100 bytes): `journal,diary,memory,encrypted,private,voice,memo,capture,recall,offline,GPT,Gemini,Claude,ID,tasks` `[iOS — DEFERRED]`
      No repeats from title/subtitle. No "password" — wrong intent (we're not 1Password). No "note(s)" — already in subtitle. No spaces.
- [ ] Promotional text (137/170): `Quietly kept. The thoughts you'd lose and the facts you can't afford to — held in one private, encrypted home you can ask anything.` `[iOS — DEFERRED]`
- [ ] Description: see "Apple description" block below — ~1,400 chars, conversion-only (Apple does NOT index the long description). `[iOS — DEFERRED]`

**Google Play**

- [ ] Title (29/30): `Everion: Second Brain & Vault`
- [ ] Short description (78/80): `Encrypted notes & vault, AI you can ask. The thoughts and facts you can't lose.`
- [ ] Full description (~3,200 chars, indexed at ~2.4% keyword density): see "Google Play full description" block below.
- [ ] Tags (5): `note taking`, `journal`, `second brain`, `voice notes`, `encrypted notes`.

#### Apple description block

```
One place for everything worth remembering.

The fleeting stuff — half-thoughts, voice memos, links, screenshots, PDFs.
And the high-stakes stuff — gate codes, policy numbers, ID and bank details, the things your family would need if you weren't there to answer.

Capture is one tap. Recall is a chat. Ask in plain language and Everion reads your own past entries, cites them, and answers.

— Capture in under five seconds. Type, talk, paste, snap.
— Ask your memory anything. Cited answers, no general-internet trivia.
— Encrypted vault for the facts you can't afford to lose. AES-GCM 256, derived from a passphrase only you know.
— The Shape — a constellation view of the concepts running through your entries.
— Bring your own AI key, or use ours. Both honest.
— Local-first. Offline. Yours.

Three tiers, all honest:
— Hobby. Free forever. Unlimited entries, encrypted vault, your own AI key.
— Starter. $4.99/mo. Hosted AI included. Cross-device sync.
— Pro. $9.99/mo. Premium AI, larger limits, shared brain with one other person — for households who'd rather one of them remembered.

Made for the person their family calls when nobody else can find the policy number.

Privacy: everionmind.com/privacy
Terms: everionmind.com/terms
```

#### Google Play full description

```
Everion is the calm, private place for everything you don't want to lose.

The fleeting stuff: half-thoughts, voice memos, journal entries, links you mean to read, photos of receipts, screenshots of paperwork, the diary line you scribbled at midnight.

And the high-stakes stuff: ID numbers, bank account details, gate codes, medical aid numbers, the alarm panel password, the spare key location, the "if something happens to me" notes for your spouse.

Two halves of one second brain — encrypted, searchable, and askable.

CAPTURE
Type. Talk. Paste. Snap. Drop in a PDF. Voice memos transcribe automatically.
No folders. No tags required. No template to fill.
Capture takes under five seconds, every time.

ASK
Your memory becomes searchable by meaning, not just by keywords.
"When does my driver's licence expire?"
"What did the customer push back on last quarter?"
"Where did I put the spare key?"
Everion reads your own past entries and answers with citations. The AI never sees your vault unless you opt-in for a specific entry.

THE VAULT
End-to-end encrypted. AES-GCM 256-bit, derived from a passphrase only you know.
Designed for the things you wouldn't write in a notes app: ID numbers, bank details, gate codes, policy numbers, "if I die" notes.
Storing your bank details should not feel safer than storing them in a password manager. This is built so it doesn't.

THE SHAPE
A constellation view of every concept your entries touch.
Three notes from three different weeks turn out to be about the same thing.
You see what your thoughts are about.

PRIVATE BY DESIGN
Local-first. Offline-capable. End-to-end encrypted vault.
Your encryption key never leaves your device. We can't read your vault and we can't sell what we can't read.
GDPR + POPIA compliant. Full data export anytime — JSON or CSV.

THREE TIERS, ALL HONEST
Hobby — free forever. Unlimited entries, encrypted vault, one workspace. Bring your own AI key (Gemini, OpenAI, Anthropic, Groq).
Starter — $4.99 a month. Hosted AI included. Cross-device sync. 500 captures and 200 chats per month.
Pro — $9.99 a month. Premium AI. 2,000 captures and 1,000 chats. Shared brain with one other person — for households where someone else would need to find the gate code.

WHO IT'S FOR
Founders. Knowledge workers. Developers. Parents. Anyone who has ever been the person their family calls when they can't find the policy number.

WHO IT ISN'T FOR
Power users who want a fully-customizable knowledge graph. Teams who need a wiki. People who want streaks and dashboards and gamified productivity.

Everion is quiet on purpose. It just remembers.

Privacy: everionmind.com/privacy
Terms: everionmind.com/terms
```

### M2 — Visual assets

Generate at iPhone 6.9" canvas (`1290 × 2796`) — downscales cleanly. Android export to `1080 × 1920` and `1080 × 2400`. Headline copy rendered IN the screenshot (Apple indexes screenshot captions since June 2025). 70% device frame, 30% caption band, brand colors (ember/ink/surface).

**Tooling:** render the actual app in Playwright at canvas size, screenshot, composite caption band in Figma. Reuses real UI rather than mocking. Avoid third-party stock photography — breaks brand voice.

**Screenshot frames (8 — Google max; Apple uses first 3-5 in search):**

- [ ] **1. Hero** — caption: _"your second brain — kept quietly."_ Frame: memory grid with 6-8 mixed entries (note, voice memo, photo, PDF icon, link card, masked gate-code). Ember dot mark top-left.
- [ ] **2. Capture** — caption: _"capture in one tap."_ Frame: FAB mid-press with light-trail; CaptureSheet rising with text/voice/paste/file icons.
- [ ] **3. Voice** — caption: _"talk to it. it remembers."_ Frame: voice recording UI active, waveform mid-state, transcript appearing in real-time.
- [ ] **4. Recall** — caption: _"ask anything. it cites."_ Frame: ChatView with one user message ("when does my licence expire?") and one AI answer with two citation chips. Italic `f-serif` tone.
- [ ] **5. Vault** — caption: _"for the things you'd be stuck without."_ Frame: vault grid with 4 entries (passport renewal / alarm panel code / policy: car / "if I'm not around"), all masked with reveal button. Lock icon top-right.
- [ ] **6. The Shape** — caption: _"see what your thoughts are about."_ Frame: constellation view, ember-on-ink, two highlighted nodes ("insurance", "household").
- [ ] **7. Privacy** — caption: _"encrypted on your device. yours."_ Frame: phone with key icon → cloud with locked blob, arrow labeled "we never see this."
- [ ] **8. Pricing** — caption: _"free forever. paid only when it earns it."_ Frame: three pricing cards (Hobby free, Starter $4.99, Pro $9.99 ember-bordered). Match Landing.tsx layout.

**Apple-only optional (frames 9-10, lower ROI — most users never scroll past frame 3):** `[iOS — DEFERRED]`

- [ ] 9. Multi-modal: paste a screenshot, drop a PDF — _"everything goes in the same place"_ `[iOS — DEFERRED]`
- [ ] 10. Cross-device: phone + laptop showing same memory grid — _"kept in sync, encrypted in transit"_ `[iOS — DEFERRED]`

**Other visual assets**

- [ ] **App icons** — iOS 1024×1024 master (Capacitor handles the rest). Android 512×512 (Play Store) + adaptive icon (foreground 432×432 in 1024×1024 canvas). Use the new `logoNew` mark from `feat(brand)` commits.
- [ ] **Google Play feature graphic** (1024×500 exact, required for featured placements) — brand frame, ember dot, tagline _"your second brain — kept quietly."_
- [ ] **iOS preview video (optional, +20-40% conversion lift)** — 15-30s, autoplays muted in App Store. Demo: capture → ask → cited answer. Skip on Android (Google Play video doesn't autoplay; only ~6% tap play, low ROI).
- [ ] **Capacitor splash screen** — solid `var(--bg)` with the ember dot animating in. Match `index.html`. 5-frame Lottie max 2KB or static PNG.

### M3 — Native shell config

- [ ] **Bundle ID locked** (both stores): `com.everionmind.app`.
- [ ] **Service-worker registration gated** behind `!isNativePlatform()`:
  ```ts
  if (!(window as any).Capacitor?.isNativePlatform()) registerSW();
  ```
  Capacitor + service workers have a long history of pain — disable SW inside the native shell.
- [ ] **Universal Links file** served at `https://everionmind.com/.well-known/apple-app-site-association` (iOS deep linking from email, share sheets). `[iOS — DEFERRED]`
- [ ] **App Links file** served at `https://everionmind.com/.well-known/assetlinks.json` (Android equivalent).
- [ ] **Demo account for review** — `review@everionmind.com` with a fixed-password backdoor that skips magic-link auth and onboarding. Play's reviewer will reject if they can't get past auth (Apple has the same requirement when iOS ships).

### M4 — Store metadata forms

**Apple App Store Connect** `[iOS — DEFERRED]`

- [ ] **App Privacy nutrition labels** (must match `/privacy`): `[iOS — DEFERRED]`
  - Data Linked to You: Email (account), Purchase history (LemonSqueezy on web; Apple/Google in-app via RevenueCat on native), Diagnostic (Sentry, no PII)
  - Data Not Linked to You: Usage analytics (PostHog, consent-gated)
  - Data Not Collected: Vault contents, location, contacts, browsing history
- [ ] **Age rating:** 4+ — pick "Infrequent/Mild — Mature Themes" if onboarding keeps the "if I die" copy. `[iOS — DEFERRED]`
- [ ] **App Review Information:** demo account credentials, contact email, notes explaining magic-link → fixed-password review path. `[iOS — DEFERRED]`

**Google Play Console**

- [ ] **Data Safety form** (must match `/privacy`):
  - Data collected: Email, in-app purchase history, app diagnostics, optional analytics (consent-gated)
  - Data shared: None for advertising. Analytics processor: PostHog (consent-gated)
  - Encryption in transit: Yes
  - Data deletion: Self-service in app + full account scrub within 48h
  - Independent security review: No (yet — flag honestly)
- [ ] **Content rating questionnaire** — Everyone. No violence, no sexual content. Mark "encrypted personal data storage" where prompted.
- [ ] **Target audience** — Adult (18+) given financial/identity data scope.

### M5 — Pre-submission gate (run all before clicking Submit)

- [ ] iOS Privacy Manifest written and validated (Xcode reports no warnings) `[iOS — DEFERRED]`
- [ ] iOS `Info.plist` usage strings filled for every permission the app actually requests `[iOS — DEFERRED]`
- [ ] Android `AndroidManifest.xml` permissions match runtime requests (no extras)
- [ ] Bundle ID `com.everionmind.app` locked in Play Console (App Store Connect deferred)
- [ ] App Links file served at `/.well-known/assetlinks.json` and validated by Google's Digital Asset Links tester
- [ ] Universal Links file served at `/.well-known/apple-app-site-association` and validated by Apple's `swcutil` `[iOS — DEFERRED]`
- [x] IAP path resolved (Path B — RevenueCat for native + LemonSqueezy for web; shipped 2026-04-30 commit `c484030`)
- [ ] Service-worker registration gated behind `!isNativePlatform()`
- [ ] 8 screenshots generated at Android phone (1080×1920+) + tablet sizes. Apple 6.9"/6.5"/5.5" deferred. `[iOS — DEFERRED]` (Apple sizes only)
- [ ] Feature graphic 1024×500 generated (Play Console)
- [ ] App icons: Android 512×512 generated; iOS 1024² deferred. `[iOS — DEFERRED]` (iOS master only)
- [ ] Privacy policy URL live and matches what's declared in Play Console metadata
- [ ] Trademark check on "Everion" complete (USPTO + WIPO + ZA-CIPC)
- [ ] Demo `review@everionmind.com` account created with backdoor login
- [ ] Data Safety form (Google) submitted and matches `/privacy`
- [ ] App Privacy nutrition labels (Apple) submitted and match `/privacy` `[iOS — DEFERRED]`

### M6 — Cannot assess without paid tools (deferred)

- [ ] Search volume for "second brain" / "encrypted notes" / "AI journal" per store — needs Sensor Tower, AppTweak, or App Annie.
- [ ] Exact ranking per keyword vs Mem.ai, Reflect, Saner.ai.
- [ ] Conversion rate benchmarks for Utilities (Apple) / Productivity (Google) in target geos.
- [ ] Custom Product Pages (Apple, up to 70) — paid ASO tooling helps decide which keyword variants to target.
- [ ] Store Listing Experiments (Google, up to 3 variants, 7+ days each) — once installs are flowing, A/B test short description + screenshot 1.

---

## Post-launch — deferred from V0 (build only after public launch ships)

### iOS launch sprint (deferred 2026-05-05)

Aggregated iOS-specific items from the Mobile section above. Don't start before Android has 30 days of stable production data and zero S1 incidents. Capacitor handles iOS as a fully separate native project — no code changes needed beyond the items below.

**Why deferred** (not killed): Apple Developer Program is $99/yr + tax forms + bank verification + D-U-N-S; first review is the strictest pass; reviewer can reject for things like a privacy-policy nit and burn another 24-72h cycle. Android-first lets us ship to real users in days, learn from real usage, and bring that learning into the iOS submission.

**Sprint structure** (rough — refine when starting):

- **Day 1-2: Operator setup**
  - [ ] Apple Developer Program enrollment ($99/yr) under personal name; transfer to entity later
  - [ ] D-U-N-S number (only if enrolling as org, skip if individual)
  - [ ] App Store Connect app entry created with bundle ID `com.everionmind.app`
  - [ ] RevenueCat dashboard: add iOS app entry; iOS public key wired into `VITE_REVENUECAT_API_KEY_IOS`

- **Day 3-4: Native shell + privacy compliance**
  - [ ] Run `npx cap add ios` if `ios/App/App.xcworkspace` doesn't exist (it does as of 2026-04-30, just verify)
  - [ ] Privacy Manifest `PrivacyInfo.xcprivacy` (required iOS 17+):
    - Declare `NSPrivacyAccessedAPICategoryUserDefaults` (localStorage `everion_*` keys)
    - Declare `NSPrivacyAccessedAPICategoryFileTimestamp` (PWA cache)
    - `NSPrivacyTracking: false`
    - List third-party SDKs (Capacitor plugins shipped in the bundle)
  - [ ] `Info.plist` usage strings:
    - `NSCameraUsageDescription` — "to capture photos for your entries."
    - `NSMicrophoneUsageDescription` — "to record voice memos."
    - `NSPhotoLibraryUsageDescription` — "to attach photos from your library."
    - `NSFaceIDUsageDescription` — "to unlock your encrypted vault." (only if biometric unlock wired)
  - [ ] iOS URL scheme registered in `Info.plist` `CFBundleURLTypes` for `everion://` + `com.everionmind.app://`
  - [ ] Associated Domains entitlement for universal links from email
  - [ ] `apple-app-site-association` file at `https://everionmind.com/.well-known/apple-app-site-association` validated by Apple's `swcutil`

- **Day 5-6: Listing copy + assets**
  - [ ] Title (29/30): `Everion: Second Brain & Vault`
  - [ ] Subtitle (29/30): `Notes, vault, AI you can ask.`
  - [ ] Keywords (98/100 bytes): `journal,diary,memory,encrypted,private,voice,memo,capture,recall,offline,GPT,Gemini,Claude,ID,tasks` (no repeats from title/subtitle, no spaces)
  - [ ] Promotional text (170): "Quietly kept. The thoughts you'd lose and the facts you can't afford to — held in one private, encrypted home you can ask anything."
  - [ ] Description: ~1,400 chars, conversion-only — Apple does NOT index the long description. (Block in Mobile § M1 above is paste-ready.)
  - [ ] App Privacy nutrition labels (must match `/privacy` and the Android Data Safety form word-for-word):
    - Data Linked to You: Email (account), Purchase history (Apple/Google in-app via RevenueCat), Diagnostic (Sentry, no PII)
    - Data Not Linked to You: Usage analytics (PostHog, consent-gated)
    - Data Not Collected: Vault contents, location, contacts, browsing history
  - [ ] Age rating: 4+ — pick "Infrequent/Mild — Mature Themes" if onboarding keeps the "if I die" copy
  - [ ] Apple App Review Information: demo `review@everionmind.com` credentials, contact email, notes on magic-link → fixed-password review path
  - [ ] Apple primary category: Utilities, secondary: Productivity
  - [ ] Apple-only screenshot frames 9-10 (multi-modal, cross-device) — generate at iPhone 6.9" canvas (1290×2796), downscale to 6.5" + 5.5" sizes
  - [ ] iOS preview video (15-30s, optional but +20-40% conversion lift) — capture → ask → cited answer
  - [ ] iOS app icon 1024×1024 master generated (Capacitor handles the rest)

- **Day 7: Build + TestFlight**
  - [ ] Open `ios/App/App.xcworkspace` in Xcode
  - [ ] Set release scheme, archive, distribute → App Store Connect
  - [ ] TestFlight internal track approval (Apple processes ~30-60 min)
  - [ ] Real-device test on at least one iPhone (cold + warm magic-link, capture, chat, vault, sandbox subscription)
  - [ ] Service-worker stays gated behind `!isNativePlatform()` (already wired — verify)

- **Day 8: Production submission**
  - [ ] App Store Connect product creation: subscription products `everionmind.starter.monthly` + `everionmind.pro.monthly` linked to RC entitlements `starter`/`pro`
  - [ ] Sandbox subscribe → renewal → cancel cycle on real iPhone — passes
  - [ ] Submit for production review
  - [ ] Wait 24-72h (median ~24h on second-time apps)

**iOS-specific risks to watch** (from Apple's review guidelines):
- "Cannot sign in to test" — provide demo creds in App Review Information
- "Privacy policy not accessible" — confirm `https://everionmind.com/privacy` returns 200, not Vercel-protection 401
- "App appears to be a copycat" — second-brain category has visual sameness; mitigation is distinct icon + brand-name uniqueness (the trademark check covers this)
- "IAP gates content not paid for" — make sure free-tier limits in `Legal/pricing-billing.md` match what Apple sees in the demo account
- "App Tracking Transparency mismatch" — declared "no tracking" but ATT framework imported. Verify the SDK isn't accidentally linked.

**Once iOS ships**: tick the iOS items in `PLAYBOOK.md` Phase 5; revisit `Mobile/ios-submission.md` as the canonical runbook for v1.1+ updates.

### Important Memories — beyond v0 (user-curated)

V0 ships user-curated only: a flat table, four types (`fact` / `preference` / `decision` / `obligation`), promote-from-entry via "Keep this," manual retire/restore. Everything below is intentionally **not** in V0 — pulled out so the launch could ship.

- [ ] **v0b — Retrieval injection.** Inject active Important Memories into the chat system prompt as a "trusted facts" preamble (separate from RAG hits). Bound length (~1 KB cap), oldest-first eviction. Evaluate quality lift on a held-out set of factual questions before enabling broadly. Source: `src/lib/systemPromptBuilder.ts`.
- [ ] **v1 — AI suggestions ("Promote to memory?").** Periodic background pass over recent entries; flag candidates that look like durable facts (named entities + factual statements + low ambiguity). User confirms each one. Cost-gated by tier. **Do not auto-create** — confirmation is the v1 contract. Triggered from the same enrichment pipeline that already runs (`enrich.ts`).
- [ ] **v1 — Contradiction detection.** When a new memory's slug clashes with an existing active key (caught today by `important_memories_active_key_uidx`), surface a side-by-side comparison and let the user choose: keep both (rename), retire old + create new, or cancel. Today the API returns 409; the UI just shows an error.
- [ ] **v1 — Source-entry sync.** When a source entry is deleted, scrub its UUID from `source_entry_ids` (today's entry-delete path doesn't touch important_memories). Either trigger-based or a nightly sweep. The GIN index on `source_entry_ids` already exists.
- [ ] **v1 — Memory provenance UI.** "Why does Everion know this?" — link from a memory back to its source entries, show which chats cited it, allow inline edit-and-retire.
- [ ] **v1 — Memory export.** Include important_memories rows in `/api/transfer` JSON export. Today the table is excluded (only entries + concepts export).
- [ ] **v2 — Multi-language extraction.** Today the slug generator strips diacritics aggressively (NFKD + ASCII-only). Fine for English/Romance; revisit for CJK/Arabic-first users.
- [ ] **v2 — Soft-merge of similar memories.** Embedding-based similarity to suggest "this looks like X — merge?" instead of waiting for an exact-key clash.

### Vault — beyond V3 narrow scope

V3 narrowed the vault to true secrets (passwords, credit cards, recovery codes, PINs). The broader "vault for everything sensitive" framing is deferred.

- [x] **PIN + biometric unlock + dormant auto-lock (P1, large).** ✅ — First open uses passphrase (existing). Subsequent opens use 4-8 digit PIN OR biometric (WebAuthn platform authenticator: Face ID / Touch ID / Windows Hello via the browser). Vault auto-locks after configurable idle timeout (5/15/30/60 min, default 15). Web-only — Capacitor native biometric deferred until Capacitor is installed (line 718 of this checklist). Behind `VITE_FEATURE_VAULT_PIN_BIOMETRIC` flag. New: `src/lib/vaultPinKey.ts` (PBKDF2-310k PIN wrapping, WebAuthn prf wrapping, localStorage persistence), `src/lib/biometric.ts` (WebAuthn + prf extension wrapper), `src/hooks/useVaultLockTimer.ts`, `src/components/vault/VaultPinScreen.tsx`, `src/components/vault/VaultPinSetup.tsx`. Edits: `useVaultOps.ts` adds `pin` + `pin-setup` statuses; `VaultView.tsx` routes them. Forgot PIN → passphrase; forgot both → recovery key. (Sub-project 3 of 5 in EML "Vault — beyond V3 narrow scope" decomposition.)
- [x] **Optional app-level biometric re-auth (P2).** ✅ — Reuses the vault PIN + WebAuthn credential from sub-project 3 (no second PIN to remember). When enabled, the entire app shell sits behind a `<AppLockGate>` overlay; lock fires on every page load AND after configurable idle (5/15/30/60 min). Activity tracking via document-level mousemove/keydown/touchstart/scroll/click + visibilitychange. New: `src/lib/appLockSettings.ts` (toggle + timeout in localStorage), `src/hooks/useAppLockTimer.ts` (idle tracker), `src/components/AppLockGate.tsx` (lock overlay with PIN + biometric), `src/components/settings/AppLockSection.tsx` (Settings → Security toggle + timeout picker). Behind `VITE_FEATURE_APP_LOCK` flag; toggle hidden when no vault PIN configured. (Sub-project 4 of 5 in EML "Vault — beyond V3 narrow scope".)
- [x] **Vault export — offline decryption tool.** ✅ — `public/decrypt.html` ships standalone (no imports, Web Crypto inline), accepts a `everion-vault-export-v1` JSON bundle + passphrase OR recovery key, decrypts every entry in-browser. Vault toolbar gains a "↓ Backup" button (`src/lib/vaultBackup.ts`) that bundles vault setup + entries into the JSON shape. Honors the `/privacy` "your vault is yours regardless" promise.
- [ ] **Vault entry templates.** Pre-shaped fields for Password / Card / Recovery Code / PIN / Seed Phrase — today vault entries are free-form, which makes them harder to parse for autofill later. → Spec: `docs/superpowers/specs/2026-05-02-vault-entry-templates-design.md` (sub-project 1 of 5 in this section's decomposition: templates → offline decryption tool → PIN+biometric+auto-lock → app-level re-auth → browser-extension autofill).
- [ ] **Browser extension autofill for vault credentials.** ⏸ Deferred per source guidance ("only worth it post-launch once usage tells us if vault holds enough credentials to bother. If users mostly stay on 1Password, skip"). Sub-project 5 of 5 in EML "Vault — beyond V3 narrow scope" — parked until post-launch usage data justifies the extension's complexity (Chrome MV3 + Firefox manifest, store review surface, app-extension messaging, CSP changes). Sub-project 1 (templates) shipped the structured `template_type` + per-field metadata that this would consume — when revisited, the data shape is ready.

### Marketing copy — deferred V3 polish

- [ ] **Replace [PLACEHOLDER] proof-points** in `.agents/product-marketing-context.md` (Customers, Testimonials, Customer Language) with verbatim quotes from beta users post-launch.
- [ ] **Test the two acquisition angles** — capture-and-recall hero vs. Important-Memories hero — once enough traffic to power 7-day comparisons.
- [ ] **Decide on shared-brain marketing weight.** V3 demoted it to a Pro-tier mention; revisit if Pro conversion data says household angle is doing the work.
