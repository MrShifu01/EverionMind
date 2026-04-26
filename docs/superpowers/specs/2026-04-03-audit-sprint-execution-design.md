# OpenBrain Audit Sprint — Execution Design
**Date:** 2026-04-03  
**Source:** audit-sprint.md (133 issues across Security, UX/UI, Performance, Code Quality)  
**Approach:** Option C — Quick Wins → Critical → Sprint 1 → Sprint 2 → Sprint 3

---

## Overview

Execute all 133 audit findings from the full OpenBrain audit in 5 sequential phases. Each phase ends in a git commit. User approves each phase before the next begins.

---

## Phase 1 — Quick Wins (~30 min)

Pre-scoped by the audit. 10 trivial fixes, all under 10 minutes each.

| # | File | Change |
|---|------|--------|
| 1 | `api/activity.js:34` | Cap `limit` to 500 |
| 2 | `api/brains.js:121` | Remove `detail: err` from error response |
| 3 | `api/openrouter.js:40` | Whitelist model parameter |
| 4 | `src/OpenBrain.jsx:1135` | Debounce localStorage write (3s) |
| 5 | `src/OpenBrain.jsx:1114` | Remove `entries` from nudge effect deps |
| 6 | `src/OpenBrain.jsx:1069` | Delete dead `apiKey`/`sbKey` useState |
| 7 | `src/views/DetailModal.jsx:128` | Add delete confirmation step |
| 8 | `src/views/TodoView.jsx:38` | Add aria-labels to icon-only buttons |
| 9 | `src/OpenBrain.jsx:1093` | Add debounce cleanup in useEffect |
| 10 | `src/views/SuggestionsView.jsx:287` | Fix `targetBrainId` undefined |

**Commit:** `fix: phase 1 quick wins — 10 audit items`

---

## Phase 2 — Critical Fixes

13 audit items marked "Fix Before Next Deploy". Overlapping items already done in Phase 1 are skipped.

### Security (SEC-1–6)
- **SEC-1** — Add explicit brain membership check in `delete-entry.js`, `update-entry.js`, `entries.js` before any DB operation
- **SEC-2** — Make `x-user-api-key` mandatory in `api/anthropic.js:38`; remove `|| process.env.ANTHROPIC_API_KEY` fallback
- **SEC-3** — Replace in-memory rate limiter in `api/_lib/rateLimit.js` with Vercel KV or Upstash Redis (if KV not available, add prominent code comment and return 501 stub that blocks use until fixed)
- **SEC-4** — Add Vercel cron IP whitelist (`76.76.21.0/24`) to `vercel.json`; add rate limiting before auth check in all 3 cron handlers
- **SEC-5** — Verify user is member/owner of each brain in `p_extra_brain_ids` before inserting in `api/capture.js`
- **SEC-6** — Switch PIN from SHA-256+hardcoded-salt to PBKDF2 with random per-user salt in `src/OpenBrain.jsx`

### Performance (PERF-1–3)
- **PERF-1** — Fix nudge `useEffect` dep array in `src/OpenBrain.jsx:1114` (covered by Phase 1 item 5)
- **PERF-2** — Debounce localStorage write (covered by Phase 1 item 4)
- **PERF-3** — Memoize chat context string; send only `{ id, title, type, tags }` in `src/OpenBrain.jsx:1258`

### Code Quality (CODE-1–2)
- **CODE-1** — Extract from OpenBrain.jsx: `src/components/QuickCapture.jsx`, `src/lib/connectionFinder.js`, `src/lib/workspaceInfer.js` (partial split — full split in Phase 5)
- **CODE-2** — Replace all `.catch(() => {})` silent failures with `console.error()` at minimum; add user-facing toast for data-loss failures

### UX (UX-1–2)
- **UX-1** — Add delete confirmation to `src/views/DetailModal.jsx:128` (covered by Phase 1 item 7)
- **UX-2** — Set `min-height: 44px; min-width: 44px` on all interactive buttons in `TodoView.jsx:49`, `RefineView.jsx:425`, `CalendarView.jsx:79`

