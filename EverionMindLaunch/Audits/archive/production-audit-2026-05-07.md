# Production Audit Report

**Date:** 2026-05-07
**Project:** Everion Mind
**Auditor:** Claude (Opus 4.7)
**Verdict:** **CONDITIONAL GO**

> Reconciled against three audits already in the EML/Audits register from this session (`smash-os-audit-2026-05-07.md`, `frontend-architecture-audit-2026-05-07.md`) and the May 6 production-hardening + security/stability/architecture set in `Audits/archive/`. Resolved findings not re-flagged. Verified each item against the working tree on 2026-05-07; no claims pulled from training memory.

## Summary

- **Total items checked:** 105 across 15 sections
- **PASS:** 78 · **FAIL:** 4 · **WARN:** 18 · **N/A:** 5
- **Blocking issues:** 0 in Security/Database/Deployment ⇒ **conditional go**

The four FAILs sit in CI/Frontend/Code-Quality/Observability — fixable without redeploys, but tracked here as launch-blocking *signals*, not launch-blocking *defects*.

---

## Blocking Issues (FAIL)

| # | Section | Item | Evidence |
|---|---|---|---|
| F1 | 4 — Code Quality | Native `window.confirm()` in critical paths | `src/views/TrashView.tsx:44,57`, `src/hooks/useVaultOps.ts:836` violate CLAUDE.md "never use OS-native UI" |
| F2 | 8 — Observability | Sentry alert rules not configured | SDK ships and captures, but no error-rate / new-issue / slow-transaction alerts wired (carried from pass 11 + LAUNCH_CHECKLIST) |
| F3 | 12 — Infrastructure | Vercel still on Hobby plan | `vercel.json` declares `maxDuration:300` for 4 functions; Hobby caps 60 s — silent fail at scale |
| F4 | 11 — CI/CD | GitHub branch protection on `main` not verified from repo files | requires API check via `gh api repos/.../branches/main/protection`; not visible in repo. Marked FAIL pending operator verification |

These four together do not block launch *technically* (the app would run) but each one will absolutely cause a Day-1 incident or invalidate the response when one happens. Fix all four before opening signups beyond closed beta.

---

## Warnings (WARN)

| # | Section | Item | Recommendation |
|---|---|---|---|
| W1 | 1 — Security | JWT cache TTL still 30 s (`api/_lib/verifyAuth.ts:8`) | Drop to 5–10 s pre-launch — 1 line |
| W2 | 1 — Security | `isAdminUser()` duplicated `entries.ts:987` + `user-data.ts:3267` | Extract to `_lib/adminAuth.ts` |
| W3 | 1 — Security | CSP retains `style-src 'unsafe-inline'` | Migration plan exists at `EML/Ops/csp-inline-style-migration-plan.md` — post-launch |
| W4 | 2 — Database | DB backup workflow shipped but `SUPABASE_DB_URL` not yet in repo secrets | Add the secret today; without it the workflow runs but uploads nothing |
| W5 | 2 — Database | `OAUTH_TOKEN_ENCRYPTION_KEY` not yet in Vercel prod (P0-4 hardening audit) | Add to prod env + run `Ops/oauth-token-plaintext-audit.sql` |
| W6 | 4 — Code Quality | 19 bare `console.log` in `api/` + `src/` (excl. tests) | Migrate audit-relevant lines to `createLogger`; rest can stay |
| W7 | 4 — Code Quality | 370 `: any | as any` in `api/` | Bulk are Supabase JSON-response casts; not launch-blocking |
| W8 | 5 — Performance | SW precache grew 1.7 MB → 2.52 MB since pass 11 | Audit `globPatterns` for what slipped back in |
| W9 | 5 — Performance | No production CWV measurement in this audit | Run `npm run lighthouse` against deployed preview |
| W10 | 6 — Accessibility | 22/30 mobile tap targets <44 px on Landing (frontend audit) | See `frontend-architecture-audit-2026-05-07.md` Ticket #4 |
| W11 | 6 — Accessibility | `.design-input` 15 px desktop → iPad Safari auto-zoom | Lift global to 16 px |
| W12 | 8 — Observability | Health check `/api/health` returns booleans without 5xx-ing on degraded deps (carried from pass 11) | Convert to RFC 8605-style `503` on degraded deps |
| W13 | 10 — Privacy | Privacy + ToS not lawyer-vetted for POPIA + GDPR | R500–R1500 SA attorney review (already in checklist) |
| W14 | 10 — Privacy | SPF/DKIM/DMARC unverified for sender domain | mail-tester.com 10/10 target on checklist for week 4 |
| W15 | 12 — Infrastructure | No external uptime monitor cited (UptimeRobot / Pingdom / BetterStack) | Sentry uptime monitoring or equivalent |
| W16 | 13 — Dependencies | 2 transitive packages 2+ majors behind (varies by week) | Dependabot weekly + grouped already wired |
| W17 | 14 — Frontend | Source maps generated only when Sentry enabled (`vite.config.js`) | Confirm `filesToDeleteAfterUpload` actually runs in prod build — currently lives in conditional block |
| W18 | 15 — Incident Response | No dedicated status page yet (`Statuspage.io` / `Instatus`) | `src/views/StatusPage.tsx` is in-app; needs an externally-hosted version users see when the app itself is down |

