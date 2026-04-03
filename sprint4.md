# Sprint 4 — Open, Connected, and Multi-User

The focus of this sprint is three things: give users full ownership of their data (export/import), enforce proper permission boundaries on shared brains, and open the AI layer so users can bring their own keys and connect from anywhere — including WhatsApp and Telegram.

---

## What This Sprint Delivers

| # | Feature | What changes |
|---|---------|-------------|
| 1 | Export / Import | Users can download all their brain data and restore it or move it to another brain |
| 2 | Member role enforcement | viewer cannot write; member cannot invite; owner controls everything |
| 3 | OpenRouter integration | Users connect via their own OpenRouter key and pick any model from a live list |
| 4 | Persistent AI memory file | A per-user `.md` guide that travels with every AI request regardless of model/provider |
| 5 | WhatsApp + Telegram bridge | Supabase Edge Function receives messages from both platforms and saves them as entries |

---

## 1. Export / Import

**Goal:** A user can download everything in a brain as a JSON file and restore it later — or import it into a different brain. Nothing is ever locked in.

### What to build

**Export:**
- Settings screen → Brain section → "Export Brain" button
- Downloads a JSON file: `openbrain-[brain-name]-[date].json`
- Format includes:

```json
{
  "version": 1,
  "exported_at": "2026-04-03T12:00:00Z",
  "brain": { "name": "Personal", "type": "personal" },
  "entries": [ ...all entry objects... ],
  "links": [ ...all link objects... ]
}
```

- Only entries the user can see are exported (respects brain access)
- `user_id`, `brain_id`, and `id` fields are stripped — they're context-specific and must be regenerated on import

**Import:**
- Settings screen → Brain section → "Import entries" button
- User picks a `.json` file (the OpenBrain export format above)
- Preview screen shows: "Found 47 entries. Import into: [brain picker]"
- On confirm: bulk `INSERT` all entries into the target brain with new UUIDs and the target `brain_id`
- Duplicate check: if an entry with the same `title` and `type` already exists in the target brain, show a warning — "3 duplicates found. Skip / Overwrite / Import anyway"
- Import progress: stream results back — "Importing... 12 / 47"

### Implementation notes

- **New API endpoint:** `api/export.js` — `GET /api/export?brain_id=xxx`
  - Verifies caller has access to the brain (owner or member role)
  - Calls `get_entries_for_brain` RPC (already used in `entries.js`)
  - Fetches links from `entry_links` table filtered by the returned entry IDs
  - Returns JSON response with `Content-Disposition: attachment; filename=...`

- **New API endpoint:** `api/import.js` — `POST /api/import`
  - Request body: `{ brain_id, entries: [...], options: { skip_duplicates: true } }`
  - Validates schema of each entry before inserting
  - Returns `{ imported: N, skipped: N, errors: [...] }`

- **Import size cap:** Max 500 entries per import. If the file has more, show an error before attempting.

- **Viewer role:** A viewer cannot import. Check `myRole !== "viewer"` before showing the Import button. Export is always allowed (read-only operation).

- **No new DB columns needed** — entries table already has all required fields. New entries get fresh UUIDs via `crypto.randomUUID()`.

---

## 2. Member Role Enforcement

**Goal:** The three roles (`owner`, `member`, `viewer`) are actually enforced in the UI — not just stored in the database.

### Current state

The `brains.js` API already defines three roles and stores them in `brain_members`. The `myRole` field is returned with every brain. The `brains.js` API already checks ownership for destructive actions. **But the frontend doesn't enforce anything yet** — viewers can see Edit buttons, non-owners can see Invite options, and the invite flow has no role selector.

### Role matrix

| Action | owner | member | viewer |
|--------|-------|--------|--------|
| View entries | ✓ | ✓ | ✓ |
| Add / capture entries | ✓ | ✓ | ✗ |
| Edit entries | ✓ | ✓ | ✗ |
| Delete entries | ✓ | ✓ | ✗ |
| Invite others | ✓ | ✗ | ✗ |
| Change member roles | ✓ | ✗ | ✗ |
| Remove members | ✓ | ✗ | ✗ |
| Export brain | ✓ | ✓ | ✓ |
| Import into brain | ✓ | ✓ | ✗ |
| Delete brain | ✓ | ✗ | ✗ |

