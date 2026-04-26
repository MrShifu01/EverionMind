# Chat Feature Design
**Date:** 2026-04-18
**Status:** Approved

## Overview

A full-featured chat interface that gives users natural-language access to their EverionMind database — read, write, update, delete, and analytical insights. Mirrors the MCP tool set exactly but runs faster (server-side tool execution, no external round-trips). Available in the bottom nav (mobile) and desktop sidebar.

---

## Architecture

### Backend: `/api/llm.ts?action=chat`

Chat is added as a new action to the existing `/api/llm.ts` handler. This avoids adding a 13th Vercel serverless function (Hobby tier limit is exactly 12, currently full).

**Request:**
```json
{
  "message": "string",
  "brain_id": "uuid",
  "history": [...],
  "confirmed": false
}
```

**Response:**
```json
{
  "reply": "string",
  "pending_action": { "tool": "delete_entry", "params": { "id": "..." }, "label": "Delete 'Avela Ntonto'" } | null,
  "history": [...]
}
```

**Request flow:**
1. Server receives message + history
2. Server calls Gemini 2.5 Flash Lite with 7 tool declarations
3. Gemini decides which tool(s) to call and with what params
4. Server executes tool directly against Supabase (using shared `retrievalCore.ts` and existing DB helpers)
5. Tool result fed back to Gemini
6. Gemini writes final response
7. Server returns reply + updated history

**Confirmation intercept:**
- For `update_entry` and `delete_entry`, if `confirmed: false` (default), server returns a `pending_action` object instead of executing
- Client renders a confirmation card showing what will change
- User confirms → client resends the same request with `confirmed: true`
- Server executes and returns result

### The 7 Tools (MCP mirror)

| Tool | Maps to |
|------|---------|
| `retrieve_memory(query, limit)` | `retrievalCore.ts` — full 6-step hybrid pipeline |
| `search_entries(query, type, tags, limit)` | DB search with filters |
| `get_entry(id)` | Single entry fetch |
| `get_upcoming(days)` | Entries with upcoming dates |
| `create_entry(title, content, type, tags, metadata)` | `/api/capture` logic |
| `update_entry(id, fields)` | Entry update — requires confirmation |
| `delete_entry(id)` | Entry delete — requires confirmation |

---

## Conversation History

**Storage:** JSONB field on the existing `user_data` table, keyed as `chat_history_<brain_id>`. No schema migration needed — `user-data.ts` already supports arbitrary keyed fields.

**Message shape:**
```json
{
  "role": "user" | "assistant" | "tool",
  "content": "string",
  "tool_name": "retrieve_memory",
  "tool_result": {},
  "ts": "ISO timestamp"
}
```

**Rules:**
- Last 30 messages sent to Gemini per request (token budget)
- Full history stored in DB (user can scroll back)
- Each brain has independent history (`chat_history_<brain_id>`)
- History loads on ChatView mount, scrolls to latest message

---

## Frontend

### `src/views/ChatView.tsx` (new, built fresh)

- Message list: user bubbles (right-aligned), assistant bubbles (left-aligned)
- Tool activity indicators shown inline between messages: *"Searching your memory…"*, *"Creating entry…"*, *"Found 8 entries"*
- Confirmation card: when `pending_action` is returned, renders entry title + action description with red **Confirm** / **Cancel** buttons — nothing executes until confirmed
- Sticky input bar at bottom with send button
- History loads from DB on mount, auto-scrolls to bottom on new messages
- Keyboard-aware layout (same pattern as existing capture sheet)

### `src/hooks/useChat.ts` (new, built fresh)

- Manages message list state and loading state
- Sends `{ message, brain_id, history, confirmed }` to `/api/llm?action=chat`
- Handles `pending_action` response → sets confirmation state
- On confirm: resends with `confirmed: true`
- Saves updated history to `/api/user-data` after each exchange
- Loads history from `/api/user-data` on init

### AskView.tsx

Deleted — ChatView replaces it entirely.

---

## Navigation

### BottomNav (mobile)
Three regular items + centre FAB:
```
Memory  |  Chat  |  [+]  |  Settings
```
Chat uses a speech-bubble icon. FAB stays centre.

### DesktopSidebar
Chat bubble icon added to `NAV_ICONS` below Memory, above Todos.

### Everion.tsx
`chat` case added to the view switch → renders `<ChatView />`.

---

## System Prompt

Added to `api/_lib/prompts.ts` as `PROMPTS.CHAT`.

**Identity:** You are EverionMind, a personal knowledge assistant with direct read/write access to the user's memory database. Execute actions accurately and immediately.

**Tool behaviour:**
- Always retrieve before answering factual questions — never guess
- Chain tools when needed (retrieve → create/update based on results)
- For analytical requests, retrieve broadly then reason over results

**Analytical behaviour (proactive):**
- Gap detection: flag missing fields across entries of the same type
- Merge suggestions: identify duplicate or overlapping entries
- Split suggestions: identify entries containing multiple distinct entities
- Completeness: flag entries missing key metadata for their type

**Confirmation rule:** Before `update_entry` or `delete_entry`, state exactly what will change and stop. Never execute without explicit confirmation in the same turn.

**Tone:** Direct. No preamble. Single-datum questions get the value only.

---

## Files Changed

| File | Action |
|------|--------|
| `api/llm.ts` | Add `action=chat` handler |
| `api/_lib/prompts.ts` | Add `CHAT` prompt constant |
| `src/views/ChatView.tsx` | Create (replaces AskView.tsx) |
| `src/views/AskView.tsx` | Delete |
| `src/hooks/useChat.ts` | Create fresh |
| `src/components/BottomNav.tsx` | Add Chat nav item |
| `src/components/DesktopSidebar.tsx` | Add Chat nav icon |
| `src/Everion.tsx` | Add `chat` view case |

---

## Out of Scope

- Streaming responses (plain JSON response for now)
- Voice input
- Chat search / history browsing UI
- Per-message feedback buttons
