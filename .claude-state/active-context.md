# Active Context — 2026-04-03
**Branch:** main | **Enhancement:** standard | **Project:** OpenBrain

## Session Summary
Designed and fully implemented pgvector embeddings + RAG system. Brainstormed spec (dual embedding provider: OpenAI text-embedding-3-small at 768 dims and Google text-embedding-004 at 768 dims), wrote design doc, then implemented all backend endpoints, DB migration, and client-side wiring in a single session.

## Built This Session
- `supabase/migrations/008_pgvector.sql` — pgvector extension, `embedding vector(768)`, `embedded_at`, `embedding_provider`, IVFFlat index, `match_entries()` function
- `api/_lib/generateEmbedding.js` — shared embedding logic (OpenAI batch + Google parallel)
- `api/embed.js` — single-entry and batch backfill endpoint
- `api/search.js` — semantic search via `match_entries` pgvector RPC
- `api/chat.js` — RAG pipeline: embed → top-20 retrieval → links for those entries → LLM with multi-turn history
- `src/lib/aiFetch.js` — added embed provider/key getters+setters (`getEmbedProvider`, `getEmbedKey`, `getEmbedHeaders`, `getGeminiKey`, `getEmbedOpenAIKey`, etc.)
- `src/lib/connectionFinder.js` — pre-filter candidates via `/api/search` before LLM call, falls back to random-50
- `src/components/QuickCapture.jsx` — fire-and-forget embed after save, brainId passed to findConnections
- `src/OpenBrain.jsx` — RAG chat path when embed key set, fire-and-forget re-embed on update, multi-turn history
- `src/views/SettingsView.jsx` — "Semantic Search & RAG" panel with toggle, key field, backfill button
- `docs/superpowers/specs/2026-04-03-embeddings-rag-design.md` — approved spec

## Current State
- All code committed on main (commit c655211)
- Migration 008 NOT YET applied to Supabase — must be applied via dashboard or `supabase db push`
- Embedding is opt-in: users without an embed key get existing keyword search + top-100 chat (zero regression)
- `supabase/functions/test-secret.ts` still untracked — unknown purpose, review and delete/commit

## In-Flight Work
- *(none)* — everything committed and clean

## Known Issues
- Migration 008 must be applied manually to Supabase (pgvector extension + schema changes)
- AI-models.md Phase 2 + 3 still incomplete (task: params on callAI() sites + settings UI) — see prior next-steps.md
- SuggestionsView.jsx ~line 168: image upload still hardcoded to `authFetch("/api/anthropic")` — bypasses model routing
- In-memory rate limiter still live — each serverless instance has separate counter

## Pipeline State
- **Last pipeline:** feature — 2026-04-03
- **Last scores:** composite 90/100
- **Open incidents:** none