### What to build

**1. `useRole()` hook** — `src/hooks/useRole.js`
```js
export function useRole(brain) {
  const role = brain?.myRole ?? "viewer";
  return {
    canWrite: role === "owner" || role === "member",
    canInvite: role === "owner",
    canDelete: role === "owner" || role === "member",
    canManageMembers: role === "owner",
    role,
  };
}
```

**2. QuickCapture** — hide / disable when `!canWrite`
- Pass `myRole` down into `QuickCapture`
- If `myRole === "viewer"`, replace the input with a read-only notice: "You have view access to this brain"

**3. DetailModal** — hide Edit and Delete buttons for viewers
- `DetailModal.jsx`: wrap Edit and Delete buttons in `{canWrite && <button>...}`

**4. Invite modal** — only owner sees it; add role picker
- The invite UI (currently in Settings or a modal) should only render when `canInvite`
- Add a role dropdown to the invite form: `Member` (can add/edit) | `Viewer` (read-only)
- The invite API (`brains.js?action=invite`) already accepts a `role` param — the frontend just doesn't send it

**5. Members list** — show each member's role; owner can change it
- Show role badge next to each member name: `OWNER` | `MEMBER` | `VIEWER`
- Owner sees a "Change role" dropdown per member
- **New API action needed:** `PATCH /api/brains?action=member-role` — body `{ brain_id, user_id, role }`
  - Updates `brain_members.role` in Supabase
  - Caller must be brain owner

### Implementation notes

- All role checks go through `useRole()` — never inline string comparisons scattered through JSX
- The DB-level protection already exists (the API checks `owner_id`). This sprint is about making the UI match what the backend enforces.
- Viewer label: use a subtle `🔒 View only` badge in the brain switcher chip so viewers always know their access level

---

## 3. OpenRouter Integration

**Goal:** Instead of being locked to Anthropic or OpenAI, users bring their own OpenRouter API key and choose from hundreds of models — including free ones. OpenBrain becomes provider-agnostic.

### What to build

**Settings → AI Provider section:**
- Provider selector: `Anthropic` | `OpenAI` | **`OpenRouter`** (new)
- When `OpenRouter` is selected:
  - API key input (masked, with show/hide toggle)
  - Model picker — populated by a live fetch from OpenRouter's model list endpoint
  - "Test key" button — sends a minimal completion request and shows ✓ / ✗
- Keys stored in `localStorage`: `openbrain_${userId}_openrouter_key`, `openbrain_${userId}_openrouter_model`

**Live model list:**
- On provider switch to OpenRouter, call `GET https://openrouter.ai/api/v1/models` with the user's key
- Populate a searchable dropdown with model names grouped by provider (e.g. `Anthropic`, `OpenAI`, `Google`, `Meta`)
- Show pricing per 1M tokens next to each model name so users can make an informed choice
- Cache the model list in `sessionStorage` (refreshed once per session)

**Model picker shortlist (pre-loaded fallback if no key yet):**
```
google/gemini-2.0-flash-exp:free   — Free, fast
anthropic/claude-3.5-haiku         — Fast, cheap
anthropic/claude-sonnet-4-5        — Balanced
anthropic/claude-opus-4-6          — Best quality
openai/gpt-4o-mini                 — Fast, cheap
openai/gpt-4o                      — Balanced
meta-llama/llama-3.1-70b-instruct  — Open source
```

### Implementation notes

- **New API endpoint:** `api/openrouter.js`
  - Same pattern as `api/anthropic.js` — a thin CORS proxy
  - Forwards to `https://openrouter.ai/api/v1/chat/completions`
  - Uses `x-user-api-key` header pattern already established in `anthropic.js:38`
  - Required headers: `Authorization: Bearer {key}`, `HTTP-Referer: https://openbrain.app`, `X-Title: OpenBrain`
  - Message format: OpenRouter uses OpenAI-compatible format (`{ role, content }` array, no separate `system` param — prepend as `{ role: "system", content: "..." }` first message)

