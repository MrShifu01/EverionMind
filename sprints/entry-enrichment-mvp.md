# Sprint: Entry Enrichment MVP

**Goal:** After an entry is saved, silently search the web for metadata, surface a simple confirmation card in the feed, and learn from every correction to make future searches smarter.
**Guiding principle:** One question at a time. Never auto-merge. Every "no" makes the system smarter.

---

## Overview

```
Entry saved
  → background job: SerpAPI search + LLM extraction
  → store as pending_metadata (unconfirmed)
  → show confirmation card in feed
  → user says yes/no
      yes → merge into entry
      no  → ask user to specify correct one
          → re-search with correction
          → store correction in enrichment_learnings
          → resurface in feed
```

---

## Phase 1: Background Search & Extraction

### Task 1.1: SerpAPI integration

- [ ] Add `SERPAPI_KEY` to `.env.local` and Supabase secrets
- [ ] Create `src/lib/enrich/search.ts`
  - `searchForEntry(entry: Entry): Promise<SearchResult[]>`
  - Builds query: `"${entry.title}" ${userContext.city ?? ""}` (city pulled from learnings if known)
  - Calls SerpAPI `search.json` endpoint, returns top 3 organic results `{title, snippet, url}`
  - Gate: skip if `entry.enriched_at` is set, skip if entry is Vault type

### Task 1.2: LLM extraction

- [ ] Create `src/lib/enrich/extract.ts`
  - `extractMetadata(entry: Entry, results: SearchResult[]): Promise<ExtractedMetadata>`
  - Sends top 3 snippets + entry title to Gemini Flash Lite
  - Prompt asks for: `name, address, phone, rating, website, category` — only fields present in snippets, no hallucination
  - Returns `{ fields: {...}, confidence: 0–1, best_match_url: string }`
  - If confidence < 0.5, skip — don't surface low-confidence cards

### Task 1.3: Trigger on entry save

- [ ] In `api/entries` POST handler, after successful DB insert, fire-and-forget:
  ```ts
  enrichEntryInBackground(entry).catch(console.error)
  ```
- [ ] `enrichEntryInBackground` in `src/lib/enrich/index.ts`:
  1. Run search + extraction
  2. Write result to `entries.pending_metadata` (jsonb column)
  3. Set `entries.enrichment_status = 'pending_confirmation'`

### Task 1.4: DB columns

- [ ] Migration: add to `entries` table:
  ```sql
  pending_metadata        jsonb,
  enrichment_status       text default 'none',  -- none | pending_confirmation | confirmed | rejected | learning
  enrichment_source_url   text,
  enriched_at             timestamptz
  ```

---

## Phase 2: Confirmation Card in Feed

### Task 2.1: Confirmation card component

- [ ] Create `src/components/EnrichmentConfirmCard.tsx`
- [ ] Shows as an inline card in the memory feed, beneath the entry it belongs to
- [ ] Design: simple, low-height, not alarming

**Card content:**

```
Is this "[Extracted Name]"?          [Yes]  [No]
[address line if found] · [rating if found]
```

- One line of extracted info as a hint (address or rating, whichever is most useful)
- Two buttons: **Yes** and **No**
- No paragraph of text, no metadata dump

### Task 2.2: Feed integration

- [ ] In `MemoryFeed` (or wherever entry cards render), after each entry card check `enrichment_status === 'pending_confirmation'`
- [ ] If true, render `<EnrichmentConfirmCard>` immediately below the entry card
- [ ] Card is dismissible (X icon) — dismissing sets status to `rejected`, no learning saved

### Task 2.3: Yes handler

- [ ] On "Yes":
  - Merge `pending_metadata.fields` into `entry.metadata` (never overwrite existing user-entered fields)
  - Set `enrichment_status = 'confirmed'`, set `enriched_at = now()`
  - Clear `pending_metadata`
  - Card disappears, entry card shows a small ✓ indicator

---

## Phase 3: No → Correction → Re-search

### Task 3.1: No handler — ask for correction

- [ ] On "No", card transitions to a correction input:

```
Which one is it? (type name or address)
[_____________________________] [Search]
```

- Simple single-line text input, "Search" button
- No dropdown, no suggestions — just free text

### Task 3.2: Re-search with correction

- [ ] On "Search" with correction text:
  - Build new query: `"${correctionText}"` (use correction verbatim)
  - Re-run search + extraction
  - Update `pending_metadata` with new result
  - Set `enrichment_status = 'pending_confirmation'` again
  - Card returns to the simple "Is this X?" question with new result
  - Repeat until "Yes" or dismissed

### Task 3.3: Save correction as learning

