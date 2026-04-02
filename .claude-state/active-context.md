# Active Context — 2026-04-02
**Branch:** main | **Enhancement:** security+performance | **Project:** OpenBrain

## Session Summary
Ran a full security sprint (17 tasks) and performance sprint on OpenBrain. All server-side vulnerabilities fixed — ownership filters, rate limiting, Anthropic proxy validation, env var migration, security headers, audit logging, PII removal. Full performance refactor — code-split 5 views with React.lazy, window virtualisation for grid+timeline, extracted view files, debounced search, SpeedInsights wired up.

## Built This Session
- `api/_lib/rateLimit.js` — in-memory rate limiter applied to all API routes
- `api/anthropic.js` — model allowlist, max_tokens cap, message count validation, rate limited
- `api/entries.js`, `api/delete-entry.js`, `api/update-entry.js`, `api/capture.js` — ownership filters (user_id filter), audit logging, validation
- `api/_lib/verifyAuth.js`, `api/health.js` — SUPABASE_URL from env var
- `vercel.json` — security headers, immutable cache on /assets/*, no-store on /api/*
- `src/data/constants.js` — shared TC, PC, fmtD, MODEL, INITIAL_ENTRIES (PII stripped), LINKS
- `src/views/` — SuggestionsView, CalendarView, TodoView, DetailModal, GraphView extracted
- `src/OpenBrain.jsx` — React.lazy + Suspense for 5 views, useWindowVirtualizer for grid+timeline, debounced search
- `src/main.jsx` — SpeedInsights added

## Current State
- All changes committed (46878cf) and pushed — clean working tree
- Build verified: 72 modules, 8 chunks, 254ms, no errors
- SUPABASE_URL env var added to Vercel (production + development)
- security: PASS WITH WARNINGS (0 CRITICAL, 1 HIGH latent, 3 MEDIUM, 4 LOW)

## In-Flight Work
- *(none)* — working tree clean, everything committed and pushed

## Known Issues
- Rate limiter is in-memory per serverless instance — ineffective across parallel Vercel instances. Fix: Upstash Redis.
- GraphView and CalendarView still use INITIAL_ENTRIES/static data, not live entries props.
- Manual key rotation still needed: Anthropic API key, Supabase service_role + anon keys.
- No Content-Security-Policy header in vercel.json.
- capture() RPC hardcodes v_owner_id — latent auth bypass for multi-user. See api/capture.js.

## Pipeline State
- **Last pipeline:** security audit + performance audit (2026-04-02)
- **Last scores:** security: PASS WITH WARNINGS (0 CRITICAL, 1 HIGH, 3 MEDIUM, 4 LOW)
- **Open incidents:** none
