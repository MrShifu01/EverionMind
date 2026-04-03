# OpenBrain — Full Audit Report & Sprint Plan
**Date:** 2026-04-03  
**Audited by:** 4 parallel specialist agents (UX/UI · Security · Performance · Code Quality)

---

## Overall Scores

| Domain | Score | Grade | Finding Count |
|--------|-------|-------|---------------|
| UX / UI | 62/100 | D | 57 findings |
| Security | 42/100 | F | 27 findings |
| Performance | 58/100 | D | 28 findings |
| Code Quality / Architecture | 55/100 | D+ | 21 findings |
| **OVERALL** | **54/100** | **D+** | **133 findings** |

**Verdict:** Functionally solid and usable, but not production-ready at scale. Security is the most urgent concern — the architecture relies entirely on Supabase RLS with no application-level fallback. If RLS is ever misconfigured, the whole system fails open. Performance and code quality issues will become painful as data grows.

---

## CRITICAL — Fix Before Next Deploy (13 issues)

### SEC-1 · No application-level auth on delete/update/entries endpoints
**Files:** `api/delete-entry.js`, `api/update-entry.js`, `api/entries.js`  
**Risk:** If Supabase RLS is misconfigured, any authenticated user can read, modify, or delete any other user's entries.  
**Fix:** Add explicit brain membership check in each handler before touching the DB. Example for delete-entry:
```js
// Verify user owns this entry's brain before delete
const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${id}&select=brain_id`, { headers: hdrs() });
const [entry] = await entryRes.json();
if (!entry) return res.status(404).json({ error: "Not found" });
// then check brain_id membership
```

### SEC-2 · Server Anthropic API key used as fallback (cost attack)
**File:** `api/anthropic.js:38`  
**Risk:** If user sends no `x-user-api-key`, server's Anthropic key is used. Attackers can exhaust API budget.  
**Fix:** Make `x-user-api-key` mandatory — return 400 if not provided. Remove the `|| process.env.ANTHROPIC_API_KEY` fallback.

### SEC-3 · In-memory rate limiter bypassed in serverless
**File:** `api/_lib/rateLimit.js`  
**Risk:** Each Vercel instance has its own Map. Distributing requests across instances completely bypasses rate limits.  
**Fix:** Replace with Vercel KV or Upstash Redis rate limiting. Until then, rate limits provide zero real protection.

### SEC-4 · Cron endpoints vulnerable to brute-force secret guessing
**Files:** `api/cron/push-daily.js`, `api/cron/push-expiry.js`, `api/cron/push-nudge.js`  
**Risk:** No IP whitelist, no rate limit before auth check. Attackers can guess `CRON_SECRET` and trigger bulk push notifications to all users.  
**Fix:** Add Vercel cron IP whitelist (`76.76.21.0/24`) in vercel.json and add rate limiting before the auth check.

### SEC-5 · p_extra_brain_ids not access-checked in capture
**File:** `api/capture.js`  
**Risk:** Users can inject captured entries into brains they don't belong to.  
**Fix:** Before inserting into extra brain IDs, verify the authenticated user is a member/owner of each one.

### PERF-1 · Nudge AI call re-fires on every entry change
**File:** `src/OpenBrain.jsx:1114-1132`  
**Risk:** Every entry update (including bulk import) triggers a Claude API call. Direct cost leak.  
**Fix:** Remove `entries` from the nudge `useEffect` dependency array. Add `sessionStorage` gate that only runs once per session (already partially done — just fix the dep array).

### PERF-2 · Entire entries array JSON.stringified on every state change
**File:** `src/OpenBrain.jsx:1135-1136`  
**Risk:** Synchronous localStorage write blocks the main thread on every update. With 500+ entries this causes visible jank.  
**Fix:** Debounce the write with a 3-second delay:
```js
useEffect(() => {
  if (!entriesLoaded) return;
  const t = setTimeout(() => {
    try { localStorage.setItem("openbrain_entries", JSON.stringify(entries)); } catch {}
  }, 3000);
  return () => clearTimeout(t);
}, [entries, entriesLoaded]);
```

### PERF-3 · Chat sends 100 full entry objects + all links on every message
**File:** `src/OpenBrain.jsx:1258`  
**Risk:** Massive token usage per chat message. With 100 entries × average 500 chars = ~50k chars of context every message.  
**Fix:** Memoize the context string outside the handler. Send only `{ id, title, type, tags }` — strip `content` and `metadata` from AI context unless specifically needed.

### SEC-6 · PIN uses SHA-256 with hardcoded salt — weak
**File:** `src/OpenBrain.jsx:496-572`  
**Risk:** 4-digit PIN = 10,000 combinations. Hardcoded salt `"ob_salt_v1"` means rainbow tables work. Stored in localStorage (XSS accessible).  
**Fix:** Switch to PBKDF2 with a random per-user salt. Allow 6+ digit PINs. Consider moving PIN hash server-side.

### CODE-1 · OpenBrain.jsx is a 1566-line monolith
**File:** `src/OpenBrain.jsx`  
**Risk:** Untestable. Any change to one area risks breaking another. Prevents concurrent work by multiple developers.  
**Fix (phased):** Extract these as immediate wins:
- `src/components/QuickCapture.jsx` (already structured as a function — just move the file)
- `src/components/SettingsView.jsx`
- `src/components/SupplierPanel.jsx`
- `src/lib/connectionFinder.js` (findConnections, scoreTitle)
- `src/lib/workspaceInfer.js` (inferWorkspace)

### CODE-2 · Silent failures everywhere — no error surfaces to user
**Files:** `src/OpenBrain.jsx:57, 373, 614, 755, 1251`, `src/hooks/useOfflineSync.js:56`  
**Risk:** Users lose data silently. Impossible to debug production issues.  
**Fix:** Every `.catch(() => {})` must at minimum `console.error()`. User-facing failures must show a toast. Remove all silent catch blocks.

### UX-1 · Delete entry has no confirmation — data loss on mis-tap
**File:** `src/views/DetailModal.jsx:128`  
**Risk:** Single tap deletes permanently. Undo toast is the only safety net — easy to miss on mobile.  
**Fix:** Add a confirmation step: change the Delete button to show "Confirm delete?" with a 3-second window, or add a simple confirmation modal.

### UX-2 · Touch targets below 44px minimum on mobile
**Files:** `src/views/TodoView.jsx:49`, `src/views/RefineView.jsx:425`, `src/views/CalendarView.jsx:79`  
**Risk:** Users on mobile tap wrong targets, causing frustrating mis-taps and accidental actions.  
**Fix:** Minimum `height: 44px` and `min-width: 44px` on all interactive buttons. Calendar day cells: `minHeight: 44px`.

---

## SPRINT 1 — High Priority (2 weeks)

### Security
- **SEC-7** · `api/capture.js` — Validate `p_extra_brain_ids` array length (max 5) and type
- **SEC-8** · `api/openrouter.js:40` — Whitelist allowed model IDs; reject anything not on the list
- **SEC-9** · `api/activity.js:34` — Cap `limit` param to max 500: `Math.min(parseInt(limit)||50, 500)`
- **SEC-10** · `api/brains.js:121` — Remove `detail: err` from failed invite response (leaks DB schema)
- **SEC-11** · `api/export.js` — Deny export for `viewer` role; currently any member can export
- **SEC-12** · All API handlers — Add `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` headers
- **SEC-13** · `api/brains.js:131` — Validate invite token is UUID format before querying

### Performance
- **PERF-4** · `src/OpenBrain.jsx:940` — Wrap `EntryCard` with `React.memo()` to stop all-cards re-render on any state change
- **PERF-5** · `src/OpenBrain.jsx:1093` — Add `useEffect` cleanup for search debounce timeout (memory leak)
- **PERF-6** · `src/OpenBrain.jsx:31-58` — Add 5-second debounce to `findConnections` call; skip during bulk import
- **PERF-7** · `src/hooks/useOfflineSync.js:12` — Cache pending count locally; only re-fetch from IndexedDB on sync completion

### UX/UI
- **UX-3** · `src/views/DetailModal.jsx:147` — Add `autoFocus` to Title input in edit mode
- **UX-4** · `src/components/BrainSwitcher.jsx:14` — Add Escape key handler to close dropdown
- **UX-5** · `src/views/DetailModal.jsx:119` — Add `role="dialog"`, `aria-labelledby`, Escape key to close modal
- **UX-6** · All modals — Document and enforce z-index scale: PinGate=9999, Onboarding=3000, DetailModal=1000
- **UX-7** · `src/components/CreateBrainModal.jsx:182` — Disable both buttons during loading to prevent double-submit
- **UX-8** · `src/views/SuggestionsView.jsx:287` — Fix `targetBrainId` undefined variable (should be `targetBrain?.id`)
- **UX-9** · `src/views/GraphView.jsx:30` — Scale canvas click radius by `window.devicePixelRatio`; add `aria-label` to canvas element

### Code Quality
- **CODE-3** · `src/OpenBrain.jsx:1069-1070` — Remove dead `apiKey` and `sbKey` useState (hardcoded "configured", never used)
- **CODE-4** · `api/notification-prefs.js` — Validate field values: `daily_time` must match `HH:MM`, timezone must be valid Intl timezone
- **CODE-5** · `api/push-subscribe.js` — Validate push `endpoint` is a valid HTTPS URL (SSRF prevention)

---

## SPRINT 2 — Medium Priority (weeks 3–4)

### Security
- **SEC-14** · Move audit logging from `console.log` to an `audit_log` Supabase table (immutable, queryable)
- **SEC-15** · `api/save-links.js` — Whitelist `rel` values to a known set (e.g., `["related","mentions","links-to","contradicts"]`)
- **SEC-16** · Implement CRON_SECRET as HMAC-signed request; add Vercel cron IP whitelist in `vercel.json`
- **SEC-17** · Anthropic API key rotation policy — rotate every 90 days, set up Anthropic usage alerts

### Performance
- **PERF-8** · `src/OpenBrain.jsx:1023` — Move entries cache from localStorage to IndexedDB (async, no main-thread block)
- **PERF-9** · `src/OpenBrain.jsx:1431` — Memoize chat message phone number regex formatting
- **PERF-10** · `src/hooks/useOfflineSync.js` — Add `retryCount` field, max 3 retries with exponential backoff; notify user of permanently failed ops
- **PERF-11** · `src/OpenBrain.jsx:1100` — Add `?select=id,title,content,type,tags,metadata,brain_id,importance,pinned,created_at` to entries fetch to avoid over-fetching

### UX/UI
- **UX-10** · `src/views/TodoView.jsx:38` — Add `aria-label="Delete task"` to all icon-only buttons throughout app
- **UX-11** · `src/views/TodoView.jsx:39` — Catch and surface localStorage errors to user (currently silent)
- **UX-12** · `src/views/RefineView.jsx:390` — Add `maxLength={50}` and Enter key confirmation to relationship label input
- **UX-13** · `src/views/CalendarView.jsx:79` — Add `minHeight: 44px` to calendar cells for mobile tap targets
- **UX-14** · `src/components/OnboardingModal.jsx:200` — Add `aria-label={`Step ${i+1} of ${steps.length}`}` to progress dots
- **UX-15** · `src/components/NotificationSettings.jsx:224` — Add `aria-pressed` to notification toggle buttons
- **UX-16** · All modals — Add `aria-pressed` / `role="radio"` to custom toggle/radio components
- **UX-17** · `src/views/RefineView.jsx:281` — Replace all hardcoded `#4ECDC4` refs with theme tokens; create `t.accent`, `t.accentLight`, `t.accentBorder`

