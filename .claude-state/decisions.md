# OpenBrain — Decisions Log

## Security: service_role key + explicit user_id filter (not RLS alone)
All API endpoints use the Supabase service_role key (bypasses RLS) but add explicit `user_id=eq.${user.id}` URL filters on every query. This is secure: the user_id comes from the verified JWT, not the client. Affected: `api/entries.js`, `api/delete-entry.js`, `api/update-entry.js`, `api/capture.js`.

## Performance: useWindowVirtualizer for PWA window scroll (not useVirtualizer)
OpenBrain has no fixed-height scrollable container — the page itself scrolls. `useWindowVirtualizer` from `@tanstack/react-virtual` virtualizes against window scroll. Used for VirtualGrid (2-col, 172px estimate) and VirtualTimeline (64px estimate) in `src/OpenBrain.jsx`.

## Performance: React.lazy code-split 5 heavy views, keep QuickCapture + SettingsView inline
SuggestionsView, CalendarView, TodoView, GraphView, and DetailModal are lazy-loaded. QuickCapture and SettingsView are small and always-needed — kept inline to avoid flash on startup. Affected: `src/OpenBrain.jsx`.

## Constants extracted to src/data/constants.js, PII stripped from INITIAL_ENTRIES
Shared constants (TC, PC, fmtD, MODEL, INITIAL_ENTRIES, LINKS) moved to `src/data/constants.js`. Phone numbers, licence_number, id_number, member_number removed from INITIAL_ENTRIES placeholder data.

## Import SUGGESTIONS from data file, not inline
Replaced the ~90-item inline SUGGESTIONS array in `OpenBrain.jsx` with an import from `src/data/suggestions.js` (~1000 questions). Inline was a holdover from early dev; the data file was already written and committed.

## Answered questions retired via localStorage, not filtered from API
Answered question tracking (`openbrain_answered_qs`) uses localStorage rather than a database table. Reasoning: the question list is static, user-specific progress is a UI concern not a data concern, and localStorage avoids an extra DB call on every Fill Brain render.

## Skipped questions stay in pool; only answered questions are retired
Deliberate decision: skipping a question means "not now", not "forever done". Only explicitly answering retires a question.

## AI-every-5th logic: position-based, not index-based
Used `answered + skipped` (total navigations) as the position counter rather than a separate AI slot index. Cleaner — single source of truth, no index drift when categories are filtered.

## Calendar only shows entries with explicit metadata dates
CalendarView only marks days with entries that have `metadata.deadline`, `metadata.due_date`, `metadata.valid_to`, or `metadata.valid_from`. `created_at` was intentionally excluded from dots to keep the calendar meaningful (otherwise every day would have dots). This may be revisited.

## Todo list is localStorage-only (no DB sync)
Todos stored in `localStorage openbrain_todos`. No Supabase sync yet — keeps it simple while the integration roadmap is built out. The integration teaser in TodoView links to the roadmap.

## Nav made scrollable rather than restructured
With 8 tabs, used `overflowX: auto; scrollbarWidth: none; flexShrink: 0; minWidth: 72px` rather than a hamburger menu or icon-only display. Trade-off: slightly harder to discover all tabs, but much simpler code.

## Load entries from Supabase on mount + localStorage cache
Decided to fetch all entries from DB on app mount via /api/entries and cache in localStorage so repeat visits are instant. INITIAL_ENTRIES is kept only as cold-start fallback. Affects: src/OpenBrain.jsx, api/entries.js.

## Edit without AI in DetailModal
Edit button opens inline form (title, type, content, tags) that PATCHes /api/update-entry directly — no AI involved. Affects: src/OpenBrain.jsx, api/update-entry.js.

## Photo OCR via Haiku vision
Photo upload button added to QuickCapture and SuggestionsView. Image converted to base64, sent to /api/anthropic with vision content block. Model extracts text and populates input field. Affects: src/OpenBrain.jsx.

## tags text[] column on entries (denormalised)
Added `tags text[]` to `entries` table alongside the normalised `tags`/`entry_tags` tables. App code treats tags as a simple string array — denormalised column matches that model. `capture()` RPC writes to both. `update-entry.js` writes only to `entries.tags`. Affects: Supabase schema, RPC `public.capture`, `api/update-entry.js`.

## FTS rebuilt as trigger (not generated column)
`fts GENERATED ALWAYS AS` can't use `array_to_string()` (STABLE, not IMMUTABLE). Replaced with `BEFORE INSERT OR UPDATE` trigger on `entries_fts_update()`. Title=weight A, content+tags=weight B. GIN index. Affects: Supabase schema only.

## Type field uses datalist not select
`DetailModal` edit form type input changed from `<select>` to `<input list> + <datalist>`. Allows custom types beyond preset list. API validation relaxed from allowlist to length check. Affects: `src/OpenBrain.jsx` (~line 704), `api/update-entry.js`.

## onUpdate only mutates state on confirmed server success
`onUpdate` in `OpenBrain.jsx` checks `res.ok` and empty-array before updating local state. Previous pattern caused phantom saves: optimistic update always ran even when PATCH failed silently. Affects: `src/OpenBrain.jsx` (~line 958).