- **`useModel()` hook — `src/hooks/useModel.js`**
  ```js
  export function useModel(userId) {
    const provider = localStorage.getItem(`openbrain_${userId}_provider`) ?? "anthropic";
    const model = localStorage.getItem(`openbrain_${userId}_model`) ?? MODEL; // from constants.js
    const openrouterKey = localStorage.getItem(`openbrain_${userId}_openrouter_key`) ?? "";
    return { provider, model, openrouterKey };
  }
  ```

- **Route AI calls:** All `authFetch("/api/anthropic", ...)` calls in `OpenBrain.jsx` need to route through a single `callAI(messages, system, options)` function that picks the right endpoint based on `provider`
  - `anthropic` → `/api/anthropic` (existing)
  - `openai` → `/api/openai` (existing)
  - `openrouter` → `/api/openrouter` (new)

- **ZDR flag:** When calling OpenRouter, include `"route": "fallback"` and avoid models that log data by default. Document this in the Settings screen tooltip: "OpenRouter routes your request to the model provider. Choose a model with ZDR (zero data retention) if your entries are sensitive."

- **Fallback behaviour:** If no BYO key is set, fall back to the server's Anthropic key (current behaviour). Existing users see no change.

---

## 4. Persistent AI Memory File

**Goal:** A per-user Markdown file that acts as a "classification guide" — injected into every AI request so the model understands how *this* user thinks, what categories matter to them, and how to format entries. It persists when you switch models or providers.

### What this solves

Right now, every AI call uses the same generic system prompt. If Chris has taught the app "Delta Distribution and Delta Gas are different suppliers, don't merge them" or "always tag anything about Smash Burger Bar as business" — that context is lost between sessions and doesn't travel when switching from Anthropic to OpenRouter.

### What to build

**Memory file structure** — stored in Supabase, one row per user in a new `user_memory` table:

```
user_id   | TEXT PRIMARY KEY
content   | TEXT  -- the Markdown guide (max 8000 chars)
updated_at| TIMESTAMPTZ
```

**Memory file format (what gets saved):**

```markdown
# OpenBrain Classification Guide — Chris

## Business Context
- Smash Burger Bar is my restaurant at Preller Square, Bloemfontein
- Anything about the restaurant: always tag "smash burger bar" and workspace="business"
- Delta Distribution and Delta Gas are DIFFERENT companies — never merge them

## Personal Context
- My driving licence expires November 2026 — treat renewals as high importance
- Medical aid is Momentum Health

## Classification Rules
- Supplier entries: always set metadata.category = "supplier"
- Prices I mention (e.g. "mince at R85/kg"): extract to metadata.price and metadata.unit
- Voice notes about staff: type = "person", tag "staff"

## Formatting Preferences
- Keep titles short (under 50 chars)
- Use bullet points in content for lists
- South African currency: always "R" not "ZAR"
```

**How the memory file is maintained:**

1. **Manual edit:** Settings → "AI Memory Guide" → full-page editor with the Markdown content. Save button triggers `PATCH /api/memory`.

2. **Auto-reflection (post-session):** After every 5 new entries are added, a background call fires with the last 10 entries and asks the AI: *"Based on these new entries, what classification rules or personal context should be added to or updated in this guide? Return only the additions as Markdown bullet points under the correct section. Do not repeat what's already there."*
   - The AI response is **appended** to the guide (not auto-merged, to avoid corruption)
   - A small "Your memory was updated" toast appears with a link to review it

3. **First-time setup:** On first login after this sprint ships, a one-time prompt: *"OpenBrain can learn your preferences over time. Would you like to start a memory guide? It takes 30 seconds."* — 3 questions about context, generates initial guide.

### Implementation notes

