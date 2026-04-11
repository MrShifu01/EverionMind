# Future Plan — Entry Enrichment (Web Lookup)

Let users fill in missing details on an entry (address, phone, hours, rating, author, ISBN, etc.) by looking things up on the web. Ship as an **explicit user action**, not a silent auto-behavior.

---

## Why this matters

Users capture fragments — "great pasta at Luigi's", "finished Dune", "met Sarah from Acme Corp" — and the interesting metadata (address, ISBN, LinkedIn) has to be typed in manually or it's lost. Enrichment turns a 5-word note into a structured, searchable, chat-queryable entry without the user lifting a finger beyond one tap.

The whole feature hinges on one decision: **user-triggered, reviewable, never silent**. Automatic model-driven web search is tempting but has too many failure modes (wrong entity, cost explosion, silent privacy leak, pollution of the brain). See the "Rejected approaches" section at the bottom for why.

---

## Versions

### v0.1 — Manual ✨ Look-up button (1 sprint)

**Scope**

- Add a small ✨ "Look this up" button on the entry detail view.
- On tap: route to the correct enrichment source based on the entry's type:
  - `restaurant` / `shop` / `service` → Google Places Text Search
  - `book` → Google Books / OpenLibrary
  - `movie` / `tv` → TMDB
  - `person` / `company` → Wikipedia API (fallback to Gemini grounded search)
  - anything else → Gemini grounded search
- Results land in a **suggestions panel** on the entry, never auto-merge.
- User accepts fields individually — one tap per field — or "Accept all".
- Rejected fields are discarded; accepted fields write to `metadata`.

**Data**

- New column `entries.enrichment_source jsonb` — stores `{source, fetched_at, raw}` for audit/refresh.
- New column `entries.enriched_at timestamptz` — when any field was accepted.
- New table `enrichment_cache (source, key_hash, response, fetched_at)` — cache by `(source + normalized query)` with a 7-day TTL to cut repeat API hits.

**UI**

- ✨ button sits next to the pin/delete buttons on entry detail.
- Suggestions panel slides up as a bottom sheet: checkboxes per field, "Apply" button.
- Every enriched field displays a small source chip ("from Google Places") that links to the source URL.
- Entry card in grid shows a ✓ dot if any field was accepted from web lookup.

**Cost control**

- No rate limit on v0.1 — just rely on manual triggering being self-limiting.
- Cache hits short-circuit the API call.
- Never enrich Vault entries. Hard client-side + server-side check.

**Scope out**

- No auto-triggering.
- No background enrichment.
- No re-enrichment on edit.
- No batch enrichment.

### v0.2 — Type-specific structured APIs (1 sprint)

**Why this is v0.2 and not v0.1**: v0.1 ships with one path per type already, but only stubs out Places + Wikipedia. v0.2 fills in the rest.

**Scope**

- Google Books / OpenLibrary for `book` entries — pulls `{title, author, isbn, cover_url, summary}`.
- TMDB for `movie` / `tv` entries — pulls `{title, year, director, genre, poster_url, overview}`.
- Wikipedia for `person` / `company` / `concept` entries — pulls summary + infobox facts.
- Fall back to Gemini grounded search if the structured API returns nothing.

**Modules**

```
src/lib/enrich/
  ├── index.ts           — router, picks source by entry type
  ├── places.ts          — Google Places Text Search + Details
  ├── books.ts           — Google Books + OpenLibrary fallback
  ├── tmdb.ts            — TMDB search + details
  ├── wikipedia.ts       — Wikipedia search + summary
  ├── geminiGrounded.ts  — Gemini 2.5 Flash Lite with google_search tool
  └── cache.ts           — hash-keyed DB cache
```

All modules implement the same interface:

```ts
interface EnrichmentSource {
  name: string;
  canHandle(entry: Entry): boolean;
  lookup(entry: Entry): Promise<EnrichmentResult>;
}

interface EnrichmentResult {
  source: string;
  confidence: number;              // 0–1
  fields: Record<string, unknown>;  // suggested field updates
  raw: unknown;                    // original API response
  attribution?: { url: string; label: string }; // citation link
}
```

