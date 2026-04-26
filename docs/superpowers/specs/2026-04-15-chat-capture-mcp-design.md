# Design: Chat Capture Flow + MCP Server

**Date:** 2026-04-15
**Status:** Approved

---

## Overview

Two features:

1. **Chat capture flow** — when EverionMind chat can't find an answer, it offers a one-tap flow to save the missing information directly into the right entry.
2. **MCP server + API keys** — expose EverionMind data to Claude Code via the MCP protocol, authenticated by user-generated API keys managed in Settings.

Both ship together. The MCP server requires consolidating two cron functions to stay within Vercel Hobby's 12-function limit.

---

## Feature 1: "Add it" Capture Flow

### Goal

When the AI has no answer for a query, the user can save that information in one tap, without leaving the chat or re-typing what they asked.

### Signal mechanism

Both chat paths (server-side and client-side) must emit a structured tag when info is missing:

```
[NO_INFO:<topic>]
```

Example: user asks "What's my passport number?" → AI responds:
```
You haven't saved your passport number yet. Want to add it? [NO_INFO:passport number]
```

**Changes to prompts:**
- `api/chat.ts` system prompt (`CHAT_SYSTEM`): add instruction — when a fact is not in retrieved memories, end the response with `[NO_INFO:<topic>]` where topic is the specific thing that's missing (2-5 words, lowercase).
- `src/config/prompts.ts` `CHAT` string: same instruction added to the existing "If a requested fact is not in MEMORIES" rule.

### Detection and state

In `src/hooks/useChat.ts`, after receiving the AI response:

1. Check for `[NO_INFO:<topic>]` pattern at end of response.
2. Extract topic, strip tag from displayed text.
3. Store in new state: `pendingCapture: string | null`.
4. Expose `pendingCapture` and `clearPendingCapture` from the hook.

### UI

The chat message bubble that triggered the no-info response renders with a small **"Add it"** button beneath the message text. Tapping it:

1. Clears `pendingCapture`.
2. Opens the existing capture sheet with the topic pre-filled as the input text.
3. The existing AI enrichment pipeline runs — type detection, metadata extraction, tag suggestion — exactly as if the user had typed it themselves.

No new capture UI is built. The existing capture sheet is reused entirely.

### Files changed

| File | Change |
|---|---|
| `api/chat.ts` | Add `[NO_INFO:<topic>]` instruction to `CHAT_SYSTEM` |
| `src/config/prompts.ts` | Add `[NO_INFO:<topic>]` instruction to `CHAT` prompt |
| `src/hooks/useChat.ts` | Parse tag, expose `pendingCapture` / `clearPendingCapture` |
| Chat message component (wherever bubbles are rendered) | Render "Add it" button when `pendingCapture` is set |

---

## Feature 2: MCP Server + API Keys

### Goal

Claude Code can search, read, and create entries in EverionMind via the MCP protocol, authenticated by a personal API key generated in Settings.

### Constraint: function limit

Vercel Hobby plan: 12 serverless functions max. Currently at 12. One slot must be freed.

**Consolidation:** Merge `api/cron/purge-trash.ts` and `api/cron/gap-analyst.ts` into `api/cron.ts`. A `?job=purge` or `?job=gaps` query param dispatches to the right handler. Update `vercel.json` cron schedules to point to `api/cron`. Delete the `api/cron/` directory.

Result: 11 functions. One slot free for `api/mcp.ts`.

### API key storage

New Supabase table: `api_keys`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `user_id` | uuid | FK to auth.users |
| `name` | text | user-given label (e.g. "Claude Code") |
| `key_hash` | text | SHA-256 of the raw key |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz | updated on each authenticated request |
| `revoked_at` | timestamptz | null = active |

The raw key is never stored. It is shown once at generation time, then discarded.

Key format: `em_` prefix + 32 random bytes as hex = `em_` + 64 chars. Total ~67 chars. Prefix makes it identifiable in config files.

### API key CRUD

Folded into the existing `api/user-data.ts` via `?resource=api_keys` to avoid consuming an extra function slot.