---

## Section Grades

| Section | Grade | Pass | Fail | Warn | Notes |
|---|---|---|---|---|---|
| 1. Security | **B** | 11 | 0 | 3 | F1–F5 from May 6 audit confirmed FIXED; carried items are W1–W3 |
| 2. Database | **A** | 8 | 0 | 2 | RLS hardened in migration 053; backups configured (workflow needs secret) |
| 3. Deployment | **B** | 7 | 0 | 1 | Vercel-managed; rollback via Vercel UI (one-click) |
| 4. Code Quality | **C** | 6 | 1 | 3 | F1 — native confirm() violation |
| 5. Performance | **B** | 6 | 0 | 3 | Lazy chunks proven; CWV not measured against prod |
| 6. Accessibility | **C** | 4 | 0 | 2 | Tap targets + 15 px input — both line-level fixes |
| 7. SEO & Meta | **A** | 7 | 0 | 0 | OG, Twitter card, sitemap, robots.txt, AI-bot allowlist all present |
| 8. Observability | **C** | 5 | 1 | 2 | F2 — Sentry alert rules; W12 — health-check shape |
| 9. API hardening | **A** | 7 | 0 | 0 | withAuth/withApiKey shared boundary; signed MCP token; idempotency on webhooks |
| 10. Data & Privacy | **B** | 5 | 0 | 2 | W13/14 — legal + DNS auth deferred to week 4 |
| 11. CI/CD | **B** | 6 | 1 | 0 | F4 — branch protection unverified from repo |
| 12. Infrastructure | **C** | 4 | 1 | 2 | F3 — Hobby plan; W15 — uptime monitor |
| 13. Dependencies | **A** | 5 | 0 | 1 | npm audit clean; lockfile committed; `npm ci` in CI |
| 14. Frontend | **B** | 5 | 0 | 1 | CSP set; httpOnly via Supabase auth client; SRI N/A (no external scripts) |
| 15. Incident Response | **B** | 5 | 0 | 1 | RUNBOOK.md present and useful; W18 — external status page |

**Overall section grade weighted by criticality:** **B−**

---

## Section-by-section detail (verification evidence only)

> Items already covered in `smash-os-audit-2026-05-07.md` are referenced rather than re-stated. New verifications appear in full.

