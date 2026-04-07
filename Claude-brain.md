# Claude-brain.md — OpenBrain Blind Spot Analysis

A comprehensive audit of blind spots, risks, and opportunities across security, UX, AI, data model, and architecture.

---

## 1. CRITICAL — Fix Now

### 1.1 No Soft Delete / No Trash
- Entries are hard-deleted (`DELETE` in `/api/entries.js:85-88`). No `deleted_at` field, no trash, no recovery.
- The 5-second undo toast in the UI is the only safety net. If the user closes the tab, the entry is gone forever.
- Brain deletion cascades and destroys all entries (`ON DELETE CASCADE` in migration 001).
- **Fix:** Add `deleted_at` column, soft-delete by default, add a Trash view with 30-day auto-purge.

### 1.2 Offline Sync Silently Drops Data
- `/src/hooks/useOfflineSync.js:48-95` — After 3 failed retries, operations are permanently removed from the queue with `await remove(op.id)`. The user is never notified.
- `/src/lib/offlineQueue.js:25-37` — If both IndexedDB and localStorage hit quota limits, the queue item is silently lost (empty `catch {}` on line 33).
- **Scenario:** User captures an entry offline → network is flaky → sync fails 3x → entry deleted from queue → user never knows.
- **Fix:** Show persistent banner/toast for failed sync operations. Keep failed items in a "failed" state instead of deleting. Let users manually retry or copy the content.

### 1.3 No Backups
- No scheduled Supabase backups mentioned anywhere.
- No "download all my data" feature beyond the JSON export (which is brain-specific, max 500 entries on import).
- If Supabase has a database issue, everything could be lost.
- **Fix:** Set up Supabase scheduled backups (pg_dump cron). Add a full account export (all brains, links, vault keys).

### 1.4 API Keys in localStorage (XSS Risk)
- `/src/lib/aiFetch.js:47-162` — All user API keys (Anthropic, OpenAI, OpenRouter, Groq, Gemini) stored in plaintext localStorage.
- Any XSS vulnerability or malicious browser extension can steal all keys.
- **Fix (short-term):** Add Content Security Policy headers. Consider sessionStorage (cleared on tab close).
- **Fix (long-term):** Server-side key vault — user enters key once, server stores encrypted, proxies all AI calls.

### 1.5 Secrets Sent to External LLMs
- `/api/chat.js:113-123` — Decrypted vault secrets are injected into the system prompt and sent to whichever LLM provider the user has configured (including OpenRouter, which proxies to third parties).
- **Fix:** Only allow secrets in chat when using Anthropic direct (trusted). Block or warn for OpenRouter/OpenAI.

---

## 2. HIGH — Fix Soon

### 2.1 Embedding Provider Mismatch
- Users can switch between OpenAI and Google embeddings mid-use.
- Old entries embedded with OpenAI, new with Google → different vector spaces → cosine similarity returns garbage.
- `/api/embed.js` stores `embedding_provider` per entry but search doesn't validate consistency.
- **Fix:** Warn when switching providers. Prompt to re-embed all entries. Or: block search until all entries use the same provider.

### 2.2 No Token/Cost Tracking
- No usage logging anywhere. A user running Refine on 500 entries, re-embedding everything, and chatting extensively has no visibility into API spend.
- **Fix:** Add a simple token counter (input + output per call) stored in localStorage or Supabase. Show monthly usage in Settings.

### 2.3 Metadata Has No Schema
- `metadata` is freeform JSONB. Prompts define keys like `due_date`, `phone`, `email`, but the database doesn't enforce anything.
- AI might output `metadata.phon` instead of `metadata.phone`, or `due_date: "ASAP"` instead of a real date.
- **Fix:** Add validation in `/api/capture.js` — at minimum validate date formats and known field names. Consider a metadata schema per entry type.

### 2.4 No Bulk Operations
- No multi-select, no bulk edit, no bulk delete, no bulk tag assignment.
- Users must edit entries one at a time.
- Duplicate detection exists (`/src/lib/duplicateDetection.js`) but there's no merge UI.
- **Fix:** Add multi-select checkboxes to grid view. Add bulk actions: delete, change type, add/remove tags, move to brain.

### 2.5 Search is Barebones
- `/src/lib/searchIndex.js` — Simple token-based inverted index.
- No fuzzy matching, no phrase search, no AND/OR operators, no relevance ranking, no search history, no result highlighting.
- **Fix (quick):** Add fuzzy matching (Levenshtein or n-gram). Add result count and match highlighting.
- **Fix (proper):** Combine local text search with semantic (embedding) search for hybrid results.