- **New API endpoints:**
  - `GET /api/memory` — fetch user's guide (returns `{ content, updated_at }`)
  - `POST /api/memory` — create initial guide (body: `{ content }`)
  - `PATCH /api/memory` — update guide (body: `{ content }`)

- **Inject into every AI call:** In the `callAI()` function (built in Feature 3), prepend the memory guide to the system prompt:
  ```
  [Classification Guide]
  {memory_content}

  [Task]
  {existing system prompt}
  ```

- **Memory guide is loaded once on app start** and stored in a `MemoryContext`. It does not re-fetch on every capture.

- **Size limit:** Cap at 8,000 characters. When approaching the limit, the editor shows a warning. Auto-reflection stops appending if the guide is within 500 chars of the cap.

- **New DB migration:** `supabase/migrations/[timestamp]_user_memory.sql`
  ```sql
  CREATE TABLE user_memory (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users manage own memory" ON user_memory
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  ```

- **PII warning:** The memory editor shows a notice: "This guide is sent to your AI provider with every request. Avoid including passport numbers, ID numbers, or bank details."

---

## 5. WhatsApp + Telegram Bridge

**Goal:** Send a message, photo, or voice note to a dedicated bot from anywhere — it saves directly into your OpenBrain. No app required.

### Architecture

```
User (WhatsApp / Telegram)
  → sends message
  → Platform API (Telegram Bot API / WhatsApp Cloud API)
  → fires webhook to Supabase Edge Function
  → Edge Function calls OpenRouter/Anthropic to classify message
  → saves entry to Supabase entries table
  → replies to user: "Saved: [title]"
```

### What to build

**Supabase Edge Function:** `supabase/functions/messaging-bridge/index.ts`

This single function handles both platforms via a `source` query param:
- `POST /functions/v1/messaging-bridge?source=telegram`
- `POST /functions/v1/messaging-bridge?source=whatsapp`

**Platform setup (done once per deployment):**
- **Telegram:** Create bot via @BotFather → get `BOT_TOKEN` → register webhook:
  `https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://{PROJECT_REF}.supabase.co/functions/v1/messaging-bridge?source=telegram`
- **WhatsApp:** Meta Developer Portal → WhatsApp Business Cloud API → set webhook URL to the same function with `?source=whatsapp`

**What the edge function does:**

1. **Receive:** Parse the incoming payload. Extract:
   - `platform_user_id` (Telegram chat ID or WhatsApp `wa_id`)
   - `message_text` (text message body)
   - `media_type` (photo, voice, document — if any)
   - `media_url` (download URL if platform provides one)

2. **Identify user:** Look up `messaging_connections` table:
   ```sql
   SELECT user_id, brain_id FROM messaging_connections
   WHERE platform = 'telegram' AND platform_user_id = '...'
   ```
   If no row exists → reply: "To connect this chat to your OpenBrain, go to Settings → Messaging and follow the link."

3. **Handle media:**
   - Voice note → call Whisper (or Anthropic audio) to transcribe → use transcript as message text
   - Photo → download → base64 encode → send to AI vision model to describe → use description as message text
   - Document → extract filename + description

