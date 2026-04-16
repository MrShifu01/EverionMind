# OpenBrain — Decisions Log

## RAG embed key is client-side only — fire-and-forget from client, not server
Embedding API key lives in localStorage; server has no access. Fire-and-forget embed calls happen from QuickCapture.jsx (after capture) and OpenBrain.jsx handleUpdate (after update), not from capture.js/update-entry.js. Affects `src/components/QuickCapture.jsx`, `src/OpenBrain.jsx`, `api/embed.js`.

## Embedding key stored separately from generation API key
Users may want OpenAI for embeddings but Anthropic for generation. `openbrain_${uid}_embed_openai_key` and `openbrain_${uid}_gemini_key` are distinct from `openbrain_${uid}_api_key`. `getEmbedHeaders()` in `src/lib/aiFetch.js` returns embed headers for any request needing them.

## api/chat.js inlines LLM routing — does not call other Vercel functions
Vercel serverless functions shouldn't call each other via HTTP internally. `api/chat.js` replicates the Anthropic/OpenAI/OpenRouter routing logic directly. Shared embedding logic is in `api/_lib/generateEmbedding.js`.

## GAPS.md is a live document — update when specs are approved
Created `GAPS.md` as a strategic gaps analysis. When a spec is approved and implementation begins, the corresponding gap must be removed from GAPS.md in the same session to keep it accurate.

## Embedding dimensions: 768 for both OpenAI and Google providers
`text-embedding-3-small` uses `dimensions: 768` parameter (quality loss negligible). `text-embedding-004` is natively 768. Both share the same `vector(768)` column in `entries`. Tracked via `embedding_provider` column. Affects `supabase/migrations/008_pgvector.sql`.

## Per-task AI model selection: OpenRouter-only, task param in callAI()
Task-specific models stored in `user_ai_settings` (5 nullable columns) and localStorage keyed `openbrain_{uid}_task_{task}`. `callAI()` resolves task model first when provider=openrouter, falls back to global. Affects `src/lib/aiFetch.js`, `src/lib/ai.js`, `supabase/migrations/007_task_models.sql`.

## Pricing tier labels replace raw $/1M in model dropdowns
OpenRouter dropdowns show Free/Cheap/Normal/Expensive instead of `$X.XX/1M`. Thresholds: 0=Free, <$1/1M=Cheap, <$10/1M=Normal, ≥$10/1M=Expensive. `priceTier()` helper in `src/OpenBrain.jsx` (to be added).

## Vision task dropdown filtered by architecture.modality from OpenRouter API
`fetchOrModels` stores `modality: m.architecture?.modality`. Vision picker shows only `modality.includes("image")` models. No manual allowlist. Falls back to `OR_VISION_SHORTLIST` if models not fetched yet.

## Offline sync: IndexedDB queue + window.online drain (not Background Sync API)
Chose IndexedDB + `window.online` event over Workbox Background Sync because Background Sync API is unsupported on iOS Safari. Affects `src/lib/offlineQueue.js` and `src/hooks/useOfflineSync.js`.

## Offline captures queue raw text for AI parse on reconnect
When offline, `capture()` enqueues `{ type: "raw-capture", anthropicRequest, tempId }` instead of saving raw text to DB immediately. On reconnect, drain calls `/api/anthropic` first, then `/api/capture`. If either fails, op stays in queue and retries. Affects `src/OpenBrain.jsx` (capture fn) and `src/hooks/useOfflineSync.js` (drain fn).

## Last-write-wins conflict resolution for offline queue
Ops drain oldest-first. No merge UI. Suitable for single-user personal app. Affects `src/hooks/useOfflineSync.js`.

## Temp ID pattern for offline creates
Offline creates use `Date.now().toString()` as local ID. When op drains and server returns real ID, `onEntryIdUpdate(tempId, realId)` callback in `OpenBrain` updates entries state. Affects `src/OpenBrain.jsx` and `src/hooks/useOfflineSync.js`.

