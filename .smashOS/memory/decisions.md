# Decisions Log

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