### Code Quality
- **CODE-6** · Create `src/config/prompts.js` — extract all AI system prompts out of component files
- **CODE-7** · Create `src/config/models.js` — extract all model name arrays
- **CODE-8** · Replace all 13 direct `aiFetch("/api/anthropic", ...)` calls with `callAI()` from `src/lib/ai.js` (already built, not wired)
- **CODE-9** · `src/OpenBrain.jsx:1196` — Replace `alert("Save failed")` with toast notification; remove all `alert()` calls from codebase
- **CODE-10** · Extract `QuickCapture`, `SettingsView`, `SupplierPanel`, `PreviewModal` from OpenBrain.jsx into separate files under `src/components/`

---

## SPRINT 3 — Architectural / Long-term

### Architecture
- **ARCH-1** · Split `src/OpenBrain.jsx` completely — target under 400 lines, focused on layout and routing only
- **ARCH-2** · Create `src/context/EntriesContext.jsx` and `src/context/BrainContext.jsx` — eliminate 15+ prop drilling chains
- **ARCH-3** · Create `src/lib/connectionFinder.js`, `src/lib/workspaceInfer.js`, `src/lib/duplicateDetection.js` — extract business logic from UI
- **ARCH-4** · Evaluate TypeScript migration — at minimum add PropTypes to all components as interim measure
- **ARCH-5** · Implement semantic search index for entries (pre-computed at write time) to replace O(n) metadata scan on every filter/search

