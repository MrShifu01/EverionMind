# REST Gateway Design
**Date:** 2026-04-17
**Status:** Approved — pending implementation

---

## Goal

Expose Everion Mind's memory layer as a simple REST API so users can connect any AI tool (ChatGPT, Claude, custom agents, scripts) to their personal knowledge base using their existing `em_` API key.

---

## Constraints

- Vercel Hobby plan: 12 serverless function limit (currently 11 used)
- One new function file (`api/v1.ts`) consumes the final slot
- No new auth system — reuse existing `em_` key + SHA-256 hash lookup

---

## Architecture

### Single function, internal routing

`api/v1.ts` handles all five endpoints. `vercel.json` rewrites `/v1/:path*` to `/api/v1`. The function reads `req.url` to route.

```
vercel.json rewrite:
  { "source": "/v1/:path*", "destination": "/api/v1" }
```

### Shared utilities (extracted from mcp.ts)

`api/_lib/resolveApiKey.ts` — extract `resolveUserFromKey()` so both `mcp.ts` and `v1.ts` share it without duplication.

---

## Endpoints

All endpoints:
- Method: `POST`
- Auth: `Authorization: Bearer em_<raw_key>`
- Content-Type: `application/json`
- Rate limit: 30 req/min (reuses existing `rateLimit.ts`)

### `POST /v1/context`

Returns the most relevant memory entries for a query.

**Request**
```json
{ "query": "What are my Q2 goals?", "limit": 5 }
```

**Response**
```json
{
  "results": [
    { "id": "uuid", "title": "Q2 Goals", "content": "...", "type": "note", "tags": ["goals"], "similarity": 0.87 }
  ]
}
```

- `limit` defaults to 5, max 50
- Uses full `retrieveEntries()` pipeline (vector + keyword + graph boost)

---

### `POST /v1/answer`

Returns an AI-synthesized answer grounded in the user's memories. The calling AI's API key is passed in the request — Everion never stores it.

**Request**
```json
{
  "query": "Summarize my goals for this quarter",
  "model": "openai/gpt-4o",
  "api_key": "sk-...",
  "limit": 5
}
```

**Response**
```json
{
  "answer": "Based on your notes, your Q2 goals are...",
  "sources": [
    { "id": "uuid", "title": "Q2 Goals", "similarity": 0.87 }
  ]
}
```

- Retrieves context first via `retrieveEntries()`, then calls Vercel AI Gateway with user-supplied `model` + `api_key`
- `model` format: `"openai/gpt-4o"`, `"anthropic/claude-3-5-sonnet"`, `"google/gemini-2.5-flash"`
- Everion's API key is never used for LLM calls — only the user's key is forwarded
- System prompt: instructs the model to answer using only the provided context

---

### `POST /v1/ingest`

Adds a new entry to the user's knowledge base.

**Request**
```json
{
  "title": "Q2 Goals",
  "content": "Ship the REST gateway by end of April...",
  "type": "note",
  "tags": ["goals", "q2"]
}
```

**Response**
```json
{ "id": "uuid", "title": "Q2 Goals", "created_at": "2026-04-17T..." }
```

- `type` defaults to `"note"`. Valid values: note, person, recipe, task, event, document, idea, contact
- Embedding generated automatically via Gemini
- Reuses `createEntry()` logic from `mcp.ts`

---

### `POST /v1/update`

Edits an existing entry. Only provided fields are updated.

**Request**
```json
{
  "id": "uuid",
  "title": "Updated Title",
  "content": "New content...",
  "tags": ["updated"]
}
```

**Response**
```json
{ "id": "uuid", "title": "Updated Title", "content": "...", "updated_at": "..." }
```

- At least one of `title`, `content`, `type`, `tags` required
- Embedding regenerated if `title`, `content`, or `tags` change
- Ownership verified via brain lookup before update
- Reuses `updateEntry()` logic from `mcp.ts`

---

### `POST /v1/delete`

Soft-deletes an entry (moves to trash, recoverable from UI).

**Request**
```json
{ "id": "uuid" }
```

**Response**
```json
{ "id": "uuid", "deleted": true }
```

- Ownership verified before deletion
- Reuses `deleteEntry()` logic from `mcp.ts`

---

## Error Format

All errors return a consistent shape:

```json
{ "error": "Invalid or revoked API key" }
```

| Scenario | HTTP Status |
|---|---|
| Missing auth header | 401 |
| Invalid / revoked key | 401 |
| Missing required fields | 400 |
| Entry not found or not owned | 404 |
| Rate limit exceeded | 429 |
| Internal error | 500 |
| LLM provider rejected the user's key or model | 502 — `{ "error": "LLM provider error: <message>" }` |

---

## File Changes

| File | Action |
|---|---|
| `api/v1.ts` | Create — main gateway handler |
| `api/_lib/resolveApiKey.ts` | Create — extracted from `mcp.ts` |
| `api/mcp.ts` | Edit — import from `resolveApiKey.ts` (remove duplicate) |
| `vercel.json` | Edit — add `/v1/:path*` rewrite |

---

## What This Is NOT

- No usage tracking (future-plans/roadmap.md — sub-project 2)
- No billing or rate tier (future-plans/roadmap.md — sub-project 4)
- No OpenAPI/plugin manifest (can be added without a new function slot)
- No semantic caching (future-plans/roadmap.md — sub-project 3)