**Commit:** `fix: phase 2 critical — security, performance, and code quality`

---

## Phase 3 — Sprint 1 (High Priority)

26 items. Security hardening, React perf, UX polish.

### Security (SEC-7–13)
- **SEC-7** — Validate `p_extra_brain_ids` array length (max 5) and type in `api/capture.js`
- **SEC-8** — Whitelist allowed model IDs in `api/openrouter.js:40` (covered Phase 1 item 3, verify completeness)
- **SEC-9** — Cap `limit` to 500 in `api/activity.js:34` (covered Phase 1 item 1, verify)
- **SEC-10** — Remove `detail: err` from invite response in `api/brains.js:121` (covered Phase 1 item 2, verify)
- **SEC-11** — Deny export for `viewer` role in `api/export.js`
- **SEC-12** — Add `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` headers to all API handlers
- **SEC-13** — Validate invite token is UUID format in `api/brains.js:131` before querying

### Performance (PERF-4–7)
- **PERF-4** — Wrap `EntryCard` with `React.memo()` in `src/OpenBrain.jsx:940`
- **PERF-5** — Add `useEffect` cleanup for search debounce in `src/OpenBrain.jsx:1093` (covered Phase 1 item 9, verify)
- **PERF-6** — Add 5-second debounce to `findConnections` call; skip during bulk import in `src/OpenBrain.jsx:31-58`
- **PERF-7** — Cache pending offline count locally in `src/hooks/useOfflineSync.js:12`

### UX (UX-3–9)
- **UX-3** — Add `autoFocus` to Title input in edit mode in `src/views/DetailModal.jsx:147`
- **UX-4** — Add Escape key handler to close dropdown in `src/components/BrainSwitcher.jsx:14`
- **UX-5** — Add `role="dialog"`, `aria-labelledby`, Escape key to close in `src/views/DetailModal.jsx:119`
- **UX-6** — Document and enforce z-index scale in all modals (PinGate=9999, Onboarding=3000, DetailModal=1000)
- **UX-7** — Disable both buttons during loading in `src/components/CreateBrainModal.jsx:182`
- **UX-8** — Fix `targetBrainId` undefined in `src/views/SuggestionsView.jsx:287` (covered Phase 1 item 10)
- **UX-9** — Scale canvas click radius by `window.devicePixelRatio`; add `aria-label` to canvas in `src/views/GraphView.jsx:30`

### Code Quality (CODE-3–5)
- **CODE-3** — Remove dead `apiKey` and `sbKey` useState in `src/OpenBrain.jsx:1069` (covered Phase 1 item 6)
- **CODE-4** — Validate `daily_time` as `HH:MM` and timezone as valid Intl timezone in `api/notification-prefs.js`
- **CODE-5** — Validate push `endpoint` is a valid HTTPS URL in `api/push-subscribe.js`

**Commit:** `fix: phase 3 sprint 1 — security hardening, perf, UX polish`

---

## Phase 4 — Sprint 2 (Medium Priority)

41 items. Architecture prep, async improvements, theme tokens, full accessibility pass.

### Security (SEC-14–17)
- **SEC-14** — Move audit logging from `console.log` to `audit_log` Supabase table
- **SEC-15** — Whitelist `rel` values in `api/save-links.js`
- **SEC-16** — Implement CRON_SECRET as HMAC-signed request; add Vercel cron IP whitelist in `vercel.json`
- **SEC-17** — Document Anthropic API key rotation policy (90-day rotation, usage alerts)

### Performance (PERF-8–11)
- **PERF-8** — Move entries cache from localStorage to IndexedDB in `src/OpenBrain.jsx:1023`
- **PERF-9** — Memoize chat message phone number regex in `src/OpenBrain.jsx:1431`
- **PERF-10** — Add `retryCount` with max 3 retries + exponential backoff in `src/hooks/useOfflineSync.js`
- **PERF-11** — Add explicit `?select=` fields to entries fetch in `src/OpenBrain.jsx:1100`

