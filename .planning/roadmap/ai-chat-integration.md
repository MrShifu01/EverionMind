# Chat With Your Everion Brain — From Anywhere

## Current state

**Everion's built-in "Ask Brain" is already fully AI-powered.**

- Frontend: `src/views/ChatView.tsx` (+ `src/hooks/useChat.ts`)
- Backend: `api/chat.ts`
- Pipeline:
  1. Embed the user's question (OpenAI or Gemini embeddings)
  2. Semantic search over entries via Supabase `match_entries` RPC
  3. Retrieve top-20 relevant memories + their links
  4. Call LLM (Anthropic / OpenAI / OpenRouter) with memories as context
  5. Return answer + source entries

So the in-app chat is a real RAG system — not a placeholder. It supports multi-turn history, vault-secret injection (Anthropic only), and cross-brain search. That's the grandparent-tier answer and it already exists.

Everything below is about letting users chat with their brain from **outside** Everion.

---

## Levels, ranked by layman-friendliness

### Level 0 — In-app chat (already shipped)

**Who it's for:** everyone, especially grandparents.
**Setup:** none. Open Everion, tap Chat, ask.
**Status:** done. Polish and promote — make sure it's the first thing users see.

**Why it's tier 0:** zero configuration. No API keys. No third-party signup. Works on any phone with Everion installed.

**What to polish:**
- Bigger "Chat" CTA on empty-state home screen
- Example prompts visible before user types
- Voice-in button (already in iOS Safari via the keyboard mic)
- Share-answer button so users can forward replies

---

### Level 1 — WhatsApp bot

**Who it's for:** people who live in WhatsApp (grandparents, most of the non-US world).
**Setup:** scan one QR code in Everion → done. No password, no key.
**How:** Twilio WhatsApp Business API (or Meta Cloud API) → a small webhook → existing `api/chat.ts` handler.

**User flow:**
1. User opens Everion → Settings → Connect WhatsApp
2. Scans QR code → sends pre-filled message to the Everion number
3. Everion links their WhatsApp number to their account
4. From then on: text the number, get answers

**Pros**
- Grandma already uses WhatsApp
- No app install, no AI-chat signup
- Works on any phone
- Voice notes work (Whisper transcribe → chat)

**Cons**
- Twilio costs ~$0.005/message
- Meta Business verification for WhatsApp Business API
- Per-country regulations

**Ship plan**
- `api/whatsapp-webhook.ts` — receives Twilio POSTs, looks up user by phone, forwards to `/api/chat`
- Phone-link table in Supabase: `{user_id, phone, verified_at}`
- QR code on settings page = pre-filled `wa.me/<number>?text=link-<token>`

---

### Level 2 — SMS / iMessage

**Who it's for:** US grandparents who don't have WhatsApp.
**Setup:** same QR flow, different number.
**How:** Twilio SMS. iMessage via `sendblue.co` or similar (optional upgrade).

Same architecture as WhatsApp. Add once, both work.

---

### Level 3 — Siri Shortcut / Google Assistant

**Who it's for:** voice-first users, driving, hands-busy.
**Setup:** tap "Add to Siri" link in Everion → one confirmation → done.
**How:** iOS App Intents (native) + Android Assistant App Actions.

**User flow:** "Hey Siri, ask Everion what my wifi password is" → answer read out loud.

**Pros**
- Hands-free, works from lock screen
- No typing
- Already half-supported by iOS if app exposes intents

**Cons**
- iOS-only native experience (Android version is separate build)
- Needs PWA → native shell or Capacitor wrap for App Intents

---

### Level 4 — Remote MCP (Claude.ai)

**Who it's for:** people who already use Claude.ai as their daily AI.
**Setup:** click "Connect Everion to Claude" button → OAuth consent → done. Two clicks.
**How:** Host a remote MCP server at `https://mcp.everion.app/mcp`. Register it as a Claude.ai Connector. Use OAuth so no API keys.

**What Claude.ai sees:**
- `search_entries(query)` — RAG over the user's brain
- `get_entry(id)` — full entry content
- `list_brains()`
- `create_entry(...)` — optional, write-back
- `get_upcoming_reminders()`

**Pros**
- No key copy/paste — OAuth handles auth
- Works across Claude Desktop, Claude.ai web, Claude mobile
- Single server powers all Claude surfaces
- Revocable from Everion settings

**Cons**
- Claude-only (for now — ChatGPT connectors rolling out)
- Requires hosting (Vercel function fine)
- MCP protocol is still evolving

**Ship plan**
- `api/mcp/[...path].ts` — MCP Streamable HTTP endpoint
- OAuth flow reusing Supabase auth (Everion already has sessions)
- Scope table: `{token, user_id, brain_ids, permissions, created_at, revoked_at}`
- Settings → Integrations → "Connect to Claude" button deep-links to Claude.ai connector install

---

### Level 5 — ChatGPT Custom GPT (Actions)