## Theme system: React Context + inline style token replacement
Used a ThemeContext (DARK/LIGHT token objects) rather than CSS custom properties, because all styling is inline `style={{}}` objects. Each component calls `useTheme()` and uses `t.surface`, `t.text` etc. Accent colours (#4ECDC4, #A29BFE etc.) unchanged across themes. Affects `src/ThemeContext.jsx` and all component files.

## Suppliers tab removed from nav
`{ id: "suppliers" }` removed from `navViews` array in `src/OpenBrain.jsx`. SupplierPanel component code left in place (not deleted) — can be cleaned up later.

## Calendar recurring events: metadata-based day_of_week
CalendarView now checks `metadata.day_of_week | weekday | recurring_day` and plots entries on every matching weekday in the displayed month. Relies on AI extracting this field during quick-capture. `src/views/CalendarView.jsx`.

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

## Sprint 3: exportPhone + toWaUrl exported from OpenBrain.jsx (not a separate util)
Phone utilities are exported directly from `src/OpenBrain.jsx` and imported by `src/views/DetailModal.jsx`. No separate utils file created — these are tightly coupled to the entry model.

## Sprint 3: Undo uses deferred delete (not immediate API call)
Delete does not call `api/delete-entry` immediately. Entry is removed from state optimistically; the API call fires after 5s unless Undo is clicked. Implemented via `pendingDeleteRef` + `setTimeout`. See `handleDelete` in `src/OpenBrain.jsx`.

## Sprint 3: Workspace is client-side tag inference only (no DB field)
Workspace (business/personal/both) is inferred client-side from entry tags via `inferWorkspace()`. If `metadata.workspace` exists (set by AI), it takes priority. No DB schema change needed. See `src/OpenBrain.jsx:inferWorkspace`.

## Sprint 3: AI nudge prompt explicitly guards against company merge suggestions
Delta Distribution and Delta Gas are confirmed distinct companies. The proactive intelligence system prompt says: "Do NOT suggest merging companies just because they share a word in their name. Each business is distinct." This protects all companies with similar-prefix names.

## Sprint 3: BrainSwitcher merged but not yet wired to UI
`BrainSwitcher` component and `useBrain` hook are imported and the hook is called in `src/OpenBrain.jsx`, but `<BrainSwitcher>` is not rendered anywhere in JSX. Next step: add it to the header area next to the brain logo/title.

## onUpdate only mutates state on confirmed server success
`onUpdate` in `OpenBrain.jsx` checks `res.ok` and empty-array before updating local state. Previous pattern caused phantom saves: optimistic update always ran even when PATCH failed silently. Affects: `src/OpenBrain.jsx` (~line 958).

## Brain types: family + business replace 'shared'
`brains.type` CHECK constraint expanded from `('personal','shared')` to `('personal','family','business')`. Existing 'shared' brains migrate to 'family'. Affects `supabase/migrations/002_brain_types.sql`, `api/brains.js`, `src/components/BrainSwitcher.jsx`, `src/hooks/useBrain.js`.

## Multi-brain entry assignment via entry_brains junction table
Entries stay in one primary brain (`entries.brain_id`) but can be shared into additional brains via `entry_brains(entry_id, brain_id)`. `get_entries_for_brain` RPC unions both. Affects `api/capture.js` (p_extra_brain_ids), `api/entries.js` (RPC call), `migration 002`.

## Refine access: owner-only for family/business brains
Non-owner members of family/business brains see a gate message in RefineView — cannot run AI analysis. Personal brain owners always have access. `activeBrain.myRole === "owner"` check in `src/views/RefineView.jsx`.

## Suggestions: per-brain question sets with per-brain localStorage keys
SUGGESTIONS (personal), FAMILY_SUGGESTIONS, BUSINESS_SUGGESTIONS arrays in `src/data/suggestions.js`. SuggestionsView uses brain type to pick question set. Answered state keyed by `openbrain_answered_qs_{type}` to avoid cross-brain pollution.

## Onboarding: localStorage flag gates first-time wizard
`localStorage.getItem("openbrain_onboarded")` — if absent, OnboardingModal shows on login. Set to "1" on completion. Auto-navigates to Fill Brain tab. `src/components/OnboardingModal.jsx`, wired in `src/OpenBrain.jsx`.

## Personal brain: auto-created via Supabase trigger (not frontend)
`supabase/migrations/003_personal_brain_trigger.sql` adds a trigger on `AFTER INSERT ON auth.users` that creates a "My Brain" personal brain for every new user. Chosen over frontend detection because it's atomic, works even if user closes tab mid-onboarding, and requires no race-condition handling. `api/brains.js` validTypes updated to include "personal".

## Post-creation tip card: in-session only, not persisted
After creating a family/business brain, `showBrainTip` state in OpenBrain shows `<BrainTipCard>` with brain-type-specific first-fill suggestions. Dismissed on × or "Start filling →". Not stored in localStorage — deliberate: if user creates a brain then leaves and returns, they shouldn't see it again. `src/components/BrainTipCard.jsx`, wired in `src/OpenBrain.jsx`.

## BrainSwitcher double-create bug fixed
CreateBrainModal already creates the brain via API and returns the full brain object to onCreate(brain, brainType). BrainSwitcher was passing this brain object as the `name` arg to useBrain.createBrain() — causing a second API call with name={object}. Fixed: BrainSwitcher.onCreate now calls onBrainCreated(brain) to refresh/switch, and onBrainTip(brain) to trigger tip card. No second create call.

## user_ai_settings table for edge function key access
localStorage is not accessible in Supabase edge functions. Per-user OpenRouter key/model stored in `user_ai_settings` table (migration 006) so the Telegram bot can use each user's own credentials. App `saveOrKey`/`saveOrModel` upsert to DB on every change. Edge function falls back to shared `OPENROUTER_API_KEY` env var if user has no row.

## Anthropic image block format is canonical; normalizeMessages() converts on send
All image content blocks throughout the codebase use Anthropic format (`source.data`). `normalizeMessages()` in `src/lib/ai.js` converts to OpenAI format (`image_url.url`) at send time when provider is openrouter/openai. No call sites need to know about the difference.

## All AI features route through callAI() — no more hardcoded /api/anthropic
RefineView, SuggestionsView, and image upload now use `callAI()`. The `/api/anthropic` endpoint is no longer called directly from any view. Provider selection and key injection are handled centrally in `src/lib/ai.js`.

## Per-task model selection: AI-models.md roadmap (not yet implemented)
4-phase plan documented in `AI-models.md`. Phase 1: DB columns + helpers. Phase 2: task param on callAI(). Phase 3: settings UI. Phase 4: Voice/Whisper (separate API, deferred). Vision task uses OpenRouter modality filter (`text+image->text`) rather than a manual allowlist.

## MCP ask_everionmind proxies to /api/chat via internal HTTP bypass
Rather than duplicating the 700-line retrieval pipeline, ask_everionmind calls /api/chat with x-internal-uid + service-role bearer key. chat.ts validates this pair and skips JWT auth. Trade-off: ~100ms extra latency vs. zero maintenance overhead — pipeline improvements automatically flow to MCP. Files: api/mcp.ts, api/chat.ts.

## Concept labels must be categorical themes, not instance-specific
Prompt rule + post-processing both enforced. "identity documents" not "father's South African ID number". Word cap of 3 as safety net. sanitizeConceptLabel() in conceptGraph.ts strips possessives and truncates on every AI response. Files: src/config/prompts.ts, src/lib/conceptGraph.ts.

## Per-entry concept rewrite in DetailModal edit mode
Added ✦ Rewrite button in edit form that re-audits a single entry's concepts using the strict prompt rules, strips old mappings from the graph, and saves fresh ones immediately. No backend changes needed — uses existing /api/llm + graph save path. File: src/views/DetailModal.tsx.

## System prompt delivered three ways from MCP
serverInfo.instructions (broadest compat), prompts/list + prompts/get (MCP spec), and tool descriptions (always read). Covers all MCP client implementations. File: api/mcp.ts.
