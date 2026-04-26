# Semantic Search — Design Spec
**Date:** 2026-04-07

## Problem

Current search is a client-side token-based inverted index (`src/lib/searchIndex.ts`). It has no understanding of meaning — searching "car" won't find "vehicle". User has embeddings already stored via pgvector (migration 008, `match_entries()` RPC already exists).

## Decision

Replace token-based search with **server-side semantic search** using existing pgvector infrastructure. The client-side index is kept as offline fallback only.

---

## Architecture

```
User types query
      ↓
Client calls POST /api/search { query, brain_id }
      ↓
Server: embed query using same provider as entries
      ↓
Server: call match_entries(query_embedding, brain_id, 20)
      ↓
Return ranked results with similarity score
      ↓
Client renders results (no local index needed)
```

**Fallback chain:**
1. Online + embed key configured → semantic search via `/api/search`
2. Online + no embed key → keyword scoring via `scoreEntriesForQuery` (chatContext.ts)
3. Offline → local token index (`searchIndex.ts`)

---

## API: POST /api/search

**Request:**
```json
{ "query": "car insurance renewal", "brain_id": "uuid", "limit": 20 }
```

**Auth:** `verifyAuth` (standard).

**Logic:**
1. Rate limit (20/min).
2. Validate query (non-empty, max 500 chars).
3. Read embed provider + key from request headers (`x-embed-provider`, `x-embed-key`).
4. If no embed key → return `{ fallback: true }` so client uses keyword scoring.
5. Generate embedding for query text.
6. Call `match_entries` RPC with `query_embedding`, `brain_id`, `limit`.
7. Filter results where `similarity >= 0.3` (configurable via env `SEARCH_THRESHOLD`).
8. Return `{ results: Entry[], fallback: false }`.

**Response entry shape** (subset):
```json
{
  "id": "...", "title": "...", "content": "...", "type": "...",
  "tags": [...], "metadata": {...}, "similarity": 0.82
}
```

---

## Client Changes

**`src/lib/searchIndex.ts`** — keep existing exports for offline fallback, add:
```ts
export async function semanticSearch(query: string, brainId: string, entries: Entry[]): Promise<Entry[]>
```
- Online: POST `/api/search`, return results
- Offline or no embed headers: use `scoreEntriesForQuery` + existing token index

**`src/OpenBrain.tsx`** (or wherever search is called) — replace current `searchIndex(query)` call with `semanticSearch(query, brainId, entries)`. Debounce 300ms.

---

## Chat Context Integration

`src/lib/chatContext.ts` — when user sends a chat message:
1. If embed key available: call `POST /api/search` with the user's message as query
2. Use semantic results as context entries (instead of keyword scoring)
3. Include link target titles: for each result entry, resolve its outgoing links and include `[linked: "Target Title"]` in the context
4. Add source citations in system prompt: `[Source: Entry Title (ID: xxx)]`

---

## Tests

- `tests/api/search.test.ts` — returns fallback when no embed key, calls match_entries when key present, filters by threshold
- `tests/lib/semanticSearch.test.ts` — falls back to keyword offline, calls API when online