### Security
- **ARCH-6** · Move PIN verification server-side; use PBKDF2 with random per-user salt; allow 6+ digit PINs
- **ARCH-7** · Implement centralized auth middleware that verifies brain membership at the app layer for all sensitive operations (don't rely solely on RLS)
- **ARCH-8** · Implement distributed rate limiting via Upstash Redis or Vercel KV

### Performance
- **ARCH-9** · Implement virtual scrolling improvements — test with 1000+ entries, ensure EntryCard memo is effective
- **ARCH-10** · Replace all `.catch(() => {})` with centralized error handler that logs to monitoring (Sentry or similar)

### Code Quality
- **ARCH-11** · Centralize all theme colors — add `accent`, `accentLight`, `accentBorder`, `error`, `success` tokens to ThemeContext; eliminate 50+ hardcoded hex strings
- **ARCH-12** · Add JSDoc to `findConnections`, `scoreTitle`, `inferWorkspace`, and all business logic functions
- **ARCH-13** · Create `src/lib/notifications.js` — unified toast/error/success system to replace scattered alert() / inline status strings

---

## Quick Wins (can do right now, under 10 min each)

| # | File | Change | Time |
|---|------|--------|------|
| 1 | `api/activity.js:34` | Cap limit to 500 | 2 min |
| 2 | `api/brains.js:121` | Remove `detail: err` from error response | 1 min |
| 3 | `api/openrouter.js:40` | Whitelist model parameter | 5 min |
| 4 | `src/OpenBrain.jsx:1135` | Debounce localStorage write | 5 min |
| 5 | `src/OpenBrain.jsx:1114` | Remove `entries` from nudge effect deps | 2 min |
| 6 | `src/OpenBrain.jsx:1069` | Delete dead apiKey/sbKey state | 1 min |
| 7 | `src/views/DetailModal.jsx:128` | Add delete confirmation | 8 min |
| 8 | `src/views/TodoView.jsx:38` | Add aria-labels to icon buttons | 3 min |
| 9 | `src/OpenBrain.jsx:1093` | Add debounce cleanup in useEffect | 2 min |
| 10 | `src/views/SuggestionsView.jsx:287` | Fix targetBrainId undefined | 1 min |

**Total quick-win time: ~30 minutes**

---

## Issue Count Summary

| Severity | Security | UX/UI | Performance | Code Quality | Total |
|----------|----------|-------|-------------|--------------|-------|
| Critical | 7 | 3 | 4 | 3 | **17** |
| High | 8 | 7 | 6 | 5 | **26** |
| Medium | 6 | 20 | 8 | 7 | **41** |
| Low | 4 | 14 | 10 | 6 | **34** |
| Accessibility | — | 7 | — | — | **7** |
| Mobile | — | 6 | — | — | **6** |
| **Total** | **25** | **57** | **28** | **21** | **133** |
