# Next Steps — 2026-04-03

## Immediate (do first) — Apply Migration 008

Migration `supabase/migrations/008_pgvector.sql` is committed but NOT applied to Supabase yet.

Apply it:
```
SUPABASE_DB_PASSWORD="..." npx supabase db push --linked
```
Or paste the migration SQL directly in the Supabase dashboard SQL editor.

After applying, verify:
- `SELECT * FROM pg_extension WHERE extname = 'vector';` — should return a row
- `SELECT column_name FROM information_schema.columns WHERE table_name='entries' AND column_name='embedding';` — should return 'embedding'
- `SELECT routine_name FROM information_schema.routines WHERE routine_name='match_entries';` — should return row

Then go to Settings → Semantic Search & RAG, add an OpenAI or Gemini key, and click "Embed all entries".

## Soon

### Complete AI-models.md Phase 2 + 3 (from prior session)

**Phase 2: Add task: params to all callAI() sites**

**OpenBrain.jsx** — grep for `callAI({` and add task param:
- Nudge useEffect → `task: "chat"`
- Onboarding batch parse → `task: "capture"`
- QuickCapture callAI → `task: "capture"`

**SuggestionsView.jsx**:
1. ~line 168: image upload `authFetch("/api/anthropic")` → replace with `callAI({ messages: [...], max_tokens: 600, task: "vision" })`
2. FILL_BRAIN callAI() → add `task: "questions"`
3. QA_PARSE callAI() → add `task: "capture"`

**RefineView.jsx**:
1. ENTRY_AUDIT callAI() → add `task: "refine"`
2. LINK_DISCOVERY callAI() → add `task: "refine"`

**Phase 3:** Settings UI per-task model selection (see prior next-steps.md for full code snippet)

### Clean up
- Review/delete `supabase/functions/test-secret.ts` — untracked, unknown purpose
- Delete SupplierPanel dead code from `src/OpenBrain.jsx` (component still imported but tab removed)
- Fix QuickCapture offline path — missing `p_brain_id` in `enqueue()` body in `src/OpenBrain.jsx`

## Deferred
- AI-models.md Phase 4 (Voice/Whisper) — separate transcription API, needs design
- Wire GraphView + CalendarView to live entries (currently use INITIAL_ENTRIES)
- TodoView DB sync (currently localStorage-only)
- E2EE implementation — documented in GAPS.md
- Distributed rate limiting (Upstash Redis) — documented in GAPS.md as critical security gap
- Cross-brain semantic search (match_entries currently scoped to `brain_id` only, not entry_brains junction)

## Warnings
- ⚠️ Migration 008 NOT applied yet — `match_entries()` function doesn't exist until it's applied. `/api/search` and `/api/chat` will return 502 until then.
- ⚠️ SuggestionsView.jsx image upload is still hardcoded `authFetch("/api/anthropic")` — bypasses model routing
- ⚠️ In-memory rate limiter still live — serverless instances each have separate counters
- ⚠️ `src/config/prompts.js` EXISTS — use `PROMPTS.*` constants, do not revert to inline strings