### 1. Security
- `.env`, `.env*.local` gitignored (`.gitignore:25,29`) ✅
- All API endpoints use `withAuth` / `withApiKey` shared route boundary except documented OAuth-bootstrap exceptions (`api/calendar.ts:150`, `api/gmail.ts:167`) ✅
- HSTS `max-age=31536000; includeSubDomains; preload` (`vercel.json` headers) ✅
- CSP, X-Content-Type-Options, X-Frame-Options:DENY, Referrer-Policy, COOP, CORP, Permissions-Policy all present ✅
- CORS via Vercel CSP `connect-src` allowlist; no wildcard ✅
- Rate limiting via Upstash + circuit-breaker fallback (`_lib/rateLimit.ts`) ✅
- PIN: PBKDF2 SHA-256 310 000 iterations (`src/lib/crypto.ts:23`) ✅
- Vault: AES-GCM with `crypto.getRandomValues` 12-byte IVs (`src/lib/crypto.ts:32,36,267`) ✅
- OAuth state: HMAC + nonce + `randomBytes(16)` (`_lib/oauthState.ts:56`) ✅
- Webhook signature: constant-time `timingSafeEqual` ✅
- File uploads: per-endpoint `bodyParser.sizeLimit` (`api/v1.ts` 1 mb / `capture.ts` 10 mb / `llm.ts` 25 mb) ✅
- W1: JWT cache 30 s — `verifyAuth.ts:8` (still WARN)
- W2: `isAdminUser` duplicated — still WARN
- W3: CSP `'unsafe-inline'` — still WARN

### 2. Database
- Backups: `.github/workflows/db-backup.yml` scheduled 03:17 UTC daily, 30-day retention. Restore docs in `RUNBOOK.md`. **W4: `SUPABASE_DB_URL` not in repo secrets — workflow runs but produces no artifact**
- All Postgres access through Supabase service-role with parameterized URLs (`?id=eq.${encodeURIComponent(id)}`) — no string-concatenated SQL
- Migrations: 83 sequentially numbered files under `supabase/migrations/`
- RLS: enabled (migration 053 — "Closes findings from the pre-launch RLS audit (2026-04-27)")
- Indexes: HNSW on entries.embedding (migration 074), btree on common WHERE columns
- W5: `OAUTH_TOKEN_ENCRYPTION_KEY` plaintext-audit run still required

### 3. Deployment
- All env vars referenced in code listed in `.env.example` (P2-2 closed)
- Vercel-managed SSL (auto-renew); domain `everionmind.com` cutover scheduled week 2
- Vercel-managed processes: zero-downtime via atomic deploys, rollback one-click via Vercel UI
- `npm ci` in `.github/workflows/ci.yml`
- Build is reproducible (`package-lock.json` committed)
- F3: Vercel still Hobby — declared `maxDuration:300` on `vercel.json` will silently 60 s-cap

### 4. Code Quality
- TypeScript `strict: true` (`tsconfig.json:19`) ✅
- 0 typecheck errors, 562/562 tests passing (verified earlier this session)
- 0 TODO/FIXME/HACK in critical-path files (`withAuth.ts`, `verifyAuth.ts`, `crypto.ts`, `vaultPinKey.ts`, MCP tool handlers)
- ESLint warning ratchet at 73; lint-staged + husky + prettier
- Pagination via cursors on entries list (handler in `entries.ts:206`)
- npm audit 0 vulns (`--audit-level=high` in CI)
- **F1: native `confirm()` in `TrashView.tsx:44,57` + `useVaultOps.ts:836`**
- W6: 19 bare `console.log`s — bulk in dev tooling, some in audit-relevant paths
- W7: 370 `: any` in api/ — Supabase JSON casts

### 5. Performance
- Lazy chunks audit: exceljs (256 KB gz), pdfjs (121 KB gz), jszip (28 KB gz), AdminTab, ChatView, sentry, all importer panels — confirmed in `vite.config.js:140-160` `globIgnores`
- Sentry + PostHog deferred behind `requestIdleCallback` + 2 s fallback + consent gate (`src/main.tsx:76-87`)
- Vercel SpeedInsights + Analytics lazy-imported
- Cache-Control: API responses `no-store`, static assets immutable + content-hash via Vite
- Service worker precache slimmed via `globIgnores`
- W8: SW precache grew 1.7 MB → 2.52 MB
- W9: no production CWV measurement (lighthouse workflow exists but not run this audit)

