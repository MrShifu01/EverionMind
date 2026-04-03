# Next Steps — 2026-04-03

## Immediate (do first)
1. **Render BrainSwitcher in the header** — `src/OpenBrain.jsx` ~line 547: `useBrain` hook is called and `BrainSwitcher` is imported but never rendered. Add `<BrainSwitcher brains={brains} activeBrain={activeBrain} onSwitch={setActiveBrain} onCreate={createBrain} onDelete={deleteBrain} />` in the header div next to the memory count span.
2. **Run Supabase migration** — `supabase/migrations/001_brains.sql` exists but has NOT been applied. Apply via Supabase MCP `apply_migration` or SQL editor on project `wfvoqpdfzkqnenzjxhui`.
3. **Verify capture() RPC owner ID** — Run in Supabase SQL editor: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'capture'` — if `v_owner_id` is still hardcoded to a UUID, apply migration to replace with `p_user_id` parameter.

## Soon (this milestone)
- **Add metadata editing to DetailModal** — `src/views/DetailModal.jsx` edit form only edits title/type/content/tags. Add `metadata.deadline` and `metadata.due_date` fields so reminders can be fully edited without going to code.
- **Wire GraphView + CalendarView to live entries** — Both still use `INITIAL_ENTRIES` static data. Pass `entries` and `links` props from `src/OpenBrain.jsx`. Note: `LINKS` uses short hex IDs; once DB entries have UUIDs, link resolution needs updating.
- **Pass live links to DetailModal** — `src/views/DetailModal.jsx` reads from static `LINKS`/`INITIAL_ENTRIES` constants. Add `entries` and `links` props to the component and use them for the Connections section.
- **Add Content-Security-Policy to vercel.json** — LOW security finding. OpenBrain uses inline style objects (not dangerouslySetInnerHTML) so a strict CSP is feasible. Check for any inline `<style>` tags first.

## Deferred
- Full morning briefing push notification — requires service worker push subscription endpoint + backend scheduler — `public/sw.js` exists (Vite PWA), add `push` event handler
- Replace in-memory rate limiter with Upstash Redis — `api/_lib/rateLimit.js` — low priority for single-user
- Validate individual message structure in `api/anthropic.js:33` — image blocks / tool_use blocks could be expensive
- TodoView: wire reminder-type entries from DB — `src/views/TodoView.jsx` currently localStorage-only
- Rotate API keys — Anthropic console.anthropic.com + Supabase project settings → Vercel env vars

## Warnings
- ⚠️ BrainSwitcher is imported but NOT rendered — `src/OpenBrain.jsx` will throw no error but brains feature is invisible to user until Step 1 above is done.
- ⚠️ `supabase/migrations/001_brains.sql` must be applied before brains API (`api/brains.js`) will work — the `brains` table does not exist in DB yet.
- ⚠️ `capture()` RPC may still hardcode `v_owner_id = '00000000-...-0001'` — verify before any multi-user work.
- ⚠️ `INITIAL_ENTRIES` in `src/data/constants.js` is placeholder data — once DB has 20+ real entries, consider removing the fallback and relying on localStorage/DB only.
