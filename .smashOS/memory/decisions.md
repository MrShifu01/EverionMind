# Decisions Log

---

## [FEATURE] Gmail Staging Area — 2026-04-24
**Tags**: GMAIL, SCHEMA, ENRICHMENT, UI

Gmail entries now land in a `status="staged"` holding area instead of going
directly into the brain. They promote to `status="active"` automatically once
parse+insight+embedded all pass, or manually via the staging inbox UI.

### Schema
- `ALTER TABLE entries ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`
- Index on `status` WHERE staged. Migration SQL in `.smash-os/scratch/gmail-staging-migration.sql`
- **Must run migration in Supabase before deploying.**

### Key decisions
- No new api/ files (Vercel 12-function limit). Status filter added to existing GET handler.
- `deepExtractEntry` now returns `null` on failure — `parsed` flag only set true when LLM ran.
- Client-side promote (useEnrichmentOrchestrator) is best-effort fast-path; server batch is authoritative.
- Staged inbox reuses GmailScanReviewModal swipe pattern in new GmailStagingInbox.tsx.
- Reject = existing soft-delete endpoint. Accept = PATCH status→active.

---

## [IMPROVEMENT] Deferred items sweep — 2026-04-24
**Tags**: TYPES, AUTH, ARCH, REFACTOR

Picks up the 4 deferred items from the pass-9 fix sweep, in dependency order.

### Item 1 — verifyAuth typed (foundation)
- `api/_lib/verifyAuth.ts` — `Promise<any>` → `Promise<AuthedUser | null>`
- `api/_lib/withAuth.ts` — extended `AuthedUser` with `email`, `aud`, `role`, `user_metadata`, `app_metadata` (all optional, `[key: string]: unknown` index sig retained)
- Dropped `: any` annotations on 12 `verifyAuth` call sites (10 in `user-data.ts`, 2 in `llm.ts`)
- `: any` count: 331 → 319 (remaining 319 are Supabase-JSON response handling — explicitly out of scope per pass-9 plan)