- [ ] On correction submitted (before re-search), write to `enrichment_learnings` table:
  ```sql
  create table enrichment_learnings (
    id           uuid primary key default gen_random_uuid(),
    brain_id     uuid references brains(id),
    entry_id     uuid references entries(id),
    original_query     text,
    wrong_result       text,   -- what the first search returned
    correction         text,   -- what the user typed
    inferred_context   jsonb,  -- see Task 4.1
    created_at   timestamptz default now()
  );
  ```

---

## Phase 4: Learnings — Context That Makes Future Searches Smarter

Every correction tells us something about the user. Extract and store structured context.

### Task 4.1: LLM context inference on correction

- [ ] After saving a learning row, run a cheap LLM call (Flash Lite):
  - Input: entry title, original wrong result, user's correction text
  - Extract any inferable context:
    - `city` — "Piranha Tyres Cape Town" → `{city: "Cape Town"}`
    - `country` — inferred from city
    - `neighbourhood` — "the one in Camps Bay" → `{neighbourhood: "Camps Bay"}`
    - `travel_context` — if entry created during a date range away from known home city → `{was_travelling: true, location: "..."}`
    - `preference_signal` — e.g. user corrected to a less-known local variant → `{prefers_local: true}`
  - Store in `enrichment_learnings.inferred_context`

### Task 4.2: User context store

- [ ] Create `enrichment_user_context` table (one row per brain, updated over time):
  ```sql
  create table enrichment_user_context (
    brain_id     uuid primary key references brains(id),
    home_city    text,
    home_country text,
    known_locations  jsonb,  -- [{city, country, last_seen}]
    travel_history   jsonb,  -- [{city, country, from_date, to_date}]
    updated_at   timestamptz default now()
  );
  ```
- [ ] After each learning is saved, update this table:
  - If `inferred_context.city` is new and appears in 2+ learnings → set as `home_city`
  - If entry was clearly from a different city → add to `travel_history`

### Task 4.3: Inject context into future searches

- [ ] In `search.ts`, before building query, load `enrichment_user_context` for the brain
- [ ] Append known home city if no location is already in the entry title:
  ```ts
  const query = `"${entry.title}" ${context.home_city ?? ""}`
  ```
- [ ] In `extract.ts`, include context in LLM prompt:
  ```
  User context: home city is Cape Town, South Africa.
  Recently corrected: "Piranha Tyres" → "Piranha Tyres Cape Town CBD"
  Use this context to prefer local results.
  ```

---

## Phase 5: Edge Cases & Guards

### Task 5.1: Rate limiting

- [ ] Max 1 enrichment job per entry (check `enrichment_status !== 'none'` before triggering)
- [ ] Max 3 re-searches per entry (track `enrichment_attempts` int column on entries)
- [ ] After 3 failed attempts, set status to `exhausted`, hide card permanently

### Task 5.2: Vault entries

- [ ] Hard check in `enrichEntryInBackground`: if `entry.is_vault === true`, return immediately, no search

### Task 5.3: No result case

- [ ] If SerpAPI returns no results or LLM confidence < 0.5, set `enrichment_status = 'no_result'`
- [ ] Never surface a card for `no_result` — fail silently

### Task 5.4: Cost guard

- [ ] Log each SerpAPI call to a `enrichment_api_log` table with cost estimate
- [ ] If monthly call count > 500 (configurable env var `ENRICHMENT_MONTHLY_LIMIT`), skip new enrichment jobs

---

## Files to Create

```
src/lib/enrich/
  index.ts         — orchestrator, triggered after entry save
  search.ts        — SerpAPI call, query builder, context injection
  extract.ts       — LLM extraction from snippets
  context.ts       — load/update enrichment_user_context and learnings

src/components/
  EnrichmentConfirmCard.tsx   — the confirmation card shown in feed

supabase/migrations/
  xxx_enrichment.sql          — pending_metadata cols, enrichment_learnings, enrichment_user_context tables
```

## Files to Modify

```
api/entries (POST handler)     — fire-and-forget enrichEntryInBackground
MemoryFeed or entry card list  — render EnrichmentConfirmCard when status = pending_confirmation
.env.local                     — SERPAPI_KEY, ENRICHMENT_MONTHLY_LIMIT
```

---

## Success Criteria

- [ ] Entry saved → confirmation card appears in feed within ~5 seconds (background, non-blocking)
- [ ] "Yes" merges metadata, card disappears, entry shows ✓
- [ ] "No" → correction input → re-search → new card with corrected result
- [ ] Every "no" + correction writes a learning row with inferred context
- [ ] Second entry from same city uses home_city in search query automatically
- [ ] Vault entries never trigger enrichment
- [ ] No enrichment card ever auto-merges without user confirmation
