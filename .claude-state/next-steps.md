# Next Steps — 2026-04-02

## Immediate (do first)
1. **Rotate API keys manually** — Anthropic key at console.anthropic.com → API Keys; Supabase service_role + anon keys at supabase.com → project settings → API. These are the only remaining CRITICAL/HIGH security items.
2. **Verify live deployment** — push to Vercel (`git push`) and check open-brain-sigma.vercel.app — confirm entries load, edit/delete work, virtualised scroll works on mobile.

## Soon (this milestone)
- Pass `entries` prop to `GraphView` and `CalendarView` — both currently use `INITIAL_ENTRIES` static data. `GraphView` (`src/views/GraphView.jsx`) needs `entries` prop to show live data; `LINKS` still hardcoded (IDs are hex, not UUIDs — needs a rethink).
- Add `Content-Security-Policy` header to `vercel.json` — currently missing (LOW finding from security audit). Add after checking what inline styles/scripts are used.
- Add metadata editing to DetailModal edit form (`src/views/DetailModal.jsx`) — currently only title/type/content/tags are editable; metadata.deadline, metadata.due_date etc. are not.

## Deferred
- Upstash Redis for distributed rate limiting — current in-memory limiter is per-serverless-instance. Only matters if traffic scales or multiple concurrent requests hit different instances. See `api/_lib/rateLimit.js`.
- Add `Content-Security-Policy` header — requires auditing all inline styles/scripts first. `src/OpenBrain.jsx` uses inline style objects (not `dangerouslySetInnerHTML`) so a strict CSP should be feasible.
- Validate individual message structure in `api/anthropic.js` (line 33) — currently validates count + array type but not individual message shape (image blocks, tool_use blocks could be expensive).
- TodoView: wire todos to DB reminder-type entries instead of localStorage-only.
- `suggestions.js` prompts for Wi-Fi passwords/credentials — these land in Supabase FTS index. Consider filtering those suggestion categories.

## Warnings
- ⚠️ `git push` has not been run since the commit — changes are local only. Run `git push origin main` to deploy.
- ⚠️ INITIAL_ENTRIES in `src/data/constants.js` still contains placeholder data. Once DB is populated, remove them and use DB/localStorage as the only source.
- ⚠️ `vercel env add SUPABASE_URL preview` was skipped — if preview deployments are added later, run: `vercel env add SUPABASE_URL preview main`