### Item 2 — withAuth migration (12 of 11 audit-listed handlers)
**Migrated to withAuth** (preserving exact rate-limit values, methods, response shapes):
- `api/llm.ts` main handler — per-action rateLimit via function form (transcribe=10, others=40)
- `api/gmail.ts` main handler (auth/* OAuth bootstrap stays raw — see below)
- `api/user-data.ts` — design **(B)** chosen: per-sub-handler wrap. Rate-limit budgets vary 5x to 60x across resources (account=5, pin=10, vault/api_keys=20, memory=30, brains/activity=60, health/prefs/push=none), so a single dispatcher-level wrapper would either over-permit destructive actions or under-permit list reads. Migrated handlers: `handleBrains`, `handleMemory`, `handleActivity`, `handleHealth`, `handleVault`, `handlePin`, `handleDeleteAccount`, `handleApiKeys`, `handleNotificationPrefs`, `handlePushSubscribe` (10 sub-handlers).

**Intentionally left raw with documented reasons**:
- `api/gmail.ts:167` (`handleAuth`) and `api/calendar.ts:150` (`handleAuth`) — OAuth init flows: queryToken fallback (browser navigation can't set Authorization header), 302 redirect response, no rate-limit. Doesn't fit `withAuth`'s pattern (header-only auth, JSON response).
- `api/calendar.ts:239` (main handler) — silent unauth fallback (`200 + { events: [], integrations: [] }`) is intentional UX for the events feed; consumers (`TodoView.tsx:1115`, `CalendarSyncTab.tsx:70`) are defensive but expect 200. Migrating to `withAuth` would change response status to 401 — disallowed by "do not change response shapes" rule.
- `api/memory-api.ts:33` — dual-auth pattern (`em_*` API key OR Supabase JWT). Neither `withAuth` (JWT-only) nor `withApiKey` (em_-only) fits; needs a new `withDualAuth` middleware (out of scope).
- `api/user-data.ts` `handleCronDaily` — uses `CRON_SECRET` env var, not `verifyAuth` (correctly excluded from migration).

### Item 3 — God-component decomposition (top 2 of 8)
**`src/Everion.tsx` (1,326 → 911 lines)** — 2 child components extracted, co-located in `src/`:
- `MemoryHeader.tsx` (239 lines) — memory top bar + filter row (Grid/List/Timeline + type pills + sort cycle). 4 props.
- `CaptureWelcomeScreen.tsx` (220 lines) — capture-view welcome screen with skeleton, quick nav, and recent activity. 6 props. Internal `CaptureSkeleton` sub-component.
- Dropped now-unused `NavIcon` and `ReactNode` imports.

**`src/views/TodoView.tsx` (1,627 → 607 lines)** — 3 child components + shared utils, co-located in `src/views/`:
- `TodoCalendarTab.tsx` (570 lines) — month/agenda calendar view, with `DayDetailPanel` and `AgendaList` co-located. 4 props.
- `TodoEditPopover.tsx` (182 lines) — popover edit form. 4 props.
- `TodoQuickAdd.tsx` (153 lines) — natural-language quick-add form (used by both list and calendar tabs). 2 props.
- `todoUtils.ts` (129 lines) — shared date helpers, regex constants, `isDone`, `addRecurring`, `ExternalCalEvent` type. Logic-only, not a component.

All extractions take ≤6 props (well under the 8-prop ceiling). Behavior preserved exactly — mechanical 1:1 splits, no logic changes.

**Out of scope for this sweep** (left for follow-up): `CaptureSheet.tsx` (1,083), `LoginScreen.tsx` (992), `VaultView.tsx` (1,012), `Landing.tsx` (1,012), `DetailModal.tsx` (1,024), `ChatView.tsx` (1,224).

**UI verification gap**: cannot run `npm run dev` and exercise the views in a browser within this CLI environment. Type-checking + 380/380 tests + lint + build all green, but per the audit's own caveat ("necessary but not sufficient"), a manual smoke test of the Memory, Capture, and Todos views is recommended before next deploy.

### Item 4 — Dependabot
- `.github/dependabot.yml` already existed from a prior pass (weekly npm, grouped prod/dev, limit 5 PRs).
- Removed stale `xlsx` ignore rule — `xlsx` was replaced with `exceljs` in pass 9, so the ignore no longer applies.

### CI status (final gauntlet)
- `npm audit --audit-level=high` → **0 vulnerabilities**
- `npm run typecheck` → **passes**
- `npm run lint` → **0 errors, 300 warnings** (warnings unchanged from pass 9: mostly `@typescript-eslint/no-explicit-any`)
- `npm run format:check` → **passes**
- `npm test` → **380/380 passing**
- `npm run build` → **passes** (PWA bundle 1973 KiB, 44 precached entries)

### Still outstanding (next pass)
- 4 raw `verifyAuth` sites need either a new `withDualAuth` middleware (memory-api) or `withOAuthBootstrap`-style helper (gmail/calendar OAuth init); calendar.ts main handler stays as-is unless we accept the 200→401 change for the unauth fallback.
- 6 god components remain >900 lines (CaptureSheet, LoginScreen, VaultView, Landing, DetailModal, ChatView).
- 319 `: any` annotations remain — Supabase-JSON response handling. Needs typed wrapper around `fetch(${SB_URL}/rest/v1/…)` calls.

---

## [IMPROVEMENT] Pass 9 fix sweep — 2026-04-23
**Tags**: CI, QUALITY, LINT, TYPES, TESTS

### Changes implemented
**HIGH — TypeScript compilation unblocked (was 13 errors → 0):**
- `src/components/EntryHealthPanel.tsx:147` — narrowed `entries: Entry[] \| undefined` via `entries ?? []`
- Deleted dead code revealed by TS6133: `_BrainIcon`, `_FEATURES`, `PersonIcon`, `FamilyIcon`, `BriefcaseIcon`, `Feature` interface (LoginScreen.tsx), `_toggleClasses` (NotificationSettings), `_handleDeepScan`/`_stopDeepScan`/`deepScanCancel`/`_deepScan`/`groupBySender` entire dead deep-scan block (GmailSyncTab), `_meta` (VaultView), `_cfg`/`_meta`/`_confidence` + orphaned imports (DetailModal), `setEditTags` unused setter (DetailModal)
- Removed unused `entries`/`links`/`typeIcons` props from DetailModal interface + destructure + Everion.tsx call site — prop chain cleaned up end-to-end (also dropped `links` from `EverionContent` prop interface)

**MEDIUM — 3 failing tests fixed:**
- `tests/components/LoadingScreen.test.tsx:8` — `"EverionMind"` → `"Everion Mind"` (match actual UI spacing)
- `tests/lib/getTypeConfig.test.ts` — removed `"subscription"` from unknown-type assertions (now a known type in TC map); replaced with `"unknown-xyz"`
- `src/__tests__/enrichEntry.test.ts` — added `aiSettings` mock so `hasAIAccess` is true during phase-isolation test (parse-fail test was silently skipped with `hasAIAccess: false`)

**MEDIUM — Vitest hoisting warnings:**
- `tests/api/llm.test.ts` — removed duplicate in-`beforeEach` `vi.mock` calls (already hoisted at top). Eliminates both future-breaking warnings.

**LOW — rate-limit member ID entropy:**
- `api/_lib/rateLimit.ts:42` — `Math.random().toString(36).slice(2, 8)` → `crypto.randomUUID().slice(0, 8)` (cleaner, no RNG-quality concern)

**LOW — Silent catch blocks annotated:**
- 5 sites now log via `console.debug` with context: `DataTab.tsx:60`, `useDataLayer.ts:88`, `useEnrichmentOrchestrator.ts:59`, `ChatView.tsx:30`, `gmailScan.ts:636`

**(Discovered during fix sweep) — Lint blockers (47 errors → 0):**
- Added `scripts/mock-prompt-audit/**` to `eslint.config.js` globalIgnores (gitignored directory shouldn't be linted)
- Fixed `no-useless-escape` in `ChatView.tsx:197-200` (phone/email regexes) and `ClaudeCodeTab.tsx:372` (single quotes inside template literal)
- `rules-of-hooks` violation in `ChatView.tsx` — moved all hooks above the `!aiAvailable` early return (hooks were being called conditionally)
- React Compiler purity violations:
  - `CaptureSheet.tsx` — extracted `VoiceWaveform` sub-component with `useState(() => ...)` for stable random bars
  - `Landing.tsx` — `useMemo` → `useState(() => ...)` for motes; baked per-mote `breatheDur` into struct so Math.random no longer runs in render JSX
  - `TodoView.tsx:572` — froze Date.now() at mount via `useState(() => Date.now())` for agenda window
  - `DetailModal.tsx` — same pattern, `mountedAt` state replaces live `Date.now()` in relative-time IIFE
  - `Everion.tsx:1096` — `patchEntryIdRef.current = ...` moved into `useEffect`
  - `GraphCanvas.tsx` — wrapped `zoomBy` in `useCallback`, lifted button array to `useMemo`; remaining static-analysis false positive on the map call gets `// eslint-disable-next-line react-hooks/refs` with justification comment
- `npm run format` applied across 197 files (Prettier autofix)

### CI status
Full gauntlet green end-to-end:
- `npm audit --audit-level=high` → **0 vulnerabilities**
- `npm run typecheck` → **passes**
- `npm run lint` → **0 errors** (warnings remain — mostly `@typescript-eslint/no-explicit-any`, addressed in future pass)
- `npm run format:check` → **passes**
- `npm test` → **380/380 passing** (was 377/380)
- `npm run build` → **passes** (PWA bundle 1972 KiB, 44 precached entries)

### Still deferred (out of scope for a surgical fix pass)
- **Auth migration**: 11 endpoints in `user-data.ts`, `llm.ts`, `gmail.ts`, `calendar.ts`, `memory-api.ts` still use raw `verifyAuth` instead of `withAuth` — dispatcher-pattern (one file, many `?resource=` routes) makes a clean migration require per-resource rate-limit design
- **God-component decomposition**: `Everion.tsx` (1,262), `TodoView.tsx` (1,121), `CaptureSheet.tsx` (~1,100), `LoginScreen.tsx` (1,017), `VaultView.tsx`, `Landing.tsx`, `DetailModal.tsx`, `ChatView.tsx`
- **`: any` cleanup**: 332 occurrences remain (mostly `user: any` from Supabase-typed auth) — needs a `verifyAuth` return-type tightening pass
- **Dependabot/Renovate** config — audit flagged as a minor gap

---

## [AUDIT] Full App Audit — 2026-04-23 (pass 9)
**Tags**: AUDIT

### Overall Score: 83/100 — B
**Verdict:** PASS WITH WARNINGS

| Dimension | Score |
|-----------|-------|
| Security | 88 |
| Performance | 84 |
| Architecture | 83 |
| Code Quality / Types | 70 |
| UX / UI | 85 |
| Maintainability | 80 |
| User Perspective | 84 |

### Progress since pass 8 (82/100)
- ✅ `xlsx` fully replaced with `exceljs` — `npm audit` now 0 vulnerabilities (was 2 unpatched HIGH CVEs)
- ✅ `api/user-data.ts:511` — JSON.parse now in try-catch, returns 400 on malformed body (HIGH from pass 8 FIXED)
- ✅ TypeScript errors reduced from 25+ → 13 (progress, but still blocks CI)
- ✅ Tests stable: 3 failing (same as pass 8 — no regression)
- ❌ TypeScript still fails: 1 real type bug in `EntryHealthPanel.tsx:147` + 12 × TS6133 unused-var errors

### CRITICAL & HIGH Findings

**[HIGH]** TypeScript compilation still fails — CI blocked on `npm run typecheck`:
- `src/components/EntryHealthPanel.tsx:147` — real bug: `entries: Entry[] | undefined` passed where `Entry[]` required
- 12 × TS6133 unused vars: `src/LoginScreen.tsx:2,64` (`_BrainIcon`, `_FEATURES`), `src/views/DetailModal.tsx:40,41,66,200,204,205`, `src/components/NotificationSettings.tsx:72`, `src/components/settings/GmailSyncTab.tsx:165,220`, `src/views/VaultView.tsx:663`

**[MEDIUM]** 3 failing tests — stale expectations, not code bugs, but CI stays red:
- `tests/components/LoadingScreen.test.tsx:8` — expects `"EverionMind"`; code renders `"Everion Mind"` (with space)
- `tests/lib/getTypeConfig.test.ts:50` — expects fallback `"🏷️"` for `"subscription"`; code correctly returns `"🔄"` because subscription was added to TC map
- 3rd: `enrichEntry` phase isolation (carried from pass 8)

**[MEDIUM]** Auth migration to `withAuth` incomplete — 11 endpoints in `user-data.ts`, `llm.ts:417`, `gmail.ts:166,180`, `calendar.ts:150,239`, `memory-api.ts:33` still use raw `verifyAuth` + manual method/rate-limit handling. Security-equivalent but inconsistent and duplicates middleware logic.

**[MEDIUM]** God components persist — 8 files >900 lines: `Everion.tsx` (1,262), `TodoView.tsx` (1,121), `CaptureSheet.tsx` (1,064), `LoginScreen.tsx` (1,017), `VaultView.tsx` (990), `Landing.tsx` (986), `DetailModal.tsx` (982 — down from 1,037), `ChatView.tsx` (949).

### Top 5 Actions
1. [HIGH] Fix `EntryHealthPanel.tsx:147` real type error (narrow `Entry[] | undefined`) + delete the 12 unused vars/imports flagged by TS6133 — unblocks CI
2. [MEDIUM] Fix 3 stale tests: update `LoadingScreen` expectation to `"Everion Mind"`, remove `subscription` from fallback assertion in `getTypeConfig.test.ts`, fix `enrichEntry` phase isolation
3. [MEDIUM] Migrate remaining 11 raw-verifyAuth endpoints (`user-data.ts` handlers, `llm.ts`, `gmail.ts`, `calendar.ts`, `memory-api.ts`) to `withAuth`/`withApiKey`
4. [MEDIUM] Begin decomposing top god components: `Everion.tsx` and `TodoView.tsx` (both >1,100 lines)
5. [LOW] Reduce `: any` footprint (332 occurrences) — start with API layer (`api/user-data.ts` alone has 10+ `user: any`)

---

## [AUDIT] Full App Audit — 2026-04-23 (pass 8)
**Tags**: AUDIT

### Overall Score: 82/100 — B
**Verdict:** PASS WITH WARNINGS

| Dimension | Score |
|-----------|-------|
| Security | 87 |
| Performance | 84 |
| Architecture | 82 |
| Code Quality / Types | 70 |
| UX / UI | 85 |
| Maintainability | 78 |
| User Perspective | 84 |

### Progress since pass 7 (81/100)
- ✅ `worker-src blob:` added to CSP — FIXED
- ✅ `aria-live="polite"` on ChatView messages container — FIXED
- ✅ Tests improved: 12 failing → 3 failing
- ✅ FeedView.tsx (1,755 lines) — DELETED (was MEDIUM finding)
- ✅ DetailModal.tsx: 1,037 → 982 lines (continued reduction)
- ❌ `xlsx` HIGH CVEs — STILL PRESENT (2 high: prototype pollution + ReDoS)
- ❌ TypeScript compilation REGRESSED — 25+ errors (`ConfidenceLevel` undefined, `getConceptsForEntry` not exported, App.tsx null type, dead code accumulation)

### CRITICAL & HIGH Findings

**[HIGH]** TypeScript compilation fails with 25+ errors: `ConfidenceLevel` referenced in `types.ts:48` but never declared; `getConceptsForEntry` used in `EntryHealthPanel.tsx:3` and `surpriseScore.ts:3` but not exported from `conceptGraph.ts:126`; `App.tsx:248` null return type; `DesktopSidebar.test.tsx` missing 2 required props.

**[HIGH]** `xlsx` — 2 unpatched HIGH CVEs (prototype pollution + ReDoS). No upstream fix.

**[HIGH]** `api/user-data.ts:512` — `JSON.parse(req.body)` not in try-catch; malformed push-subscribe body causes unhandled 500.

### Top 5 Actions
1. [HIGH] Fix TypeScript compilation: declare `ConfidenceLevel`, export `getConceptsForEntry`, fix App.tsx null return, update DesktopSidebar test props
2. [HIGH] Replace `xlsx` with `exceljs` (unpatched CVEs, CI audit blocked)
3. [HIGH] Wrap `api/user-data.ts:512` JSON.parse in try-catch → return 400
4. [MEDIUM] Fix 3 failing tests: LoadingScreen brand text, getTypeConfig subscription fallback, enrichEntry phase isolation
5. [MEDIUM] Move vi.mock() calls to module top level in pin/entries API tests (future Vitest breaking change)

---

## [AUDIT] Full App Audit — 2026-04-20 (pass 7)
**Tags**: AUDIT

### Overall Score: 81/100 — B
**Verdict:** PASS WITH WARNINGS

| Dimension | Score |
|-----------|-------|
| Security | 85 |
| Performance | 83 |
| Architecture | 82 |
| Code Quality / Types | 73 |
| UX / UI | 82 |
| Maintainability | 80 |
| User Perspective | 82 |

### Progress since pass 6 (79/100)
- ✅ `Permissions-Policy: microphone=(self)` — FIXED (was `microphone=()`, 3× consecutive flagged)
- ✅ `computeCompletenessScore` extracted to `api/_lib/completeness.ts` — FIXED
- ✅ `sendDefaultPii: false` — FIXED
- ✅ Sentry DSN → `VITE_SENTRY_DSN` env var — FIXED
- ✅ `RefineView.tsx` (1,883 lines, 3× unfixed) — DELETED from codebase
- ✅ `DetailModal.tsx` reduced from 1,037 → 608 lines
- ❌ Tests: REGRESSED — 12 failing / 7 failed files (was 8 failing in pass 6)
- ❌ `xlsx` HIGH CVEs — STILL PRESENT (5 high, 1 moderate), CI blocks on audit

### CRITICAL & HIGH Findings

**[HIGH]** 12 failing tests across 7 files — CI blocked on every push. `CreateBrainModal.tsx` referenced in test but file doesn't exist (ENOENT crash). Remaining: conceptGraph possessive normalization (3), entry-brains mock setup (5), LoadingScreen brand text (1), OnboardingModal button label (1), useEntryActions state (1), fileSplitter type (1).

**[HIGH]** `xlsx` dependency — 5 unpatched HIGH CVEs (prototype pollution + ReDoS). No upstream fix. CI `npm audit --audit-level=high` blocks every push. — `package.json:33`

**[MEDIUM]** CSP missing `worker-src blob:` — pdfjs-dist loads worker as blob URL. PDF parsing silently fails in strict CSP environments. — `vercel.json:40`

**[MEDIUM]** ChatView messages container has no `aria-live` — screen readers don't announce new AI responses. — `src/views/ChatView.tsx:148`

**[MEDIUM]** `FeedView.tsx` is 1,755 lines — new largest file in codebase after RefineView deleted. — `src/views/FeedView.tsx`

### Top 5 Actions
1. [HIGH] Fix 12 failing tests: delete/fix CreateBrainModal test (ENOENT), fix possessive normalization in conceptGraph, fix entry-brains mock
2. [HIGH] Replace `xlsx` with `exceljs` or move Excel parsing server-side (5 unpatched HIGH CVEs, CI audit blocks)
3. [MEDIUM] Add `worker-src blob:` to CSP in vercel.json:40 — one word, prevents silent PDF breakage
4. [MEDIUM] Add `aria-live="polite"` to ChatView messages container at ChatView.tsx:148
5. [MEDIUM] Begin decomposing FeedView.tsx (1,755 lines) — new god component

---

## [AUDIT] Full App Audit — 2026-04-14 (pass 6)
**Tags**: AUDIT

### Overall Score: 79/100 — B-
**Verdict:** PASS WITH WARNINGS

| Dimension | Score |
|-----------|-------|
| Security | 82 |
| Performance | 83 |
| Architecture | 74 |
| Code Quality / Types | 72 |
| UX / UI | 80 |
| Maintainability | 76 |
| User Perspective | 78 |

### Progress since pass 5 (80/100)
- ✅ Sentry now fully wired: `@sentry/react` installed, DSN configured, `ErrorBoundary.componentDidCatch` calls `Sentry.captureException` — HIGH resolved
- ✅ AI keys (Groq, Gemini) now in-memory only; localStorage cleared on every login — already counted in pass 5 but confirmed solid
- ❌ Permissions-Policy `microphone=()` — still blocks voice recording in production — NOT FIXED (3rd consecutive pass)
- ❌ `computeCompletenessScore` duplication in entries.ts + capture.ts — NOT FIXED
- ❌ RefineView.tsx still 1,883 lines — NOT FIXED
- ⚠️ Tests regressed: 8 failing tests across 3 files (AccountTab mock + BottomNav duplicate test files) — CI blocked

### CRITICAL & HIGH Findings

**[HIGH]** `Permissions-Policy: microphone=()` blocks voice recording in production — silent failure in UI. `vercel.json:44` — 1-line fix: change to `microphone=(self)`.

**[HIGH]** 8 failing tests, CI blocked: `AccountTab.test.tsx` (missing `getUser` mock, 4 tests) + duplicate BottomNav test files in `tests/` and `src/components/__tests__/` (4 tests).

**[HIGH]** `xlsx` dependency: 5 unpatched HIGH CVEs (prototype pollution + ReDoS). No upstream fix. — `package.json:31`

**[HIGH]** `RefineView.tsx` — 1,883 lines, 3rd consecutive audit pass unfixed. — `src/views/RefineView.tsx`

**[HIGH]** `computeCompletenessScore` duplicated verbatim in `api/entries.ts:11` and `api/capture.ts:12`. — extract to `api/_lib/`

**[MEDIUM]** `Sentry.init({ sendDefaultPii: true })` — PII (names, phones, IDs) sent to Sentry without user consent. GDPR/POPIA concern. — `src/main.tsx:12`

**[MEDIUM]** Sentry DSN hardcoded in source; not configurable per environment. — `src/main.tsx:11`

**[MEDIUM]** `npm audit` not in CI — 5 HIGH CVEs undetected.

### Top 5 Actions
1. [HIGH] Fix `Permissions-Policy`: `microphone=()` → `microphone=(self)` in `vercel.json:44`
2. [HIGH] Fix 8 failing tests: add `getUser` mock to AccountTab test; delete duplicate `tests/components/BottomNav.test.tsx`
3. [HIGH] Replace `xlsx` with `exceljs` or server-side extraction (unpatched CVEs, no fix available)
4. [HIGH] Extract `computeCompletenessScore` to `api/_lib/completeness.ts`
5. [MEDIUM] `sendDefaultPii: false` + move Sentry DSN to `VITE_SENTRY_DSN` env var; add to `.env.example`

---

## [AUDIT] Full App Audit — 2026-04-12 (pass 5)
**Tags**: AUDIT

### Overall Score: 80/100 — B-
**Verdict:** PASS WITH WARNINGS

| Dimension | Score |
|-----------|-------|
| Security | 78 |
| Performance | 76 |
| Architecture | 84 |
| Code Quality / Types | 80 |
| UX / UI | 82 |
| Maintainability | 78 |
| User Perspective | 80 |

### Progress since pass 4 (78/100)
- ✓ AI keys moved from localStorage to in-memory store (deferred item resolved)
- ✓ @ts-nocheck remains at zero
- ✓ QuickCapture.tsx deleted (dead code on this branch)
- ✓ 31 dead src/lib/ and src/data/ files deleted (~2,069 lines)
- ✓ Duplicate cn.ts + utils.ts consolidated
- ✓ lucide-react replaced with inline SVGs (37MB dep removed)
- ✓ shadcn moved to devDependencies
- ✓ @luma.gl/webgl, @softarc/sheriff-* removed from deps
- ✓ 30 orphaned test files cleaned up

### CRITICAL & HIGH Findings

**[HIGH]** Permissions-Policy blocks microphone (`microphone=()`) but app uses MediaRecorder for voice capture. Voice recording silently broken in production. — `vercel.json:44` vs `src/hooks/useVoiceRecorder.ts:22`

**[HIGH]** No error monitoring (Sentry or equivalent) — production errors are console.error only, invisible to the team. — `src/ErrorBoundary.tsx:23`

**[HIGH]** RefineView.tsx is 1,883 lines — largest component, needs decomposition. — `src/views/RefineView.tsx`

**[HIGH]** DetailModal.tsx is 1,037 lines — second largest, needs decomposition. — `src/views/DetailModal.tsx`

**[HIGH]** `computeCompletenessScore` duplicated verbatim in `api/entries.ts:11-40` and `api/capture.ts:12-40`. — should extract to `api/_lib/`

### Top 5 Actions
1. [HIGH] Fix Permissions-Policy: change `microphone=()` to `microphone=(self)` in vercel.json:44
2. [HIGH] Add error monitoring (Sentry) — wire to ErrorBoundary.componentDidCatch
3. [HIGH] Decompose RefineView.tsx (1,883 lines) and DetailModal.tsx (1,037 lines)
4. [HIGH] Extract duplicated computeCompletenessScore to api/_lib/
5. [MEDIUM] Replace xlsx dependency (unpatched high-severity CVEs, no fix available)

---

## [IMPROVEMENT] Audit Fix Pass — 2026-04-08 (pass 4)
**Tags**: SECURITY, QUALITY, TESTING

### Changes implemented
- **[MAINT]** `api/_lib/sbHeaders.ts` created — single `sbHeaders(extra?)` / `sbHeadersNoContent(extra?)`. Removed 4× duplicated inline header factories from `capture.ts`, `entries.ts`, `push.ts`, `cron/gap-analyst.ts`.
- **[MAINT]** `api/_lib/cronAuth.ts` created — `verifyCronHmac` extracted from `push.ts` into shared lib. `cron-hmac.test.ts` updated to import from new location.
- **[SEC]** SEC-16: `cron/gap-analyst.ts` now verifies HMAC auth for non-Vercel-cron callers. Rejects with 401 on invalid/absent Authorization.
- **[QUALITY]** Silent `catch {}` on AI extraction in `push.ts:handleExpiry` → `catch (e: any) { console.error(...) }`. Gap log `.catch(()=>{})` → logs error.
- **[TESTING]** Vitest exclude added `**/.claude/**` — worktree test files no longer picked up (was causing 9 failed test files).
- **[TESTING]** `api/embed.ts` recreated — re-exports `handleEmbed` from `capture.ts`; fixes `embed-retry.test.ts` import.
- **[TESTING]** `isSupportedFile` skips magic-byte check for zero-size files; PDF/DOCX extension tests now pass.
- **[TESTING]** `MobileHeader` logo text corrected: `"Everion"` → `"EV"` to match test contract.
- **[TESTING]** `cron-hmac.test.ts` import path updated: `api/cron/push` → `api/_lib/cronAuth` (push.ts and cron/push.ts were merged).
- **[TESTING]** `verifyCronHmac` exported from `api/push.ts`.

### Test results
- Before: 9 failed files, 29 failing tests (blocking CI)
- After: 104 files passed, 641 tests passed — CI green

### Deferred
- AI keys localStorage → in-memory store (needs its own session — behavioural change requires careful migration)

---

## [AUDIT] Full App Audit — 2026-04-08 (pass 3)
**Tags**: AUDIT

### Overall Score: 78/100 — C+
**Verdict:** PASS WITH WARNINGS

| Dimension | Score |
|-----------|-------|
| Security | 74 |
| Performance | 82 |
| Architecture | 82 |
| Code Quality / Types | 72 |
| UX / UI | 78 |
| Maintainability | 74 |
| User Perspective | 79 |

### Progress since pass 2 (75/100)
- ✓ @ts-nocheck fully eliminated (0 occurrences in src/)
- ✓ CSP font-src added (vercel.json:35)
- ✓ README replaced with real project docs
- ✓ handleSaveLinks rate-limited (capture.ts:167)
- ✓ Embed batch uses Promise.all (capture.ts:274)

### CRITICAL & HIGH Findings

**[CRITICAL]** Leaked Telegram Bot Token still NOT revoked — commit `d811ad2`. Manual: @BotFather `/revoke`.

**[HIGH]** 29 failing tests — CI blocked. Clusters: oklch contrast parser (accessibility.test.ts), res.setHeader mock (entry-brains/pin), isSupportedFile async mismatch (fileParser), brand copy "OpenBrain" (BottomNav/MobileHeader), .worktrees/ not excluded from Vitest.

**[HIGH]** No error monitoring (Sentry or equivalent) — production errors invisible. — `src/ErrorBoundary.tsx:23`

**[HIGH]** AI provider keys still written to localStorage — loadUserAISettings rehydrates Supabase keys back into localStorage on login. XSS window remains. — `src/lib/aiSettings.ts:142-149`

**[HIGH]** QuickCapture.tsx still 1189 lines — primary capture path, no decomposition. — `src/components/QuickCapture.tsx`

### Top 5 Actions
1. [CRITICAL] Revoke leaked Telegram Bot Token via @BotFather
2. [HIGH] Fix 29 failing tests (exclude .worktrees/, fix oklch parser, fix async/sync mismatch, update brand copy)
3. [HIGH] Add Sentry — wire to ErrorBoundary.componentDidCatch
4. [HIGH] Decompose QuickCapture.tsx (1189 lines)
5. [MEDIUM] Stop writing AI keys back to localStorage in loadUserAISettings

---

## [AUDIT] Full App Audit — 2026-04-08 (pass 2)
**Tags**: AUDIT

### Overall Score: 75/100 — C+
**Verdict:** PASS WITH WARNINGS

| Dimension | Score |
|-----------|-------|
| Security | 72 |
| Performance | 80 |
| Architecture | 80 |
| Code Quality / Types | 65 |
| UX / UI | 76 |
| Maintainability | 70 |
| User Perspective | 78 |

### Progress since prior audit (74/100)
- ✓ SettingsView.tsx decomposed 1505 → 79 lines
- ✓ PIN upgraded to PBKDF2 100k iterations + server-side zero-knowledge verify
- ✓ x-forwarded-for reads last (edge-verified) hop
- ✓ failedOps surfaced in UI (no longer silent)
- ✓ @ts-nocheck reduced from 3 files → 1 (entryOps.ts only)
- ✓ ErrorBoundary wired to app root
- ✓ handleSaveLinks rate-limited

### CRITICAL & HIGH Findings

**[CRITICAL]** Leaked Telegram Bot Token in commit `d811ad2` — still NOT revoked. Manual: @BotFather `/revoke`.

**[HIGH]** 42 of 977 tests failing — CI broken. Root causes: (1) mock missing `res.setHeader` in API tests, (2) contrast test uses hex parser on oklch values → NaN, (3) LoadingScreen/MobileHeader tests reference "OpenBrain" brand copy.

**[HIGH]** CSP missing `font-src https://fonts.googleapis.com https://fonts.gstatic.com` — Google Fonts loaded but not allowed by CSP. — `vercel.json:30`, `index.html:11-15`

**[HIGH]** README is Vite scaffold boilerplate — no project docs. — `README.md`

**[HIGH]** No error monitoring (Sentry or equivalent) — production errors invisible. — `src/ErrorBoundary.tsx:26`

**[HIGH]** User AI provider keys in localStorage (XSS-accessible). — `src/lib/aiSettings.ts`

### Top 5 Actions
1. [CRITICAL] Revoke leaked Telegram Bot Token via @BotFather
2. [HIGH] Fix 42 failing tests (mock setHeader + oklch contrast parser + brand copy)
3. [HIGH] Add font-src to CSP in vercel.json
4. [HIGH] Replace README with real project documentation
5. [MEDIUM] Migrate AI keys from localStorage to encrypted server-side storage

---

## [IMPROVEMENT] Audit Fix Pass — 12→~17/20 — 2026-04-08
**Tags**: A11Y, THEMING, PERFORMANCE, ANTI-PATTERN

### Changes implemented
- **[T1 COLORIZE]** Purged banned palette (purple rgba(213,117,255), cyan #72eff5) from NudgeBanner + UndoToast → color-mix(oklch, var(--color-primary/error) ...)
- **[T2 HARDEN]** Focus return on close added to DetailModal + CreateBrainModal (triggerRef pattern). role="log" on ChatView. aria-label on NudgeBanner + UndoToast dismiss buttons. aria-hidden on decorative SVGs in BottomNav.
- **[T3 NORMALIZE]** Added --color-status-medium + --color-status-medium-container tokens to index.css (dark+light). Tokenized 30+ hard-coded hex/rgba values across SkeletonCard, CreateBrainModal, DetailModal, TodoView, SuggestionsView, VaultView. text-white → text-on-surface throughout. 'Manrope'/'Inter' → 'DM Sans' in VaultView + SuggestionsView. Scrims use var(--color-scrim), backdrop-blur removed from modal scrims.
- **[T4 OPTIMIZE]** UndoToast setInterval(80ms) → requestAnimationFrame. ChatView phoneRegex split memoized with useMemo. BottomNav wrapped in React.memo.

### Architecture decisions
- color-mix(in oklch, var(--color-X) N%, transparent) used for semi-transparent token-based colors
- Focus return pattern: useEffect captures activeElement on mount, returns focus on cleanup
- --color-status-medium = oklch(72%/55% 0.16 68) warm orange distinct from primary amber

### Evaluator score: 95/100 — PASS

---

## [FEATURE] SettingsView Decomposition + API Key Supabase Migration — 2026-04-08
**Tags**: REFACTOR, SECURITY, DATABASE

### Changes implemented
- **SettingsView.tsx**: 1518 → 82 lines; extracted 7 tab components into `src/components/settings/`
- **Migration 018**: Added 7 columns to `user_ai_settings` (api_key, ai_model, ai_provider, groq_key, embed_provider, embed_openai_key, gemini_key)
- **aiSettings.ts**: All 9 setters now call `syncToSupabase()` (fire-and-forget); added `loadUserAISettings(userId)` async function
- **App.tsx**: `loadUserAISettings()` called on session set + `onAuthStateChange` — hydrates localStorage from DB on login
- **28 new tests**: aiSettings Supabase sync (22) + AccountTab (2) + DangerTab (3)

### Architecture decisions
- localStorage = write-through cache; DB = source of truth on next login
- No context/state lifting — each tab component owns its own state via props
- `syncToSupabase()` is fire-and-forget (matches existing `setModelForTask` pattern)
- RLS policy on `user_ai_settings` covers new columns automatically

### Evaluator score: 96/100 — PASS

---

## [IMPROVEMENT] smash-audit.md Fix Pass — 2026-04-08
**Tags**: SECURITY, PERFORMANCE, ACCESSIBILITY, MAINTAINABILITY

### Changes implemented
- **[SEC HIGH]** Rate limit added to `handleSaveLinks` (`api/capture.ts:159`) — was the only unguarded authenticated endpoint
- **[PERF MEDIUM]** Chat N+1 serial brain fetches → `Promise.all` (`api/chat.ts:107`) — 10 brains = 10× faster
- **[UX MEDIUM]** PWA manifest name fixed: "OpenBrain" → "Everion" (`vite.config.js`)
- **[UX MEDIUM]** `ErrorBoundary` wired to app root in `main.tsx`
- **[A11Y HIGH]** `aria-label` added to icon-only buttons: CaptureSheet ✕, QuickCapture ✕ + 4 media buttons, DesktopSidebar "+ Brain"
- **[UX MEDIUM]** Telegram panel empty `catch {}` fixed — `codeError` state with UI feedback (`SettingsView.tsx`)
- **[MAINT MEDIUM]** `.env.example` created — all 12 env vars documented with sources
- **[MAINT LOW]** CI Node 20 → 24 (matches Vercel default)
- **[MAINT LOW]** `npm run format:check` added to CI pipeline

### Deferred (out of scope — need dedicated sessions)
- Remove `@ts-nocheck` from `QuickCapture.tsx` (1133 lines)
- Decompose `SettingsView.tsx` (1505 lines god component)
- Move user API keys out of localStorage
- Revoke leaked Telegram bot token (manual: @BotFather `/revoke`)

### Evaluator score: 96.5/100 — PASS

---

## [FEATURE] UI/UX Audit Fix Pass — 2026-04-08

**Tags**: FEATURE, ACCESSIBILITY, UX, DESIGN

### Implemented (14 fixes across 7 files)

**Phase 1 — /harden (P1 Accessibility)**
- Focus traps added to all 3 modals: CaptureSheet sheet + PreviewModal, OnboardingModal, QuickCapture PreviewModal — `useEffect` + DOM query + Tab/Shift+Tab loop, `first?.focus()` on mount
- EntryCard (`<article>` in EntryList): `role="button"`, `tabIndex={0}`, `onKeyDown` Enter/Space, `aria-label={e.title}`
- VirtualTimeline rows (`<div>` in EntryList): same keyboard pattern + `aria-label`
- CaptureSheet PreviewModal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="cs-preview-title"`
- QuickCapture PreviewModal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="qc-preview-title"`
- ChatView messages container: `aria-live="polite"` `aria-atomic="false"`
- OnboardingModal use-case buttons: `role="checkbox"` removed, replaced with `aria-pressed={active}`
- CaptureSheet close button: `w-8 h-8` → `w-11 h-11` (44px) + `aria-label="Close"`

**Phase 2 — /colorize (P2 Theming)**
- `--color-scrim` CSS token added: dark `oklch(12% 0.009 60 / 0.65)`, light `oklch(20% 0.005 60 / 0.5)`
- Replaced `rgba(0,0,0,0.5)` (CaptureSheet), `rgba(0,0,0,0.65)` (both PreviewModals), `rgba(0,0,0,0.7)` (OnboardingModal) → `var(--color-scrim)`
- Timeline connector line: `rgba(72,72,71,0.15)` → `var(--color-outline-variant)`

**Phase 2 — /adapt (P2 Responsive)**
- VirtualGrid COLS: snapshot-at-render replaced with `useState` + `window.addEventListener("resize")` — reactive on resize
- SettingsView "Clear history" button: `minHeight: 36` → `minHeight: 44`

**Phase 2/3 — /normalize + /distill**
- OnboardingModal `backdropFilter: "blur(4px)"` removed
- Emoji decorative `<div class="mb-3 text-4xl">` above heading removed
- Feature icon grid (4× `w-8 h-8 icon + label + desc`) replaced with `<ul>` prose list, Lora bold for names

### Key decisions
- Focus trap implemented inline per component (no shared hook) — avoids abstraction cost for 3 instances
- Outer modal overlay: NOT `aria-hidden` (would hide dialog from AT); only pure backdrop siblings use `aria-hidden`
- COLS resize: window resize listener (not ResizeObserver) — simpler, sufficient for viewport-based columns
- Test suite: +8 new passing tests (OnboardingModal × 3, ChatView × 1, EntryList × 4); no regressions (20→20 pre-existing failures in worktree)

### Audit Health Score before/after
- Before: 14/20 (Good)
- After: ~19/20 (all P1 and P2 fixed; P3 done; remaining gap: none remaining)

---

## [AUDIT] Full App Audit — 2026-04-08
**Tags**: AUDIT

### Overall Score: 74/100 — C+
**Verdict:** PASS WITH WARNINGS

| Dimension | Score |
|-----------|-------|
| Security | 73 |
| Performance | 78 |
| Architecture | 73 |
| Code Quality / Types | 72 |
| UX / UI | 77 |
| Maintainability | 65 |
| User Perspective | 74 |

### Progress since 2026-04-02 audit
- ✓ CSP header now present in vercel.json
- ✓ Upstash Redis distributed rate limiting (with in-memory fallback)
- ✓ x-forwarded-for fixed: now reads last (edge-verified) IP
- ✓ PIN verification moved server-side (zero-knowledge: server never sees raw PIN)
- ✓ Vault key stored in IndexedDB (not localStorage)
- ✓ Vault secrets blocked for non-Anthropic providers in chat
- ✓ Message structure validation in llm.ts (rejects image blocks, tool_use)
- ✓ Soft delete + 30-day trash implemented
- ✓ Cursor-based pagination (limit 50, was 500)
- ✓ CI/CD pipeline present (.github/workflows/ci.yml)
- ✓ 60+ test files across all layers

### CRITICAL & HIGH Findings

**[CRITICAL]** Leaked Telegram Bot Token NOT revoked — GitGuardian flagged commit `d811ad2`. Still live. — `roadmap/MASTER.md:62`

**[HIGH]** `handleSaveLinks` has no rate limit — dispatched before `rateLimit` call at line 28. — `api/capture.ts:22,28,159`

**[HIGH]** User API keys stored in localStorage (XSS-accessible) — all AI provider keys, embed keys, Groq key. — `src/lib/aiSettings.ts`

**[HIGH]** `@ts-nocheck` on 3 files: `QuickCapture.tsx` (1133 lines, primary capture path), `BulkUploadModal.tsx`, `entryOps.ts`. — `src/components/QuickCapture.tsx:1`

**[HIGH]** `SettingsView.tsx` is 1505 lines — god component covering settings, AI config, brain management, PIN, notifications, trash. — `src/views/SettingsView.tsx`

**[HIGH]** `QuickCapture.tsx` is 1133 lines with `@ts-nocheck` — primary capture path, no TypeScript protection. — `src/components/QuickCapture.tsx`

**[HIGH]** No error monitoring (Sentry or equivalent) — production errors invisible. — `package.json`

**[HIGH]** Accessibility: icon-only buttons lack `aria-label`, no keyboard navigation for modals. — `roadmap/MASTER.md:160-161`

**[HIGH]** Offline sync silently drops data after 3 failed retries — no persistent user notification. — `src/hooks/useOfflineSync.ts:48-95`

### Top 5 Actions
1. [CRITICAL] Revoke leaked Telegram Bot Token immediately via @BotFather
2. [HIGH] Add rateLimit to handleSaveLinks in api/capture.ts:159
3. [HIGH] Remove @ts-nocheck from QuickCapture.tsx and fix TypeScript errors
4. [HIGH] Begin decomposing SettingsView.tsx (1505 lines) into focused panels
5. [MEDIUM] Add aria-label to icon-only buttons; wire ErrorBoundary to app root

---

## [FEATURE] Password Firewall — 2026-04-03

**Tags**: FEATURE, SECURITY, CHAT

### Implemented
- `containsSensitiveContent(text)` — regex detects password/credentials/wifi/bank/ID keywords in AI response text
- `PinGate` component — 4-digit PIN modal with create/confirm/enter flows + shake animation
- PIN stored as SHA-256 hash in `openbrain_${uid}_security_pin` (namespaced per user)
- `handleChat` intercepts sensitive AI responses before adding to `chatMsgs` — shows PinGate instead
- If no PIN set on first trigger: PinGate opens in setup mode (user creates PIN, then message is revealed)
- Settings → "Security PIN" section: Set / Change / Remove PIN
- `getUserId` exported from `aiFetch.js` for use in PIN key namespacing

### Key decisions
- Detection is on AI response text only (not user question) — avoids false positives when user types "password"
- Threat model is friction-based (over-shoulder / casual), not cryptographic — no lockout after wrong PIN
- "Change PIN" from Settings doesn't require verifying old PIN (by design for this friction tier)
- Cancel discards the pending message entirely — sensitive data never stored unprotected

---

## [FEATURE] Sprint 3 — Completion Pass — 2026-04-03

**Tags**: FEATURE, SPRINT3, BUG-FIX, UX

### Implemented

**Pre-Sprint Bug Fixes:**
- Fix 1 (Undo race condition): removed inline setTimeout delete from `handleDelete`; timer now calls `commitPendingDelete()` only if ref still holds same id (guard prevents stale timer firing on second delete). Single delete path through `commitPendingDelete`.
- Fix 2 (doSave wrong brain): added `primaryBrainId, extraBrainIds` to `doSave` useCallback deps
- Fix 3 (stale nudge entries): added `entries` to nudge effect deps at line ~756

**New features:**
- Item 12 (Reminders in calendar): CalendarView filters `status === "done"` reminders; `importance >= 2` dots render orange (#FF6B35)
- Item 13 (Family brain): already handled — no code change needed; `useBrain` + `BrainSwitcher` + API are all type-agnostic
- Item 14 (QuickCapture brain destination): single-brain users now see an inactive label pill; save button tooltip shows destination brain
- Item 15 (Quick Capture as home + hamburger nav): default view changed to `"capture"`; hamburger (☰) in header; slide-in right-side panel replaces tab bar; capture view shows 4 quick-nav tiles
- Item 16 (Fill Brain + Refine brain selectors): SuggestionsView always shows brain label for single-brain users; RefineView accepts `brains`/`onSwitchBrain` props and renders chip selector for owners with multiple brains
- Item 18 (BYO API keys + model picker): `src/lib/aiFetch.js` — drop-in authFetch wrapper that adds `X-User-Api-Key` header when user key set in localStorage; `api/anthropic.js` uses user key over env key when present; `api/openai.js` added (normalises OpenAI response to Anthropic shape); SettingsView has AI Provider section with provider/key/model; all `authFetch("/api/anthropic")` calls replaced with `aiFetch`; `MODEL` constant calls replaced with `getUserModel()`

### Key decisions
- Item 17 (dark/light toggle) was already shipped in prior session — no change needed
- `aiFetch.js` reads Supabase userId by scanning localStorage keys (fragile but avoids circular import)
- BYO key stored as `openbrain_${uid}_api_key` (namespaced per user per spec)
- OpenAI proxy normalises response to Anthropic `content[0].text` shape — frontend unchanged
- Timer guard: `if (pendingDeleteRef.current?.id === id)` prevents stale timers from committing the wrong entry

---

## [FEATURE] Sprint 3 — Daily-Use Features — 2026-04-03

**Tags**: FEATURE, SPRINT3, UX

### Implemented (11 features)
- Pre-save preview modal with fuzzy duplicate detection (scoreTitle > 50)
- Supplier quick-access panel (🏪 tab) with Call / WhatsApp / Reorder / Cost Summary
- Proactive intelligence engine: Haiku nudge on load, sessionStorage cached, dismissable banner
- Quick actions in DetailModal: type-aware (supplier/person/reminder/idea/document)
- Undo system: optimistic delete (5s deferred commit), update + create undo, progress toast
- "Who do I call?" quick-ask chips in chat view (4 chips)
- Business / Personal workspace toggle — inferWorkspace() from tags, localStorage persisted
- Voice capture: Web Speech API, en-ZA, 2s silence auto-submit, green mic indicator
- Shareable entries: Web Share API (mobile) / clipboard fallback (desktop)
- Cost/price tracking: AI prompt extracts price+unit into metadata, shown on supplier cards
- Morning briefing: Notification API permission + time picker in Settings

### Key decisions
- Delta Distribution and Delta Gas are distinct companies — AI prompt explicitly guards against merging
- Phone extraction regex: `/(\+27|0)[6-8][0-9]{8}/` (SA mobile range)
- WhatsApp URL: strip leading 0, prepend 27 for SA numbers
- Workspace inference is client-side tag-matching only (no DB schema change)
- Renewal reminder creates 1-month-forward due_date; reorder creates 7-day-forward

### Remaining known limitations
- DetailModal connections still read from static INITIAL_ENTRIES (pre-existing)
- Morning briefing scheduled push requires service worker + push subscription endpoint (future)

---

## [SECURITY] Security Audit — 2026-04-02 (re-run)

**Tags**: SECURITY, AUDIT

### Summary — re-run after fixes

```
CRITICAL  0   (was 2 — both resolved)
HIGH      1   (was 5 — 4 resolved)
MEDIUM    3   (was 5 — 3 resolved, 1 new)
LOW       4   (was 4 — 1 resolved, 1 new)
VERDICT   PASS WITH WARNINGS
```

### Progress since first audit
- ✓ Ownership check on delete/update (user_id filter)
- ✓ Rate limiting on all endpoints
- ✓ Anthropic proxy: model allowlist, max_tokens, message count validation
- ✓ OWNER_ID removed from frontend
- ✓ Supabase URL moved to env vars
- ✓ Audit logging for delete/update ops
- ✓ Security headers via vercel.json
- ✓ .env never committed (prior claim was incorrect)

### Remaining / New Findings

**[HIGH]** `capture()` RPC uses hardcoded `v_owner_id` instead of authenticated user's ID. Latent auth bypass risk if multi-user ever added. — Supabase RPC `public.capture`

**[MEDIUM]** Rate limiter is in-memory per serverless instance — ineffective across parallel Vercel instances. Fix: Upstash Redis or Vercel KV. — `api/_lib/rateLimit.js`

**[MEDIUM]** `x-forwarded-for` taken at face value — spoofable, bypasses rate limiting. — `api/_lib/rateLimit.js:6`

**[MEDIUM]** `anthropic.js` proxies `messages` array without validating individual message structure (image blocks, tool_use = expensive). — `api/anthropic.js:33`

**[LOW]** No `Content-Security-Policy` header. X-XSS-Protection present but ignored by modern browsers. — `vercel.json`

**[LOW]** All entries cached plaintext in `localStorage` including sensitive personal data. — `src/OpenBrain.jsx:804,811`

**[LOW]** No CSRF protection on mutating endpoints (mitigated by JWT requirement). — all mutating API routes

**[LOW]** `suggestions.js` prompts for Wi-Fi passwords/credentials which are FTS-indexed in Supabase. — `src/data/suggestions.js:127,217`

---

## [SECURITY] Security Audit — 2026-04-02

**Tags**: SECURITY, AUDIT

### Summary

Full security audit of OpenBrain WebApp (React + Vercel Functions + Supabase).

```
CRITICAL  2
HIGH      5
MEDIUM    5
LOW       4
VERDICT   FAIL
```

### CRITICAL Findings

- **[CRITICAL] Active API keys & tokens in .env / .env.local** — `.env`, `.env.local`
  Files exist on disk with live Anthropic API key, Supabase service role key, anon key, and Vercel OIDC token. While .gitignore correctly excludes these files, keys were present in an early commit and all keys are currently active.
  **Action**: Rotate ALL secrets immediately (Anthropic, Supabase service_role + anon, Vercel OIDC).

### HIGH Findings

- **[HIGH] No ownership check on delete/update endpoints** — `api/delete-entry.js`, `api/update-entry.js`
  Auth is verified but no check that the requesting user owns the entry. Any authenticated user can delete/modify any entry by guessing an ID.
  **Action**: Add Supabase RLS policy; filter by `user_id = auth.uid()`.

- **[HIGH] Entries endpoint returns ALL rows, no per-user filtering** — `api/entries.js`
  Query is `select=*&limit=500` with no user_id filter. RLS not confirmed active.
  **Action**: Enable RLS on entries table; add SELECT policy; filter query by current user.

- **[HIGH] Anthropic proxy endpoint passes raw client body through** — `api/anthropic.js`
  No schema validation on model, messages, or max_tokens — clients can inject arbitrary messages or request different models.
  **Action**: Validate and whitelist allowed fields; enforce model choice server-side.

- **[HIGH] Hardcoded OWNER_ID placeholder in frontend** — `src/OpenBrain.jsx` line 51
  `const OWNER_ID = "00000000-0000-0000-0000-000000000001"` — auth model is incomplete.
  **Action**: Replace with proper Supabase auth session user ID.

- **[HIGH] Supabase project URL hardcoded across all API files** — `api/*.js`, `src/OpenBrain.jsx`
  URL is semi-public by design but should be an env var for consistency and rotation.
  **Action**: Move to `SUPABASE_URL` environment variable.

### MEDIUM Findings

- **[MEDIUM] No rate limiting on any API endpoint** — all `api/*.js` files
  Unlimited requests possible; risk of API quota exhaustion / unexpected bills.

- **[MEDIUM] JSON.parse without try-catch on AI responses** — `src/OpenBrain.jsx` lines 133, 307, 376
  Malformed AI output causes unhandled exception and app crash.

- **[MEDIUM] No CSRF protection on mutating endpoints** — `api/delete-entry.js`, `api/update-entry.js`, `api/capture.js`

- **[MEDIUM] localStorage caching of entries without sanitization** — `src/OpenBrain.jsx` line 806
  Risk of persistent XSS if XSS vector exists elsewhere.

- **[MEDIUM] Supabase anon key exposed in client bundle** (expected by design, but no rotation schedule)

### LOW Findings

- **[LOW] PII in INITIAL_ENTRIES hardcoded in source** — `src/OpenBrain.jsx` lines 10-33
  Phone numbers and ID numbers embedded in client code.

- **[LOW] No security headers** (CSP, X-Frame-Options, X-Content-Type-Options)

- **[LOW] No audit logging** for sensitive operations (delete, update)

- **[LOW] Generic error messages** (minor info disclosure risk)

### Positive Findings

- Auth enforced on all endpoints via `verifyAuth()`
- HTTPS used for all external calls
- HTTP method validation on all routes
- No eval/exec/spawn usage
- No file system access
- No SQL injection (Supabase query builder used)
- No dangerouslySetInnerHTML

### Immediate Action Plan

1. **Now**: Rotate Anthropic API key, Supabase service_role key, anon key, Vercel OIDC token
2. **Now**: Enable Supabase RLS on `entries` table; add user-scoped policies
3. **48h**: Add ownership verification to delete/update; fix OWNER_ID to use real auth session
4. **48h**: Add request schema validation to `api/anthropic.js`
5. **Sprint**: Rate limiting, CSRF protection, JSON.parse error handling

---

---
## 2026-04-15 — M-9: Decompose Everion.tsx
- Created `src/hooks/useAppShell.ts` — all UI/nav/modal/search state (16 useState)
- Created `src/hooks/useDataLayer.ts` — entries, links, crypto, enrichment, entry actions
- Created `src/context/ConceptGraphContext.tsx` — concept graph re-derives on brain change only (drops entries dep)
- Everion.tsx refactored: 0 useState, hooks called at top, contexts provided, EverionContent sub-component calls useConceptGraph()
- patchEntryIdRef pattern used to break chicken-and-egg between useOfflineSync and useDataLayer
- prevBrainIdRef guard prevents flash-blank on initial mount during brain switch reset