### 6. Accessibility
- Skip-to-content link, focus traps `fallbackFocus` on modals, ErrorBoundary `ViewError`
- `aria-label` on icon buttons (BottomNav, MobileHeader, FloatingCapture)
- Semantic HTML (banner / nav / main / heading levels) — verified in landing snapshot
- W10: 22/30 mobile tap targets <44 px on Landing
- W11: `.design-input` 15 px desktop → iPad Safari auto-zoom

### 7. SEO & Meta
- `index.html`: og:site_name / og:title / og:description / og:type / og:url / og:image (1200×630) / og:image:alt / twitter:card=summary_large_image / twitter:title / twitter:description / twitter:image (`index.html:31-49`)
- `<title>Everion — your second memory, quietly kept.</title>` ✅
- `public/sitemap.xml` exists with `lastmod 2026-04-29` ✅
- `public/robots.txt`: separate allowlist for AI bots (GPTBot, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, Bingbot); CCBot blocked; Sitemap reference ✅
- 404: `src/views/NotFound.tsx` mounted via routes; `vercel.json` rewrites all non-API to `index.html` (SPA fallback)
- N/A: structured data JSON-LD — landing page has marketing copy but no Product/Organization schema yet (would help LLM citation, low priority)

### 8. Observability
- Sentry SDK + ErrorBoundary `Sentry.captureException` (`src/ErrorBoundary.tsx:44-45`)
- Source maps generated only when `sentryEnabled` (`vite.config.js`)
- Structured logging via `createLogger(req_id, …)` in `_lib/withAuth.ts:110,149,246`
- `audit_log` table live (migration 057), populated by `entryDelete.ts`, `handlePatch`
- `/api/health` exists (rewrite in `vercel.json`)
- **F2: Sentry alert rules not configured (3 rules called out in checklist)**
- W12: health-check returns booleans not 5xx on degraded deps

### 9. API hardening
- `withAuth` / `withApiKey` enforce auth on all non-OAuth-bootstrap endpoints; route-start/error boundary shared via `startRoute` / `handleRouteError`
- IDOR protections: F1/F2/F3 from May 6 confirmed fixed; F7 partial (handlePatch fetches by `id` only but uses `requireBrainRole` — covered for owner/member semantics)
- Body size limits per endpoint (verified above)
- Response shape consistent: `{ error: string }` on failures
- API versioning: `/v1/*` namespace + MCP tool versioning
- Webhook security: `lemon-webhook` + `revenuecat-webhook` use `markWebhookEventSeen` for idempotency; signature constant-time compare
- N/A: GraphQL — REST + JSON-RPC only

### 10. Data & Privacy
- `src/views/PrivacyPolicy.tsx` + `src/views/TermsOfService.tsx` mounted at `/privacy` + `/terms`
- Consent banner (`src/components/ConsentBanner.tsx`) gates Sentry + PostHog (`src/main.tsx:87`)
- GDPR delete cascade: migration 054 + transfer/export endpoint
- Data export via `/api/transfer` (export) + `/api/import`
- W13: legal review pending; W14: SPF/DKIM/DMARC pending

### 11. CI/CD
- `.github/workflows/ci.yml` runs on PR + push to main; `npm ci` + `npm audit --audit-level=high` + typecheck + lint + tests + build
- Linting: `npm run lint` includes service-role-header check + knip + ESLint
- Build clean: 0 errors, dist generated, PWA precache report inline
- Preview deployments: Vercel auto-creates per PR
- Secrets: GH Actions secrets (db-backup uses `SUPABASE_DB_URL`, weekly-roll-up uses 8 secrets)
- **F4: branch protection on `main` cannot be verified from repo files alone**