### v0.3 — "Suggest" mode behind an opt-in (1 sprint)

**Scope**

- Settings → Auto-enrich: `Off (default) / Suggest only / Auto-merge`.
- "Suggest only" = after save, run enrichment in the background → add result to a **suggestions queue** on the entry. Entry shows a ✨ badge; user opens to review. Never auto-merges.
- Still runs only on types user opts into: `[restaurant] [book] [movie] [company] ...`.
- Never runs on:
  - Vault entries (hard enforced)
  - Entries already marked `enriched_at`
  - Entries flagged `private_note`
- Hard monthly spend cap — stored as cents, decrement on each call, halt at zero. User sees "Enrichment paused — budget exceeded" banner.

**Privacy UX**

- First-time opt-in modal lists exactly which third parties receive entry text (Google, Wikipedia, TMDB, OpenLibrary).
- "Never for this brain" option on brain settings.
- Activity log: Settings → Activity → Enrichment shows every call made, with source + cost.

### v0.4 — "Auto-merge" for high-confidence results (stretch)

**Scope**

- `Auto-merge high-confidence results (≥ 0.9)` mode in settings.
- Only merges **new** fields — never overwrites user-entered ones.
- Every auto-merged field is reversible via an "Undo enrichment" action on the entry (reverts to pre-merge `metadata`).
- Visible "Enriched from web" chip on the entry header.

**Guardrails**

- Confidence threshold is per-source, not global. Places results with `place_id` match + exact name = 0.95. Wikipedia disambiguation-page = 0.3 (never merges).
- Every source defines its own confidence formula.
- Telemetry: count user-undo rate per source. If > 5% of a source's auto-merges get undone, bump its threshold and alert.

### v0.5 — Batch re-enrichment (stretch)

**Scope**

- Improve Brain view gets a new suggestion type: `STALE_ENRICHMENT` for entries where `enriched_at` > 90 days old.
- User can bulk-refresh via the existing bulk-accept flow.
- Useful for restaurants that have changed hours, companies that moved, etc.

### v0.6 — Discovery queries (RAG + web search fusion)

**The one legitimate chat-time use of web search.** Not silent auto-enrichment during capture — a deliberate recommendation mode triggered by the user asking the chat for something new.

**The pattern**

User in Ask Brain:

> "What series would I enjoy?"
> "What's a good book to read next based on what I've liked?"
> "Recommend me a restaurant to try this weekend."
> "What kind of holiday destination would suit me?"

These are **discovery queries** — the answer isn't in the user's brain (by definition, they're asking about things they haven't captured yet). Pure RAG returns nothing useful. This is where web search earns its place.

**Why it's OK here when silent capture enrichment was rejected**

1. **User explicitly asked.** The whole query is a request to go look things up. There's no surprise cost, no silent privacy leak — the user pressed send on "search the web for me".
2. **Results go to chat, not saved to brain.** No pollution of the brain's source-of-truth data. If the recommendation is wrong, nothing has to be un-done.
3. **Low stakes.** A wrong recommendation is "meh, try another", not "my address book got corrupted".
4. **Bounded cost.** One user query = one grounded call. No multiplication per capture.
5. **RAG provides the taste, web provides the catalog.** This is the pattern structured APIs can't replicate alone.

**Flow**

1. **Intent classification.** Cheap LLM call decides: is this a `retrieval` query (answer should come from brain only) or a `discovery` query (answer needs external catalog)? If unsure, default to retrieval and offer a "Search the web for options?" button — user consent, not silent escalation.
2. **Taste profile extraction from the brain.** For a "what series would I enjoy?" query:
   - RAG retrieves all entries tagged/typed around series, movies, books, any media the user has captured opinions on.
   - LLM summarises them into a structured taste profile: `{loved_genres, loved_themes, disliked, favourite_creators, recency_preference, tone: "slow-burn" | "binge" | ..., content_rating}`.