### 2.6 Chat Context Too Limited
- Only top 20 entries with 300-char content snippets. No source citations.
- Multi-turn conversations lose context because each message is independently embedded.
- Links are fetched but target entry titles aren't included — LLM sees IDs, not names.
- **Fix:** Include link target titles. Increase content to 500 chars. Add citation markers so users can verify answers.

### 2.7 Silent Error Handling Everywhere
- Dozens of empty `catch {}` blocks across the codebase — errors are swallowed without user feedback.
- Critical paths affected: entry save, offline sync, AI calls, embedding, link creation.
- **Fix:** Add a global toast/notification system for errors. Convert silent catches to user-visible feedback on critical paths.

---

## 3. MEDIUM — Plan For

### 3.1 Accessibility Gaps
- Most icon-only buttons lack `aria-label`.
- No keyboard navigation for modals (except DetailModal which handles Escape).
- No focus-visible styles (many buttons use `outline: none`).
- Graph canvas has 20px hit detection — impossible on mobile.
- No `aria-live` regions for dynamic content updates.
- **Fix:** Audit all interactive elements for aria-labels. Add focus-visible styles. Add keyboard navigation for modals and nav.

### 3.2 Mobile Touch Targets
- Many buttons use padding like `4px 14px` or `5px 10px`, resulting in targets well below the 44px minimum.
- Affected: undo button, type filter buttons, brain switcher, onboarding dismiss, graph nodes.
- **Fix:** Audit all buttons for `minHeight: 44` and `minWidth: 44`.

### 3.3 Entry Limit / Pagination
- `/api/entries.js:48` — Hard-coded `limit=500`. Users with more entries can't access older ones.
- Export (`/api/transfer.js:38`) fetches ALL entries with no pagination — Vercel timeout risk for large brains.
- **Fix:** Add cursor-based pagination to GET /api/entries. Paginate export.

### 3.4 Rate Limiting is Per-Instance
- Without Upstash Redis, the in-memory fallback (`/api/_lib/rateLimit.js:9-16`) is per Vercel instance.
- Distributed or multi-tab attacks bypass it entirely.
- **Fix:** Set up Upstash Redis (free tier available). Or use Vercel KV.

### 3.5 Vault Key Race Condition
- `/api/user-data.js:153-161` — Check-then-insert for vault setup has a TOCTOU race. Two simultaneous requests could both pass the "no existing key" check.
- **Fix:** Add `UNIQUE` constraint on `vault_keys(user_id)` and use `INSERT ... ON CONFLICT DO NOTHING`.

### 3.6 Capture Prompt Ignores Workspace
- CAPTURE prompt outputs `"workspace": "business"|"personal"|"both"` but the API doesn't store it.
- The field is generated, sent, and discarded.
- **Fix:** Either use the workspace field (map to brain assignment) or remove it from the prompt.

### 3.7 Entry Types Too Rigid
- Only 10 types: note, person, place, idea, contact, document, reminder, color, decision, secret.
- Missing: event, company/business, transaction, subscription, recipe, project, habit.
- A restaurant is forced into "place" or "contact" when it's really a business entity.
- **Fix:** Allow custom types, or at least expand the list. Add subtypes via metadata.

### 3.8 No Notification Test
- Users configure push notifications but can't send a test to verify it works.
- No notification history, no quiet hours, no per-type toggle.
- Missing notification types: birthdays, review reminders, sync completion.
- **Fix:** Add "Send test notification" button. Add notification log.

---

## 4. IDEAS — Future Value

### 4.1 Missing Views
- **List/Table view** — Sortable, filterable table (not just grid).
- **Tag browser** — Browse all tags, see tag cloud, click to filter.
- **Contact directory** — Specialized view for person/contact entries with phone/email quick-actions.
- **Kanban board** — Visual workflow for ideas/decisions with drag-and-drop status columns.
- **Analytics dashboard** — Capture trends, entry distribution by type, brain health score, stale entry count.
- **Daily digest** — Morning briefing view: today's todos, expiring documents, recent captures, nudges.

### 4.2 Templates
- No templates for common entry types (new supplier checklist, contact card, project idea, recipe).
- Users create from scratch every time.
- **Idea:** Predefined templates per type. User taps "New Supplier" → pre-filled fields (company name, contact person, phone, products, pricing).