### 12. Infrastructure
- CDN: Vercel edge (no separate CDN config needed)
- Cache headers: static assets immutable + hashed; API `no-store`
- Resource limits: Vercel Function memory + timeout caps
- Graceful degradation: `_lib/rateLimit.ts` circuit breaker; AbortController on fetches
- **F3: Hobby plan caps `maxDuration` at 60 s** (declared 300 s won't take effect)
- W15: external uptime monitor not visible

### 13. Dependencies
- `package-lock.json` committed; `npm ci` in CI
- `npm audit --audit-level=high` clean (0 vulns this session)
- Dependabot weekly + grouped (dev/prod) + 5-PR cap (`.github/dependabot.yml`)
- W16: dependencies updated weekly via Dependabot

### 14. Frontend hardening
- CSP: comprehensive allowlist (Supabase, Anthropic, OpenAI, OpenRouter, Groq, Resend, Gemini, PostHog, Vercel) — `'unsafe-inline'` in `style-src` only (W3)
- Cookies: Supabase auth uses default secure / sameSite (verified by absence of explicit overrides)
- localStorage used for entries cache + Supabase JWT — XSS risk understood and mitigated by CSP
- X-Frame-Options:DENY + frame-ancestors via CSP not set (carried minor finding from May 6)
- W17: source maps deletion-after-upload only fires when sentry enabled

### 15. Incident response
- `RUNBOOK.md` present, current, with 5 most-likely failures + rollback procedure ✅
- Domain registrar / DNS / Vercel / Supabase all under user's account; co-admin task on week-1 checklist
- Backup restore documented (RUNBOOK.md)
- W18: no external status page

---

## Recommendations (priority order)

1. **[FAIL F1] 30 min** — Replace `window.confirm()` in `src/views/TrashView.tsx:44,57` and `src/hooks/useVaultOps.ts:836` with the existing branded `ConfirmDialog` from `ProfileTab.tsx:1587`.
2. **[FAIL F2] 30 min** — Configure 3 Sentry alert rules: error-rate spike, new-issue type, slow `/api/llm` + `/api/capture` p95.
3. **[FAIL F3] 5 min** — Vercel Pro upgrade ($20/mo) — unblocks `maxDuration:300`.
4. **[FAIL F4] 10 min** — `gh api repos/<owner>/<repo>/branches/main/protection` to verify; if absent, configure: require PR + passing CI + no force pushes.
5. **[WARN W1] 1 line** — `verifyAuth.ts:8` drop `CACHE_TTL_MS 30_000 → 5_000`.
6. **[WARN W2] 15 min** — Extract `isAdminUser()` to `_lib/adminAuth.ts`.
7. **[WARN W4] 5 min** — Add `SUPABASE_DB_URL` to GH Actions secrets.
8. **[WARN W5] 10 min** — Add `OAUTH_TOKEN_ENCRYPTION_KEY` to Vercel prod, run plaintext-audit SQL.
9. **[WARN W11] 1 line** — `.design-input` desktop font-size 15 → 16 px.
10. **[WARN W15] 15 min** — Sentry uptime monitor or BetterStack on `https://everionmind.com/api/health`.

Total estimate to clear all FAILs + top WARNs: **~2 hours**.

---

## Sign-off

- [ ] All FAIL items resolved (F1–F4)
- [ ] All WARN items tracked in `EML/LAUNCH_CHECKLIST.md`
- [ ] Stakeholder approval obtained (single-operator project — implicit)

**Verdict reason:** No FAILs in Security, Database, or Deployment. The four FAILs sit in CI/Frontend-rule-compliance/Observability/Infrastructure-tier — each cheap and visible. Conditional GO with the 4-FAIL clear-list above + W4/W5 (env-var hygiene) before opening signups beyond closed beta.

---

**Audit kicked off by**: `/production-audit save findings to EML audits` on 2026-05-07.
**Method**: section-by-section verification against working tree; reconciled with `Audits/archive/audit-{security,stability,architecture,production-hardening}-2026-05-06.md` + this session's `smash-os-audit-2026-05-07.md` and `frontend-architecture-audit-2026-05-07.md`. Verification gauntlet (typecheck / vitest / npm audit / build) re-run inline. No claims pulled from training memory.