3. **Candidate generation.** Depends on the domain:
   - **Series / movies** → TMDB Discover API, filtered by the taste profile's genres + year range, returns 50 candidates.
   - **Books** → Google Books / OpenLibrary search filtered by genre + rating.
   - **Restaurants nearby** → Google Places Nearby filtered by cuisine + price tier.
   - **Travel** → Gemini grounded search (no single good structured API for holiday destinations).
4. **Ranking.** LLM receives `{taste_profile, candidate_list}` and ranks top 3–5 with a one-line "because you loved X, you'll probably like Y" reason for each.
5. **Respond in chat.** Show ranked recommendations with:
   - Title + short blurb (from the catalog source)
   - The "because you..." reason tied to specific brain entries (clickable, opens the entry)
   - Source attribution chip (TMDB / Google Books / etc.)
   - A "Save to brain" action on each recommendation — one tap adds it as a new entry in the right type, pre-filled from the catalog data.

**Example: "What series would I enjoy?"**

- **Retrieve:** entries typed `movie`/`tv`/`book` plus anything tagged with `watched`, `loved`, `rewatched`.
- **Profile built:** `{loved: ["The Bear", "Severance", "Succession"], themes: ["workplace", "cerebral", "slow-burn", "character-driven"], disliked: ["superhero", "procedurals"], tone: "prestige drama"}`.
- **TMDB Discover call:** `genre=drama, keywords=workplace|psychological, sort=popularity.desc, min_rating=7.5, year≥2022`, 50 results.
- **LLM ranks:** returns top 3.
- **Chat reply:**

  > Based on your love of **The Bear**, **Severance**, and **Succession** — all prestige dramas about high-pressure workplaces with psychologically rich characters — I'd recommend:
  >
  > 1. **Industry** (HBO) — brutal, fast-talking young bankers at a London investment firm. Same workplace-as-warzone energy as The Bear. [Save to brain]
  > 2. **Slow Horses** (Apple TV+) — a failing MI5 unit run by a brilliant slob. Cerebral, slow-burn, character-first — close to Severance tonally. [Save to brain]
  > 3. **Bad Sisters** (Apple TV+) — darkly funny family drama with the same sibling-rivalry texture as Succession. [Save to brain]
  >
  > _Sources: TMDB, grounded on user entries `e_0x42`, `e_0x1c`, `e_0x7e`._

**Scope**

- New intent classifier: `classifyQueryIntent(message, history): "retrieval" | "discovery" | "mixed"`.
- New handler `api/discover.ts` that runs the flow above.
- Candidate sources behind the same `src/lib/enrich/*` modules from v0.2 — reuse the router.
- Chat UI additions: "Save to brain" button on recommendation cards, attribution chips, links back to supporting brain entries.

**Guardrails**

- Discovery mode is **opt-in per query** (user can prompt explicitly) **or** triggered by intent classification with an "OK to search the web?" one-tap confirmation the first few times, then silent once user has confirmed 3× in a session.
- Never triggers on Vault-only brains or when the active brain is community-type.
- Respects the same spend cap from v0.3.
- Gemini grounded fallback only used when no structured catalog matches the domain.

**Why not just do this immediately**

- Needs v0.1 enrichment infrastructure (source modules, cache, router) before v0.6 has anything to call.
- Needs the intent classifier, which is a new moving part.
- Needs UI for "Save to brain" from chat, which doesn't exist yet.
- Ships cleanly after v0.2 once the catalog sources are all wired up.

**Ship position**: after v0.2, before or alongside v0.3. It's the most user-visible payoff of the whole enrichment track and the one that "sells" the feature.

---

## Non-goals