4. **Classify:** Send message text to the AI (using the user's configured provider from `user_settings`) with the same classification prompt used by `api/capture.js`. Include the user's memory guide.

5. **Save:** Insert into `entries` table with `brain_id` from the connection record. Tag with `source: "telegram"` or `source: "whatsapp"` in metadata.

6. **Reply:** Send back to the platform: `"✓ Saved: [entry title] ([type])"`

**New database tables:**

```sql
-- which platform accounts are linked to which brain
CREATE TABLE messaging_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'whatsapp')),
  platform_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, platform_user_id)
);
ALTER TABLE messaging_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own connections" ON messaging_connections
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Connection flow (how a user links their Telegram/WhatsApp):**

- Settings → Messaging → "Connect Telegram" button
- Generates a one-time 6-character code (e.g. `XK7M2P`) stored in `messaging_pending_links` table with 10-minute expiry
- Instructions: "Send this code to @OpenBrainBot on Telegram: `XK7M2P`"
- When the bot receives the code, it looks up the pending link, creates the connection row, and confirms

**What a user can send:**
- Text: saved as note/idea/reminder depending on AI classification
- `/save [text]` — explicit save with feedback
- `/list` — bot replies with your last 5 entries as a summary
- `/help` — bot replies with usage instructions
- Photo + caption → caption is the context; photo is described by AI and merged

### Implementation notes

- **Secrets in Supabase Edge Function secrets** (not `.env`):
  - `TELEGRAM_BOT_TOKEN`
  - `WHATSAPP_VERIFY_TOKEN` (for webhook verification)
  - `WHATSAPP_ACCESS_TOKEN`
  - `SUPABASE_SERVICE_ROLE_KEY` (already available in edge functions as env var)

- **Telegram webhook verification:** Edge function must respond to `GET` requests with `?hub.verify_token=...` (WhatsApp requirement) and check `X-Telegram-Bot-Api-Secret-Token` header (Telegram requirement)

- **Voice note transcription:** Telegram sends voice as `.ogg` OGG/Opus. Supabase Edge Functions can call Anthropic's API with base64 audio — or route through OpenRouter if the user has a key configured.

- **Rate limiting:** Max 10 messages per user per minute. If exceeded, reply: "Slow down — I'll save the next one in a minute."

- **Media size limit:** Skip media files over 5MB. Reply: "That file is too large — try a smaller photo or shorter voice note."

- **Offline brain:** If the user's brain is paused or inaccessible, queue the message in a `messaging_queue` table and retry once per hour.

---

## Priority Order

| # | Feature | Impact | Effort | Do first because... |
|---|---------|--------|--------|---------------------|
| 2 | Member role enforcement | High | S | Blocks real multi-user use — viewers can currently write |
| 3 | OpenRouter integration | High | M | Provider-agnostic AI is the foundation for Feature 4 and 5 |
| 4 | Persistent AI memory file | High | M | Depends on `callAI()` refactor from Feature 3 |
| 1 | Export / Import | High | M | Independent — can be built in parallel with 3+4 |
| 5 | WhatsApp + Telegram bridge | High | L | Depends on: classified AI call (Feature 3), memory guide (Feature 4) |

---

## Shared Prerequisites

These things need to exist before Features 3, 4, and 5 can work cleanly. Build them first.

### `callAI(messages, system, options)` — `src/lib/ai.js`

A single function that routes to the right API endpoint based on the user's configured provider. Replaces all scattered `authFetch("/api/anthropic", ...)` calls.

```js
// src/lib/ai.js
export async function callAI(userId, messages, system, options = {}) {
  const provider = localStorage.getItem(`openbrain_${userId}_provider`) ?? "anthropic";
  const model = localStorage.getItem(`openbrain_${userId}_model`) ?? MODEL;
  const userKey = localStorage.getItem(`openbrain_${userId}_${provider}_key`) ?? "";

  const endpoint = {
    anthropic: "/api/anthropic",
    openai: "/api/openai",
    openrouter: "/api/openrouter",
  }[provider];

  const headers = userKey ? { "x-user-api-key": userKey } : {};
  return authFetch(endpoint, { method: "POST", headers,
    body: JSON.stringify({ model, messages, system, ...options }) });
}
```

### DB migrations needed

Create these before testing Features 4 and 5:

```
supabase/migrations/[ts]_user_memory.sql           — user_memory table (Feature 4)
supabase/migrations/[ts]_messaging_connections.sql  — messaging tables (Feature 5)
```

---

## What This Sprint Does NOT Include

- Gmail / Google Calendar / Xero integrations (those are in the integrations roadmap — separate sprint)
- Push notifications (deferred from Sprint 3)
- Paid subscription or usage billing per-user
- Multi-brain cross-search (one search across all brains simultaneously)
- Message history / conversation replay in the Telegram/WhatsApp bot

---

*Sprint 4 — drafted 2026-04-03*