### 4.3 Rich Capture
- Only text and voice-to-text today. No image/photo capture, no file attachments, no URL preview/scraping.
- **Idea:** Paste a URL → auto-scrape title, description, key info. Take a photo of a business card → OCR → structured contact entry.

### 4.4 Saved Searches / Smart Filters
- No way to save a filter combo ("all suppliers with expiring documents in the next 30 days").
- **Idea:** Save search as named filter. Pin to sidebar. Auto-count badge.

### 4.5 Activity Log
- No visibility into who edited what in shared brains.
- **Idea:** Per-entry changelog. Brain-level activity feed showing recent edits, new entries, deletions.

### 4.6 Conflict Resolution
- If two users edit the same entry in a shared brain simultaneously, last-write-wins with no merge.
- If a user edits offline and someone else edits the same entry online, the offline sync overwrites.
- **Idea:** Detect conflicts on sync. Show diff. Let user choose which version to keep.

### 4.7 Entry Comments / Annotations
- No way to add notes to an entry without editing the main content.
- **Idea:** Comment thread per entry. Useful in shared brains ("@John is this still current?").

### 4.8 Recurring Entries
- Only one-time events supported. `metadata.day_of_week` handles weekly recurrence in calendar display, but no monthly/yearly/custom recurrence.
- **Idea:** Full recurrence rules (RRULE-style). Auto-generate upcoming instances.

### 4.9 Brain Health Score
- Refine detects issues but doesn't give an overall score.
- **Idea:** "Brain health: 72%" with breakdown (15 stale entries, 3 missing phone numbers, 2 possible duplicates). Gamify — users want to hit 100%.

### 4.10 Cross-Brain Insights
- Each brain is siloed. No way to see patterns across personal + business brains.
- **Idea:** Optional cross-brain view. "Your supplier in business brain is also your neighbor in personal brain."

### 4.11 API Write Access
- External API (`/api/external`) is read-only.
- **Idea:** Add write endpoints (create entry, update entry) so external apps (calendar, todo) can sync changes back.

### 4.12 Hashing Brain API Keys
- Brain API keys stored in plaintext in `brain_api_keys` table.
- **Idea:** Store bcrypt/argon2 hash. Show key only once at creation (already done in UI). Compare on each request.

---

## 5. TECHNICAL DEBT

### 5.1 N+1 Query Patterns
- `/api/embed.js:110-126` — Batch embed does N separate PATCH requests (one per entry). Should use single bulk PATCH with `id.in.(...)`.
- `/api/chat.js:93-95` — Link query builds OR filter with N IDs. Should use `from.in.(id1,id2,...)`.

### 5.2 Fire-and-Forget Audit Logging
- Audit log writes in `/api/entries.js`, `/api/capture.js`, `/api/brains.js` are fire-and-forget with `.catch(() => {})`.
- If audit table is down, no record of operations. No fallback.

### 5.3 Embedding Text Composition
- `/api/_lib/generateEmbedding.js:46-54` — Entry text for embedding is `title + content + tags` with no weighting.
- Title should carry more weight. First 300 chars of content matter more than the tail.

### 5.4 Similarity Threshold
- `/api/search.js:33` — Hardcoded 0.4 cosine similarity threshold. May be too loose (false positives) or too strict depending on content domain.
- Should be configurable or adaptive.

### 5.5 Onboarding Re-access
- Onboarding modal shown once then hidden forever (`openbrain_onboarded` flag). Users can't re-access structured guidance.
- No context-sensitive help per view.

---

## 6. WHAT'S WORKING WELL

Worth noting what doesn't need fixing:

- **Vault encryption** — AES-256-GCM, non-extractable keys, PBKDF2 310k iterations, recovery key flow. Solid.
- **Auth flow** — Supabase JWT + `verifyAuth` on every endpoint. `checkBrainAccess` for brain-level permissions.
- **Input validation** — Content capped at 10k chars, tags at 50, title at 500. No SQL injection possible (Supabase REST API).
- **Offline-first architecture** — IndexedDB cache with localStorage fallback. Entries render immediately from cache.
- **AI prompt design** — Structured, specific, with format enforcement. ENTRY_AUDIT is particularly well-designed.
- **Multi-brain system** — Clean separation. Role-based access. Cross-brain sharing via junction table.
- **Refine view** — Unique feature. AI-powered data quality auditing with accept/reject/edit flow.