**Who it's for:** ChatGPT Plus subscribers who want their brain inside ChatGPT.
**Setup:** medium friction — needs ChatGPT Plus, then "Create GPT" flow.
**How:** OpenAPI schema at `https://api.everion.app/v1/openapi.json` + API key as bearer token.

**User flow:**
1. Everion → Settings → Connect ChatGPT
2. Generate API key (shown once, copy-paste)
3. Click "Create Custom GPT" button → opens ChatGPT with prefilled schema
4. Paste key into the Auth field
5. Name the GPT, save

**Pros**
- Works inside ChatGPT, which many users treat as their home base
- OpenAPI is a mature standard

**Cons**
- Requires ChatGPT Plus ($20/mo)
- Copy-paste API key = friction
- GPT is only visible to its creator unless published
- Not grandparent-tier

**Ship plan**
- Reuse the MCP handlers, expose as plain REST `/v1/search`, `/v1/entries/:id`, etc.
- Generate OpenAPI schema from the same tool definitions
- API key table: `{key_hash, user_id, scopes, last_used_at, revoked_at}` — already half-built in codebase

---

### Level 6 — Remote MCP for Cursor / Zed / Claude Desktop (power users)

**Who it's for:** developers and power users who edit JSON config files.
**Setup:** copy a JSON snippet into their MCP client config.
**How:** same MCP server as Level 4, but users paste the URL + API key directly.

**Ship plan**
- Settings page shows a code block with the snippet pre-filled
- Supports both OAuth (for clients that understand it) and static API keys (for clients that don't)

---

### Level 7 — Email drop

**Who it's for:** people who live in Gmail/Outlook.
**Setup:** forward anything to `brain@everion.app`.
**How:** inbound email service (Resend, Postmark, or AWS SES) → webhook → create entry.

**Not chat, but it's the "save anything without opening Everion" sibling.** Pair with a daily/weekly digest email that's reply-able — reply to the digest with a question, get an answer back by email. That turns email into a chat surface for grandparents who don't want a new app.

---

## Recommended order of shipping

1. **Polish Level 0** (in-app chat) — promote it aggressively, big CTA, example prompts, voice in. One sprint.
2. **Level 1** (WhatsApp) — biggest layman unlock. One sprint + Twilio setup.
3. **Level 4** (Claude MCP with OAuth) — power users love Claude, small surface to build since RAG already exists in `api/chat.ts`. One sprint.
4. **Level 7** (email drop + repliable digest) — cheap, high-value side quest. Half a sprint.
5. **Level 5** (ChatGPT Custom GPT) — once REST layer exists from Level 4. Half a sprint.
6. **Level 3** (Siri Shortcut) — after native shell exists. Separate track.
7. **Level 2** (SMS) — only if US adoption demands it.

---

## Architecture summary — one backend, many surfaces

```
                              ┌──────────────────┐
                              │  api/chat.ts     │
                              │  (RAG pipeline)  │
                              └────────┬─────────┘
                                       │
          ┌────────────┬────────────┬──┴───┬────────────┬────────────┐
          │            │            │      │            │            │
    ┌─────▼────┐  ┌────▼────┐  ┌────▼───┐ ┌▼───┐  ┌─────▼────┐  ┌────▼─────┐
    │ ChatView │  │WhatsApp │  │  MCP   │ │REST│  │  Email   │  │   Siri   │
    │  (app)   │  │webhook  │  │ server │ │ v1 │  │ webhook  │  │ Intents  │
    └──────────┘  └─────────┘  └────────┘ └────┘  └──────────┘  └──────────┘
```

Every surface is a thin adapter over the same `api/chat.ts`. Build the backend once. Add channels as thin wrappers. Don't duplicate the RAG logic.

---

## Security baseline (applies to every level above Level 0)

- **Vault entries never leave the device.** They're E2E-encrypted; the server can't decrypt them, so they can't be exposed to any external AI.
- **Per-channel scopes.** WhatsApp link ≠ API key ≠ MCP token. Revoke independently.
- **Rate limit per user, per channel.** Existing `rateLimit` helper already applied to `api/chat.ts`.
- **Audit log.** Every external-surface query writes `{user_id, channel, query, answered_at, entries_returned}` for the user to review in Settings → Activity.
- **One-tap kill switch.** Settings → Integrations → "Disconnect all external access" purges every token.

---

## TL;DR for the product decision

- In-app chat (Level 0) is already built and AI-powered. Promote it — grandparents should never leave Everion to chat with their brain.
- For "chat with my brain from anywhere" in a layman-friendly way, **WhatsApp (Level 1) beats every AI-chat integration**. It's the only channel grandma already has open.
- MCP + Claude.ai (Level 4) is the right power-user answer. One OAuth click, zero keys.
- ChatGPT Custom GPTs (Level 5) are worth it once the REST layer exists, but they're not grandparent-tier — treat as bonus.
- Stop designing the "works in every AI chat" button. It doesn't exist and grandma doesn't need it.