- `GET /api/user-data?resource=api_keys` — list active keys (name, id, created_at, last_used_at). Never returns hashes or raw keys.
- `POST /api/user-data?resource=api_keys` — generate new key. Body: `{ name: string }`. Returns `{ id, name, key }` where `key` is the raw key shown once only.
- `DELETE /api/user-data?resource=api_keys&id=<id>` — revoke key (sets `revoked_at`).

### Settings UI

Settings page gets a "Claude Code Access" section:

- Lists existing keys: name, creation date, last used date, revoke button.
- "Generate new key" button → opens a modal, prompts for a key name → shows the raw key with a copy button and warning: "Save this key — you won't see it again."
- Revoke button sets `revoked_at` immediately.
- After generation, Settings shows the key name and last-used date but never the raw key again.

### MCP server (`api/mcp.ts`)

Implements MCP protocol: JSON-RPC 2.0 over HTTP POST. No streaming required for the initial version — tools return synchronously.

**Authentication:** Every request must include `Authorization: Bearer <raw_key>`. The server SHA-256 hashes the key, queries `api_keys` for a match where `revoked_at IS NULL`, retrieves `user_id`, updates `last_used_at`. No match → 401.

**Tools exposed:**

| Tool | Input | What it does |
|---|---|---|
| `list_brains` | none | Returns user's brains (id, name) |
| `search_entries` | `query: string, brain_id?: string` | Vector search via existing search logic; returns top 10 entries |
| `get_entry` | `id: string` | Fetches a single entry by ID |
| `create_entry` | `title: string, content: string, brain_id: string, type?: string, tags?: string[]` | Saves entry directly to Supabase; returns created entry |

`create_entry` writes directly to the entries table (same as the capture pipeline) but skips AI enrichment — Claude Code is already structured, so enrichment is not needed. Type defaults to `"note"` if omitted.

**MCP protocol shape:**

```
POST /api/mcp
Authorization: Bearer em_<key>
Content-Type: application/json

{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "search_entries", "arguments": { "query": "passport number" } } }
```

Standard MCP `tools/list` and `tools/call` methods implemented. `initialize` handshake supported.

### Claude Code configuration

After generating a key in Settings, user adds this to their Claude Code MCP config once:

```json
{
  "mcpServers": {
    "everionmind": {
      "type": "http",
      "url": "https://<your-app>.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer em_<your_key>"
      }
    }
  }
}
```

Claude Code can then ask: "Search my EverionMind for my passport number" or "Save this note to EverionMind."

### Files changed

| File | Change |
|---|---|
| `api/cron.ts` | New — merged cron handler dispatching by `?job=` |
| `api/cron/purge-trash.ts` | Deleted |
| `api/cron/gap-analyst.ts` | Deleted |
| `vercel.json` | Update cron paths to `api/cron?job=purge` and `api/cron?job=gaps` |
| Supabase | New `api_keys` table + RLS policy (users see only their own keys) |
| `api/user-data.ts` | Add `?resource=api_keys` GET / POST / DELETE handlers |
| `api/mcp.ts` | New — MCP server |
| Settings component | Add "Claude Code Access" section |

---

## Build sequence

1. Merge cron functions → verify cron schedules still fire
2. Create `api_keys` Supabase table + RLS
3. Add key CRUD to `api/user-data.ts`
4. Build Settings UI for key management
5. Build `api/mcp.ts` with all four tools
6. Add `[NO_INFO:<topic>]` to both chat prompts
7. Add detection + `pendingCapture` state to `useChat.ts`
8. Add "Add it" button to chat bubble UI

---

## Success criteria

- Chat responds "You haven't saved your X yet" + shows "Add it" button for unknown facts
- Tapping "Add it" opens capture sheet pre-filled with the topic
- Settings shows key management UI; keys generate, list, and revoke correctly
- Raw key shown exactly once; subsequent views show only metadata
- Claude Code can `list_brains`, `search_entries`, `get_entry`, `create_entry` via MCP
- Total Vercel functions remain at 12