- **No live crawling.** We only call documented APIs + Gemini grounding.
- **No scraping.** If an API doesn't expose a field, we don't have that field. Period.
- **No automatic enrichment of Vault entries, ever.** Hard DB-level check.
- **No enrichment of community-brain entries.** Community entries are curated by humans.
- **No _silent_ chat-time enrichment.** Regular RAG retrieval questions ("what's the wifi password?", "who is my accountant?") must only read the brain — never call the web mid-query without the user knowing. Explicit **discovery queries** ("what series would I enjoy?") are the one exception and are handled by v0.6 below, always with user consent before any external call.

---

## Security & privacy baseline

- **Vault entries never leave the device.** Hard enforced client-side (can't call enrichment) + server-side (API rejects vault entries by ID).
- **Per-brain opt-in.** Defaults to off for every new brain. User explicitly enables per brain.
- **Explicit third-party disclosure.** First-time opt-in modal lists every service that receives entry text. Not buried in a privacy policy — shown in plain language.
- **Attribution everywhere.** Enriched fields always show a source chip. User can always see where a fact came from.
- **Undo everywhere.** Enriched fields are reversible. Stores pre-merge `metadata` in `enrichment_source.raw.previous_metadata`.
- **Spend cap.** Hard monthly cap on API costs. User sees countdown in Settings.
- **Kill switch.** Settings → "Disable all enrichment" wipes enrichment_source, removes the ✨ button, refuses any future calls.

---

## Rejected approach — why not "let the model decide on every capture"

Tempting pattern: every capture goes through Gemini 2.5 Flash Lite with the `google_search` tool enabled, and the model calls search whenever it "feels like it". Evaluated and rejected for these reasons:

1. **Cost explodes.** Grounded calls cost 2–5× a normal call. The model defaults to "when in doubt, search" because the tool exists. Per-capture bill multiplies.
2. **Latency kills capture.** Tool-enabled calls add 1–3 seconds. Capture is a reflex action — the lag makes users stop capturing as freely, which defeats the whole product.
3. **Wrong-entity hallucination.** "Dave's birthday" → model searches "Dave birthday" → returns nonsense about some celebrity. Model cannot disambiguate without context the user hasn't given.
4. **Silent privacy leak.** Every capture gets shipped to Google Search. Users never consented on a per-note basis.
5. **Pollution of the brain.** Wrong enrichment gets saved as fact. RAG queries later return wrong phone numbers. Users blame Everion, not Google.
6. **Attribution burden.** Google's grounding ToS requires citation chips on every result. Silent auto-enrich + mandatory citations = UI contradiction.
7. **No recovery path.** When it's wrong, what do you tell the user? "The model decided to search and got it wrong"? There's no story.
8. **Drift risk.** Model behavior changes across versions. What worked yesterday breaks tomorrow. Silent auto-magic that silently breaks = support nightmare.

**Conclusion:** enrichment is a capability users should **ask for**, not something the app does behind their back. The button-first approach (v0.1) captures 90% of the value with 10% of the risk. Auto-mode (v0.3 / v0.4) only earns its place after the manual version has proven accuracy is high enough per entry type.

---

## Shipping order

1. **v0.1** — manual ✨ button with Places + Wikipedia + Gemini fallback. One sprint. Ship, measure hit rate and user acceptance rate per source.
2. **v0.2** — fill in Books, TMDB, and refine the router. Half a sprint.
3. **v0.6** — discovery queries in chat (RAG + web search fusion). Most user-visible payoff. One sprint. Uses the v0.2 router so depends on it, not on v0.3+.
4. Measure for a month. If users are tapping ✨ frequently and accepting most fields, move to v0.3.
5. **v0.3** — suggest mode with opt-in and spend cap. One sprint.
6. **v0.4** — auto-merge for high-confidence results, but only per-source and only after telemetry shows sub-5% undo rate. Stretch.
7. **v0.5** — batch re-enrichment via Improve Brain. Opportunistic.

Each step is reversible: if v0.3 surfaces accuracy problems, fall back to v0.1 behavior by flipping the settings default. No step bakes in a dependency on the next.