### UX (UX-10–17)
- **UX-10** — Add `aria-label="Delete task"` to all icon-only buttons throughout app
- **UX-11** — Catch and surface localStorage errors to user in `src/views/TodoView.jsx:39`
- **UX-12** — Add `maxLength={50}` and Enter key confirmation to relationship label input in `src/views/RefineView.jsx:390`
- **UX-13** — Add `minHeight: 44px` to calendar cells in `src/views/CalendarView.jsx:79`
- **UX-14** — Add `aria-label` to progress dots in `src/components/OnboardingModal.jsx:200`
- **UX-15** — Add `aria-pressed` to notification toggle buttons in `src/components/NotificationSettings.jsx:224`
- **UX-16** — Add `aria-pressed`/`role="radio"` to custom toggle/radio components in all modals
- **UX-17** — Replace all hardcoded `#4ECDC4` with theme tokens; create `t.accent`, `t.accentLight`, `t.accentBorder` in `src/views/RefineView.jsx:281`

### Code Quality (CODE-6–10)
- **CODE-6** — Create `src/config/prompts.js` — extract all AI system prompts
- **CODE-7** — Create `src/config/models.js` — extract all model name arrays
- **CODE-8** — Wire all 13 `aiFetch("/api/anthropic", ...)` calls through `callAI()` from `src/lib/ai.js`
- **CODE-9** — Replace `alert("Save failed")` with toast; remove all `alert()` calls
- **CODE-10** — Extract `QuickCapture`, `SettingsView`, `SupplierPanel`, `PreviewModal` from OpenBrain.jsx

**Commit:** `fix: phase 4 sprint 2 — perf improvements, full a11y pass, code extraction`

---

## Phase 5 — Sprint 3 (Architectural)

Long-term structural work. High risk of touching many files.

### Architecture
- **ARCH-1** — Split `src/OpenBrain.jsx` to under 400 lines (layout and routing only)
- **ARCH-2** — Create `src/context/EntriesContext.jsx` and `src/context/BrainContext.jsx`; eliminate prop drilling
- **ARCH-3** — Create `src/lib/connectionFinder.js`, `src/lib/workspaceInfer.js`, `src/lib/duplicateDetection.js`
- **ARCH-4** — Add PropTypes to all components as TypeScript migration interim measure
- **ARCH-5** — Implement semantic search index pre-computed at write time

### Security
- **ARCH-6** — Move PIN verification server-side with PBKDF2 + random salt
- **ARCH-7** — Centralized auth middleware verifying brain membership at app layer
- **ARCH-8** — Distributed rate limiting via Upstash Redis or Vercel KV

### Performance
- **ARCH-9** — Virtual scrolling stress-test with 1000+ entries
- **ARCH-10** — Centralized error handler logging to Sentry or similar

### Code Quality
- **ARCH-11** — Centralize all theme colors — add tokens to ThemeContext; eliminate 50+ hardcoded hex strings
- **ARCH-12** — Add JSDoc to all business logic functions
- **ARCH-13** — Create `src/lib/notifications.js` — unified toast/error/success system

**Commit:** `refactor: phase 5 sprint 3 — architectural split, context providers, auth middleware`

---

## Constraints

- **SEC-3 / ARCH-8** (distributed rate limiting): Requires external service (Vercel KV or Upstash Redis). If not provisioned, Phase 2 will stub it with a clear `TODO` and Phase 5 will implement it properly.
- **ARCH-6** (server-side PIN): Requires a new Supabase table/function. Will be designed as part of Phase 5 execution.
- **Phase 5** is the riskiest phase — touching the most files. Each ARCH item gets its own sub-commit where possible.

---

## Success Criteria

- All 133 audit findings addressed or explicitly deferred with documented reason
- No regressions in existing functionality
- Each phase produces a clean, reviewable commit
- Security score improves from 42/100 (F) to at least 75/100 after Phase 2+3
