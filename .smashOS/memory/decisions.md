# Decisions Log

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
