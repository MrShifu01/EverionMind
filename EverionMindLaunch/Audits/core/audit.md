# Core Pipeline Audit — capture → answer

**Date:** 2026-05-12
**Scope:** complete path from messy user input → entry row → enrichment → storage → retrieval → answer.
**Out of scope:** auth, billing, vault crypto, mobile shell, brand surface. Covered by other audits.
**Method:** code read, no live measurement. Eval harness already validates 18 fixtures (`scripts/retrieval-eval/`).

## Resolution update — 2026-05-12

Fixed during the retrieval audit pass:

- `retrieveEntries` and `retrieveEntriesForUser` now use the ranked
  `search_entries_fts` RPC instead of unordered PostgREST `wfts`
  filters for keyword and tag expansion.
- Short direct-lookup tokens such as `id`, `vat`, and `pin` are
  preserved for retrieval, scoring, and locked Vault-title discovery.
- `/v1/context` now returns `importantMemories`; `/v1/answer` includes
  canonical facts in the answer context.
- MCP `retrieve_memory` now tells clients to prefer `importantMemories`
  for direct fact lookups.
- `/api/memory/retrieve` now returns the full retrieval result instead
  of wrapping it as `{ entries: result }`.
- `/api/search` POST now checks brain access before calling the
  service-role vector RPC.
- Chat no longer sends the current user message twice in the history
  payload.
- Prose facts now enter Tier 1 through the LLM fact-extraction step:
  title-bearing prompt, array-safe parsing, confidence floor, privacy
  skips, `created_by='system_llm'`, and migration 090 for auditability.
- Duplicate canonical facts now refresh system-owned summaries and source
  ids, covering the stale-after-edit failure mode for deterministic and
  LLM facts.
- `retrieveEntriesForUser` now applies concept-graph boost when the top
  three seed hits all belong to one brain, and returns matched concepts
  instead of always `concepts: []`.
- Tag-sibling expansion now lifts tag tokens only from the top three seed
  hits to reduce broad-tag pollution.
- Retrieval calls now write privacy-preserving `audit_log` telemetry
  (`retrieval.query`) for surface, duration, result counts, Tier 1 count,
  graph/tag usage, accessible-brain count, and query/token lengths.

---

## TL;DR

The pipeline is **strong on plumbing, weak on signal flow**.

- Capture, enrichment, storage shape, embedding, idempotency, privacy boundaries — all production-grade. Senior-engineer code throughout.
- Retrieval has the right shape (Tier 1 facts + multi-path hybrid) but **drifts between callers** — chat path differs from v1/MCP path in ways that silently degrade answer quality on the public API surface.
- **The "wow" gap** — what users would notice — is concentrated in five places:
  1. Tier 1 (`important_memories`) only catches **structured metadata fields**. Prose facts ("Sarah's birthday is July 4" written in `content`) are invisible to the fast path. (`api/_lib/factExtraction.ts:60-78`, acknowledged in retrieval-followups P0 #2.)
  2. `/v1/context` **drops** `importantMemories` from the response — external integrations lose Tier 1 entirely. (`api/v1.ts:48-49`)
  3. MCP `retrieve_memory` tool description **omits Tier 1 guidance** — agents don't know to prefer it. (`api/mcp.ts:128-130`)
  4. `retrieveEntriesForUser` (chat path) **skips the concept graph boost** — cross-brain queries get strictly worse ranking. (`api/_lib/retrievalCore.ts:720` onwards, `concepts: []` at line 762.)
  5. **Tokenization inconsistency** between `extractQueryTokens` (length > 3, stop-filtered, capped 6) at `retrievalCore.ts:164-171` and the hybrid-score tokenizer at `retrievalCore.ts:463-466` (length > 2, no stop filter). Stopwords like "the", "for", "and" dilute `titleHit` ratio for long natural-language queries.

**Ship-readiness:** P0s must land before the public launch you're targeting. P1s within the first 30 days. Score below.

### Score (out of 100)

| Dimension | Score | Note |
|---|---|---|
| Capture correctness | 18/20 | idempotency, URL dedup, free-tier graceful, AWAITed enrich, vault-safe |
| Enrichment depth | 14/20 | 6 steps, USER_OWNED guards, date sanity — but prose facts invisible |
| Storage shape | 9/10 | entries + important_memories + concept_graphs + persona — clean separation |
| Retrieval recall | 13/15 | 5 paths, hybrid scoring, but `for_user` variant degraded |
| Retrieval precision | 8/10 | title-weighted score solid, but tokenization + tag-sibling pollution leak noise |
| Answer fidelity | 7/10 | strong CHAT_AGENT prompt — but MCP/v1 prompts thin, no citation contract |
| Telemetry | 1/10 | zero per-tier visibility — flying blind |
| Locale handling | 3/5 | English Porter only, Afrikaans relies on trigram |
| **Total** | **73/100** | shippable to a beta; not yet "impressed at how well it works" |

The headline gaps are fixable in days, not weeks. Most are 30-LOC diffs.

---

## Pipeline map

```
user types/voices/imports messy text
        │
        │  (client-side, useCaptureSheetParse)
        │   - LLM split via PROMPTS.CAPTURE / FILE_SPLIT (call #1)
        │   - VCF / contact pipeline / file extract
        │   - structured payload per entity
        ▼
POST /api/capture                                          api/capture.ts
        │
        ├── idempotency reserve (atomic)                   capture.ts:117-135
        ├── source_url SSRF guard + URL dedup              capture.ts:186-225
        ├── completeness score                             capture.ts:232-240
        ├── INSERT entries                                 capture.ts:252-256
        ├── audit_log fire-forget                          capture.ts:289-301
        ├── enrichInline AWAITED  ◄── server LLM call #2   capture.ts:312-316
        │       ├── stepParse        (USER_OWNED guards)   enrich.ts:218-346
        │       ├── stepInsight      (refusal detect)      enrich.ts:353-380
        │       ├── stepConcepts                           enrich.ts:384-410
        │       ├── stepEmbed        (768-dim, retry)      enrich.ts:488-539
        │       ├── stepPersonaExtract → type='persona'    enrich.ts:561-644
        │       └── stepFactExtract  → important_memories  enrich.ts:663-697
        ├── detectAndStoreMerge fire-forget                capture.ts:323-327
        └── streak update fire-forget                      capture.ts:329
        ▼
entries row + N persona rows + M important_memories rows
        ▼
================ retrieval ================
        ▼
chat:    POST /api/llm?action=chat            api/llm.ts:500-645
mcp:     POST /api/mcp tools/call retrieve_memory  api/mcp.ts:754-757
v1:      POST /v1/context                     api/v1.ts:42-50
        │
        ▼
retrieveEntriesForUser (cross-brain)   |   retrieveEntries (single-brain)
  retrievalCore.ts:576-763             |     retrievalCore.ts:295-536
        │                              │
        ├── Tier 1: important_memories ILIKE (parallel with embed)
        ├── Tier 2a: vector RPC                                  match_count=30
        ├── Tier 2b: FTS websearch_to_tsquery, OR-joined tokens  limit=20
        ├── Tier 2c: title ILIKE on stemmed tokens               limit=20
        ├── Tier 2d: trigram fuzzy on title (per-token fan-out)  limit=5×4
        ├── Tier 2e: tag-sibling FTS expand                      limit=20
        ├── Hybrid score = sim×0.45 + titleHit×0.40 + bodyHit×0.15 + trgSim×0.5
        ├── Graph boost  ◄── retrieveEntries ONLY                retrievalCore.ts:501-525
        └── persona reinforcement (fire-forget)                  retrievalCore.ts:765
        ▼
{ entries[], concepts[], importantMemories[], lockedSecrets[] }
        ▼
chat:    CHAT_AGENT prompt + profilePreamble + learnings → LLM with tools
mcp:     raw JSON via mcpToolResult (32KB cap)
v1:      raw JSON  (importantMemories DROPPED at api/v1.ts:48)
```

---

## What works

These are the parts you should not touch. Quote them in interviews.

1. **Capture atomicity.** Idempotency keys with atomic reserve→insert→finalize close the duplicate-on-retry hole most apps leave open. `capture.ts:117-135` + `_lib/idempotency.ts`.
2. **SSRF guard on source_url.** Rejects non-http(s) schemes before insert. `capture.ts:188-198`.
3. **URL dedup pre-insert.** Indexed point lookup against `entries_user_source_url` unique idx. Survives 50k entries. `capture.ts:200-225`.
4. **Free-tier graceful degradation.** No BYOK + free plan = row persists at `enrichment_state='pending'`; daily cron sweeps later. The note never gets lost. `capture.ts:166-184`.
5. **USER_OWNED_KEYS lock-out on re-parse.** AI cannot overwrite `status` / `scheduled_for` / `due_date` / `deadline` / `event_date` / `recurrence` / `day_of_week` / `day_of_month` after first parse. Fixes the "I edited X and it reverted" class of bug at the root. `enrich.ts:172-181`.
6. **Pairwise date sanity guard.** Drops AI-set dates that violate ordering (`due_date >= scheduled_for`, `deadline >= due_date`, `expiry >= renewal`). Surgical — only blows away AI-supplied values, never user data. `enrich.ts:288-309`.
7. **Persona privacy boundary.** Persona facts always land in the user's personal brain, never the active brain. Shared brains never leak family/identity. `enrich.ts:591-617`.
8. **Profile preamble brain-scoping.** `buildProfilePreamble` strips family/habits/About context when the active brain is not the user's personal brain. Fail-closed on lookup error. `buildProfilePreamble.ts:89-103, 210-236`.
9. **Vault never leaks.** `type='secret'` excluded from concept-graph rebuild (`retrievalCore.ts:830-831`), enrichment fact extraction (`enrich.ts:672-674`), all retrieval paths (`retrievalCore.ts:233`). Locked secrets surface as **title only** via `findLockedSecretTitles` so chat can name them without revealing content. `retrievalCore.ts:140-160`.
10. **Hybrid score with title weighting.** Solves the "staff details" failure mode at the scorer. Title hits dominate vector noise; trgm fuzzy carries irregular verbs. `retrievalCore.ts:446-498`. Eval confirms 18/18.
11. **Persona reinforcement loop.** Retrieved persona facts get `last_referenced_at` bumped + confidence nudged (+0.02, capped at 1). Pinned facts only stamp timestamp. Fire-and-forget. `retrievalCore.ts:765-809`.
12. **Embedding dim enforcement.** `EMBED_DIM=768` checked both providers; mismatch throws loud rather than silently writing a bad vector. `enrich.ts:425, 467-469, 482-484`.
13. **AWAITed enrich on chat/MCP/v1 create.** Avoids Vercel's fire-and-forget-killed-instance bug. `llm.ts:344-348`, `mcp.ts:822-828`, `v1.ts:231-235`, `capture.ts:312-316`.

---

## Findings (prioritised)

### P0 — must ship before public launch

#### P0-1. Tier 1 catches structured metadata only — prose facts invisible

**Evidence:** `api/_lib/factExtraction.ts:60-78` — `FIELD_MAP` has exactly 16 keys (phone, email, id_number, etc.). Function returns `[]` for any entry whose facts live in `content` prose rather than `metadata`.

**Impact:** retrieval-followups doc says ~50% of captured entries have rich prose and empty metadata. Tier 1 misses them. Query "what is Sarah's birthday" returns vector results in 600ms instead of an `important_memories` hit in 50ms with a citable `source_entry_ids`.

**Fix:** ship `stepLLMFactExtract` after the deterministic walker. Single Gemini call per entry, confidence ≥0.85, `created_by='system_llm'` for audit/bulk-remove. Already specced as P0 #2 in `retrieval-followups-2026-05-12.md`. ~80 LOC.

**Risk:** false positives. Mitigate via confidence floor + distinguishing `created_by` marker so user can audit.

#### P0-2. `/v1/context` drops `importantMemories` from response

**Evidence:** `api/v1.ts:48-49`:
```ts
const { entries, concepts } = await retrieveEntries(query, brainId, GEMINI_API_KEY, safeLimit);
return { results: entries, concepts };
```

Destructure intentionally omits `importantMemories`. External API callers (your own personal CLAUDE.md uses this surface via curl) get zero Tier 1. The fast path is invisible outside chat/MCP.

**Impact:** external integrations, the personal-memory MCP wrapper (`em_...` key in CLAUDE.md), and any future API consumer get strictly worse retrieval than the in-app chat.

**Fix:** 3-line change.
```ts
const { entries, concepts, importantMemories } = await retrieveEntries(...);
return { results: entries, concepts, importantMemories };
```

Update doc + `/v1/answer` to fold Tier 1 hits into the context block (see P0-3).

#### P0-3. `/v1/answer` system prompt doesn't use Tier 1

**Evidence:** `api/v1.ts:127-128`:
```ts
const contextBlock = entries.map((e) => `### ${e.title}\n${e.content}`).join("\n\n");
const systemPrompt = `...Answer using ONLY the context below...\n\nContext:\n${contextBlock}`;
```

Only `entries` flow into the prompt. `importantMemories` (the canonical facts the user has curated) are not surfaced. So the model has to reason about prose to find a phone number that `important_memories` already canonicalised.

**Fix:** prepend a `## Known facts` section to the context block populated from `importantMemories.summary` with `source_entry_ids` cited. ~15 LOC.

#### P0-4. MCP `retrieve_memory` tool description omits Tier 1 guidance

**Evidence:** `api/mcp.ts:128-130`:
> "Full semantic retrieval from the user's brain. Uses embedding + vector search + keyword expansion + graph boost to return the most relevant entries with complete metadata."

Compare to chat tool description at `api/llm.ts:120-122` which explicitly tells the model to prefer `importantMemories` for direct fact questions and cite `source_entry_ids`.

**Impact:** every external MCP client (Claude Desktop, Claude Code, ChatGPT, third-party agents) gets the dumber prompt. They will reason over prose and miss the canonical fact layer that you spent two phases building.

**Fix:** copy the chat tool description verbatim into MCP, with the layered-result explanation. ~20 LOC.

#### P0-5. `retrieveEntriesForUser` skips concept-graph boost — chat ranks worse than MCP/v1

**Evidence:** `api/_lib/retrievalCore.ts:720-762`. The single-brain `retrieveEntries` runs the graph boost block (lines 501-525) which lifts neighbours-of-top-3 by 0.05–0.15. The cross-brain `retrieveEntriesForUser` skips this entirely and returns `concepts: []` at line 762. Comment at line 569-575 calls it intentional ("expensive across N brains").

**Impact:** the **primary user surface** — in-app chat across all the user's brains — uses the worse ranker. Single-brain API callers get the better one. Backwards from what you'd expect.

**Fix options:**
- (cheap) Run graph boost on each brain's graph, union results. Per-brain caches already exist.
- (correct) Build a user-scoped composite graph cache, invalidate on entry change, debounce same way (10 min).
- (compromise) Run graph boost only when the top-3 hits all share a brain (`new Set(top3.map(e=>e.brain_id)).size === 1`). Cheap and recovers single-brain-dominant queries.

Either way the comment needs updating — "concept-aware ranking, but the trade-off … is worth it" is unverified. The eval doesn't measure cross-brain quality.

#### P0-6. Tokenization inconsistency between candidate-gen and scorer

**Evidence:**
- `extractQueryTokens` (`retrievalCore.ts:164-171`) — used for FTS keyword pass, ILIKE title path, trgm path. Length > 3, STOP-filtered, slice(0, 6).
- Hybrid-score tokenizer (`retrievalCore.ts:463-466` and `:723-726`): `query.toLowerCase().split(/\s+/).filter(t => t.length > 2)`. **No stopword filter. No length cap. Different floor.**

So a query like `"the rent for the shop in May"` candidates with `["rent", "shop"]` (length>3, STOP-filtered), but the scorer counts `titleHit` against `["the", "rent", "for", "the", "shop", "may"]`. Title `"Shop Rent"` matches 2/6 = 0.33 instead of 2/2 = 1.0.

**Impact:** natural-language queries (the kind users actually type) get diluted `titleHit` ratios and lose to short keyword queries. The scorer rewards keyword-style input — exactly the opposite of "users are impressed".

**Fix:** share the tokenizer. ~10 LOC.

#### P0-7. Tag-sibling expansion pollutes the FTS round

**Evidence:** `retrievalCore.ts:418-444` and `:691-718`. The tag-sibling block lifts tag tokens from `entries.slice(0, 5)` and FTSes them OR-joined.

If the top-5 hits include a single weakly-relevant entry with an off-topic tag (`["personal", "test", "draft"]`), those tokens enter the FTS — pulling in dozens of unrelated entries with low scores that still consume the 40-entry pre-slice budget at `retrievalCore.ts:498`.

**Impact:** measurable on noisy brains (>500 entries). Not on Christian's clean 275-entry test set — the eval misses it.

**Fix:**
- Take tags from `entries.slice(0, 3)` not top-5, AND only entries with `_score > 0.5` so weak hits don't contribute.
- Or: skip the tag-sibling block when the top-3 already have `titleHit >= 0.5` (the answer is clearly nearby; siblings just add noise).

~15 LOC. Add fixtures: queries with a noisy top-5 to lock the behaviour.

#### P0-8. No retrieval telemetry — flying blind into launch

**Evidence:** retrieval-followups P1 #7 acknowledges this. Currently zero visibility into:
- which tier did the work (Tier 1 ILIKE? vector? trgm? title-ILIKE?)
- whether Tier 1 fires at all in production for real-user queries (we know it does in the eval)
- p50/p95 retrieval latency
- final-answer citation rate (does the LLM actually cite `source_entry_ids` from `importantMemories`?)

**Impact:** when a beta user reports "it didn't find X", you have no data. You'll guess.

**Fix:** ship one PostHog event per retrieve call:
```ts
{ tier_1_hits, vector_top_score, fts_count, trgm_count, title_ilike_count,
  tag_sibling_count, total_ms, final_returned, query_len_chars }
```
Mirror in MCP and v1. Dashboard before launch. ~30 LOC + a PostHog board.

Plus: an `audit_log` row per chat turn capturing which tool was called and how many entries it returned. Already partially there in `auditToolCalls` (`llm.ts:476-498`) — extend the metadata.

#### P0-9. CLIENT-side capture LLM call duplicates server enrichment LLM call

**Evidence:**
- Client: `src/hooks/useCaptureSheetParse.ts:282-283` — `callAI` with `PROMPTS.CAPTURE` (~identical to `SERVER_PROMPTS.CAPTURE`). Splits/structures the user input client-side.
- Server: `enrich.ts:218-346` — `stepParse` calls `SERVER_PROMPTS.CAPTURE` again on the same content, AWAITed inside `enrichInline`.

So every capture pays 2× the LLM cost on first save (~$0.002 per capture × 2 with Gemini Flash; not catastrophic, but cumulative — and adds 1–3s of latency).

**Impact:** the user experiences a perceptible 2–4s delay between "I tapped save" and "the entry shows up enriched". Doubles your AI bill on free-tier captures (gemini managed key).

**Fix options:**
- **(best)** Trust the client parse on `created_at` ≤ 5min entries — skip `stepParse` on first enrich when `meta.client_parsed_at` is recent and matches the user agent. Re-run only on re-enrichment (cron, settings → Run Now).
- **(easiest)** Move parsing entirely to the server. Client sends raw text; server splits + structures. Removes a client-side `callAI` round-trip but adds latency to the first save round-trip. Net wash on UX, big win on cost.
- **(compromise)** Send `client_parsed_at: <iso>` from client → server sees it within 5 min → stamps `enrichment.parsed=true` immediately and skips `stepParse`. The 3 other steps (insight, concepts, embed, persona, fact) still run.

Pick one. Track LLM cost per capture as a metric to verify the win.

### P1 — first 30 days post-launch

#### P1-1. Persona reinforcement is per-entry sequential

**Evidence:** `retrievalCore.ts:765-809`. `reinforcePersonaFacts` runs `Promise.all` over persona ids, but each iteration is `fetch → JSON → PATCH` sequentially per id. For 5 persona hits, that's 10 round-trips before the promise resolves. Fire-and-forget masks the latency to the user but burns DB connections.

**Fix:** batch fetch metadata for all ids in one PostgREST call; build patches client-side; batch PATCH via PostgREST OR clauses. ~25 LOC.

#### P1-2. Persona dedup cosine threshold is global, not bucket-aware

**Evidence:** `enrich.ts:559` — `FACT_DEDUP_COSINE = 0.85` for all extracted persona facts.

Identity facts ("User's name is X") should dedup tightly (0.92+) because near-paraphrases ARE duplicates. Habit facts ("User wakes at 5:30" vs "User wakes at 6:00") need a looser threshold because the numeric is the whole content — 0.85 might collapse them.

**Impact:** observed in retrieval-followups commentary. Habit facts get falsely merged; identity facts get duplicated.

**Fix:** per-bucket threshold map.
```ts
const DEDUP_THRESHOLDS = { identity: 0.92, habit: 0.80, family: 0.88, ... };
```
~20 LOC. Add fixtures.

#### P1-3. Entity alias table — "dad" ≠ "Henk" without persona

**Evidence:** retrieval-followups P1 #5. Not built. Currently leans on vector overlap + persona block role-words list.

**Fix:** specced already. Migration + UI + Tier 1 expansion. ~150 LOC.

#### P1-4. Sentence-level fact freshness — Tier 1 stale after edit

**Evidence:** retrieval-followups P1 #6. `upsertCanonicalFact` returns on 409 without updating (`enrich.ts:724`). Edits don't propagate to `important_memories`.

**Fix:** on 409, PATCH summary if differs + append `entry.id` to `source_entry_ids`. ~30 LOC. Add eval fixture: edit phone, retrieve, expect new value.

#### P1-5. Concept graph rebuild reads top-100 only, no diversity

**Evidence:** `retrievalCore.ts:830-834` — pulls 100 entries by `created_at DESC`. Brand-new captures dominate; older landmarks fall off.

**Impact:** the concept graph forgets the user's most important early notes (their persona, business intro, deeply-tagged anchors).

**Fix:** sample 50 most-recent + 50 most-referenced (`metadata->>last_referenced_at` or simple `evidence_count`). Diversity-weighted sample. ~20 LOC.

#### P1-6. `runtime` provider field hardcoded English-only

**Evidence:** FTS uses `wfts(english)` everywhere. `stemSimple` is English Porter. The Afrikaans / multi-language fallback is `pg_trgm` only.

**Impact:** users with Afrikaans / Spanish / Portuguese names rely entirely on trigram for stemming. "Skuif" / "Skuiwe" both stem-correctly under Porter only by accident (no inflection). South-African user data already exercises this — the eval has "Kobus", "Adriaan" (proper nouns, fine) but not Afrikaans verbs.

**Fix:**
- Add `simple` config FTS as a fallback union when the language detector flags non-English (~40 LOC).
- Or: store a `language` column on `entries` set at capture time, route to the right `wfts(<lang>)` per row at query time. More work, more correct.

Defer to P1 — eval doesn't show user-visible regression yet.

#### P1-7. Add 20-30 eval fixtures for failure modes not yet seen

**Evidence:** retrieval-followups P1 #4. Eval currently covers 18 Christian-specific queries. Public users will hit modes you haven't anticipated.

**Fix:** ongoing. Every "I asked X and didn't get Y" beta report → new fixture, locked in regression.

Plus add: temporal queries ("last week"), aggregations ("how many staff"), relationship queries ("X's manager"), negative queries ("who is NOT a supplier"), spelling-error queries ("Bidfods" → "Bidfoods").

### P2 — opportunistic

#### P2-1. Compress hybrid score into named-path Hit[] with reasons

**Evidence:** retrieval-followups P2 #8. Currently `_score` is opaque. Citations can't say "found because title matched + tag overlap".

**Fix:** refactor each tier into `(query) => Hit[]` where `Hit = { entry_id, score, reasons: string[] }`. Merge sums scores. LLM citation gets richer. ~300 LOC refactor.

Defer until users start asking "why".

#### P2-2. Caching layer for repeated queries within a session

**Evidence:** retrieval-followups P2 #9. `/api/search` has 5-min cache; `/api/llm` doesn't. Chat queries are mostly one-shot.

**Defer.** Hit rate <10% pre-launch.

#### P2-3. Content-window the entries fed to LLM

**Evidence:** `api/llm.ts:280-289` and similar — `get_entry` returns full content (up to 200KB per entry). Tool result then goes through `mcpToolResult` 32KB cap on MCP but not on internal chat.

**Impact:** a few large entries can blow chat context. The model truncates badly; subtle quality loss.

**Fix:** cap entry content at ~4KB per result, surface a `truncated` marker, instruct model to call `get_entry` for the full body if needed. ~20 LOC.

#### P2-4. `lockedSecrets` only scopes to active brain in cross-brain chat

**Evidence:** `api/llm.ts:261` — `findLockedSecretTitles(args.query, brainId, 5)` passes the active `brainId`. But `retrieveEntriesForUser` runs cross-brain. A vault entry in a shared brain the user belongs to but isn't focused on never surfaces.

**Impact:** edge case. Most vault entries live in the personal brain. Will become real when shared-brain vault-grants ship in volume.

**Fix:** call `findLockedSecretTitles` per accessible brain or expand the function to accept a brain list. ~20 LOC.

#### P2-5. Tier 1 + Tier 2 dedup

**Evidence:** if a query hits both `important_memories` for "Landon Phone" AND surfaces the source entry "Landon Harris Klopper — Staff Details", the LLM sees both. Not wrong, but wastes context.

**Fix:** dedup by `source_entry_ids` overlap before returning. Append a `tier_1_covers: true` flag on entries that have a fact citing them. ~15 LOC.

### P3 — nice to have

- **No recency re-rank.** A 2023 phone number tied with a 2026 one sorts by score alone. Add `recencyBoost = exp(-age_days/365) * 0.05` to scorer.
- **No type-prior.** Querying "rent" matches a `note` and a `reminder` equally; the reminder is almost always what the user wants. Per-type score nudge based on intent classifier.
- **No "I didn't find that"-aware feedback loop.** Chat's `[NO_INFO:topic]` tag in `prompts.ts:107` is detected but no logging/dashboard. Surface it as a metric — high `NO_INFO` rate per category = an unmet retrieval mode.
- **stemSimple is hand-rolled.** Replace with `natural` lib's PorterStemmer (already pulls in <50KB). One-LOC switch. Removes the "ings"/"ying"/"ied" ordering hazard at `retrievalCore.ts:187`.
- **Concept graph is per-brain, never cross-brain.** "Suppliers" and "Staff" are concepts that span brains for users with personal + business brains. P3 because data sparsity is the real bottleneck pre-launch.

---

## Per-stage deep dives

### Stage 1 — Capture (raw input → entry row)

**Entry points (client):**
| File | Purpose |
|---|---|
| `src/hooks/useCaptureSheetParse.ts:201,317,462,683` | text/voice capture, client-side LLM split |
| `src/hooks/useBackgroundCapture.ts:219,324,371` | offline queue → background sync |
| `src/components/OnboardingModal.tsx:81` | first-run capture |
| `src/components/MemoryImportPanel.tsx:63` | bulk import |
| `src/hooks/useOfflineSync.ts:104,141` | offline replay |

**Server entry point:** `api/capture.ts:36-44` (POST /api/capture).

**Properties verified:**
- POST-only, default rate 30/min (`capture.ts:29-33`).
- `bodyParser.sizeLimit: 10mb` (`capture.ts:23`).
- Title required + trimmed + 500-char cap; content optional + 200KB cap; type lowercased + 50-char cap; tags filtered to strings + 50 cap; brain-access enforced via `requireBrainAccess`.
- Extra-brain-ids capped at 5, UUID-regex-validated.
- Idempotency-Key header → atomic reserve via `_lib/idempotency.ts`. Replay returns the prior id with `idempotent_replay: true`; in-flight returns 409.
- Source-URL deduplication: scheme guard + indexed point-query on `entries_user_source_url` unique index. Duplicate → appends URL to `metadata.sources[]` and returns 200 `{ merged: true }`.
- Metadata size capped at 64KB (`capture.ts:228-230`).
- Completeness score auto-computed and merged into metadata.
- 409 race on URL unique-index handled — looks up by the actual source_url, not by user_id alone (which would return a random entry — comment at `capture.ts:258-260` shows you've been bitten by this before).
- `audit_log` insert is fire-and-forget but errors logged. `_lib/auditLog.ts` is the consolidated writer.
- `enrichInline` AWAITED end-to-end. Vercel `maxDuration: 30` on `api/capture.ts` covers the budget.
- `detectAndStoreMerge` and `updateStreak` fire-and-forget AFTER enrich — won't block the user response.
- Free + no BYOK: enrichment skipped, `enrichment_state='pending'` is the column default, daily cron's `claim_pending_enrichments` RPC catches up later.

**Issues found here:** P0-9 (double LLM parse).

### Stage 2 — Enrichment (entry row → fully-fleshed signal)

**Entry point:** `api/_lib/enrich.ts:enrichInline(entryId, userId)`.

**Six steps:**
1. **stepParse** (`enrich.ts:218-346`)
   - Reads `buildEnrichText` union of title + content + metadata.full_text + metadata.attachment_text. Capped at 10K chars.
   - Anchors relative dates to `entry.created_at` (capture day), not query day. Prevents re-parses from drifting.
   - First parse can fill user-owned date keys (scheduled_for, due_date, deadline, event_date) if empty. Re-parses cannot.
   - For non-user-owned keys: AI fills MISSING only — never overwrites a user-set value.
   - Pairwise date sanity guard drops AI-set dates that violate ordering.
   - Gmail-source entries get `ai_summary` if LLM produced ≥40 chars of summary content — the card prefers `ai_summary` over `content` for `source=gmail`.
   - Fallback: if entry has a title and LLM returns garbage, stamps `parsed=true` anyway so the entry doesn't sit pending forever.
2. **stepInsight** (`enrich.ts:353-380`)
   - Reads same superset, capped at 4K chars (insight outputs ~300 tokens — no point in heavy input).
   - Refusal detector via `REFUSAL_RE`: `/^I (cannot|can't|am unable|don't have)|(\bwithout$|\bmore context$|\binsufficient)/i`. If insight looks like a refusal, marks `has_insight=true` but doesn't store the refusal.
3. **stepConcepts** (`enrich.ts:384-410`)
   - Same enrich body, 4K cap. ENTRY_CONCEPTS schema enforces label rules (max 3 words, no possessives, no proper nouns).
   - Tolerant: even unparseable LLM output stamps `concepts_extracted=true` so we don't loop.
4. **stepEmbed** (`enrich.ts:488-539`)
   - 768-dim vector (column type).
   - Retry on 429/503 with delays `[500, 1500, 3500]`.
   - PATCH failure throws loud — was silently swallowed before; comment at line 517-522 calls out the bug.
   - On failure: row marked `embedding_status='failed'`. If THIS PATCH also fails, logs loudly because the row sits pending forever.
5. **stepPersonaExtract** (`enrich.ts:561-644`)
   - Skips `type='persona'`, `type='list'`, and `meta.skip_persona === true`.
   - Persona facts always land in personal brain (resolved via `getPersonalBrainId`).
   - Dedup via title fast-path + cosine ≥0.85 against existing facts (active + fading + archived + rejected — covers all dedup classes).
   - In-memory batch dedup: shared set references mutated as facts are inserted, so same-batch repeats get caught.
6. **stepFactExtract** (`enrich.ts:663-697`)
   - Deterministic walk of 16 metadata fields → `important_memories` rows.
   - Vault entries skipped.
   - Idempotent: stable `memory_key` slug = title + kind. 409 = already exists, leave alone.

**Issues:** P0-1 (prose facts invisible), P1-2 (global cosine threshold), P1-4 (Tier 1 stale after edit).

**Subtle correctness wins:**
- Re-running enrichInline on an edited entry: only steps not yet flagged in `metadata.enrichment` re-execute. So `stepConcepts` won't re-run if `concepts_extracted=true`. Edits don't force a full re-enrich. Could be a bug or a feature — currently a feature (avoids wasted LLM calls) but means an edit doesn't refresh insights/concepts. Flag this for product to decide.
- `metadata.skip_persona === true` short-circuit at `enrich.ts:583-586` — strips the flag from the returned meta so it doesn't persist forever. Clean.

### Stage 3 — Storage shape

| Table | Role | Privacy |
|---|---|---|
| `entries` | one row per atomic memory; 768-dim vector; tsvector; full metadata JSONB | RLS by user_id and brain access |
| `entries` where `type='persona'` | extracted identity facts; brain_id always = personal brain | RLS as above |
| `entries` where `type='secret'` | vault entries — content client-encrypted; excluded from retrieval | RLS + extra exclusion |
| `important_memories` | canonical facts; unique active key (brain_id, memory_key); `source_entry_ids[]` cite back | RLS |
| `concept_graphs` | one row per brain; `graph` JSONB = `{concepts[], relationships[]}`; `updated_at` for 10-min debounce | RLS |
| `user_personas` | singular fields (full_name, pronouns, family[], habits[], context); `enabled` master switch | RLS |
| `concept_graphs` | per-brain | RLS |
| `entry_shares` | `entries` shared across brains via migration 070 | RLS |
| `audit_log` | append-only audit trail; migration 057 | service-role insert; user RLS read |

**Shape is clean.** Single source of truth per concern. Vault encryption boundary is structural (column-level + type-based exclusion), not advisory. Migration 062 enforces important_memories uniqueness at the DB. Migration 088 added `search_entries_fts` RPC (per the followups doc — not yet wired in code, P0 #1 there, which is consistent with what I see).

**Minor:** no global "fact" table that joins persona + important_memories. Persona facts live as `entries` rows with `type='persona'`; canonical facts live in `important_memories`. The asymmetry has cost (Tier 1 ILIKE only hits the latter; persona facts surface only through vector / FTS on the entries table). Could be a P2 fix: write persona facts to `important_memories` too with `memory_type='preference'` so Tier 1 catches them. ~30 LOC + dedup logic.

### Stage 4 — Retrieval (query → ranked entries + facts)

Already mapped in the pipeline diagram. Three callers, two retrieval functions:
- `retrieveEntries(query, brainId, ...)` — single brain. Used by `/v1/context`, `/api/memory/retrieve`, `/api/mcp` retrieve_memory.
- `retrieveEntriesForUser(query, userId, ...)` — cross-brain. Used by `/api/llm` chat.

**Issues:** P0-2 (v1 drops importantMemories), P0-4 (MCP description), P0-5 (cross-brain drops graph), P0-6 (tokenization split), P0-7 (tag pollution), P2-1 (named paths).

**What's missing from the eval:**
- Cross-brain queries (only single-brain tested).
- Concept-graph influence (eval doesn't check the boost actually fires).
- Tier 1 hit rate metric (eval checks correctness, not which tier).
- Latency budget (eval doesn't fail on slow queries).

Add these as eval modes: `--mode=cross-brain`, `--with-graph`, `--latency-budget-ms=800`.

### Stage 5 — Answer composition

Three answer surfaces:

**Chat (`/api/llm?action=chat`)** — the rich one.
- System prompt: `CHAT_AGENT` (~3.5KB) + profilePreamble (~4.5KB cap) + learningsBlock (~4KB cap). With prompt caching the second turn onwards is cheap.
- CHAT_AGENT explicitly trains the model on: search query construction (strip wrappers), shorthand expansion, persistence (3 distinct searches before "not found"), voice-transcription tolerance, vault-lock behaviour, persona tool semantics, destructive-action confirmation.
- 8 tools: retrieve_memory, get_upcoming, get_entry, search_entries, create_entry, update_entry, delete_entry, merge_entries, plus persona tools.
- History capped at 20 messages.
- AWAITed enrichment on create/update.

**MCP (`/api/mcp`)** — the external agent surface.
- 9 tools: same set plus list_brains. Tool descriptions are thin — see P0-4.
- 32KB tool-result cap.
- API-key auth with 24h signed mcp_ token rotation; DB-backed revocation check.
- Idempotency on create_entry. Per-tool rate limits (create 10/min, merge 5/min).

**v1 (`/v1/*`)** — the external API.
- `/v1/context` — retrieval only, drops importantMemories (P0-2).
- `/v1/answer` — BYOK provider + retrieval. System prompt minimal. No Tier 1 (P0-3).
- `/v1/ingest`, `/v1/update`, `/v1/delete`, `/v1/merge` — straightforward CRUD.

**Issues:** P0-2, P0-3, P0-4, P2-3 (content windowing), P2-4 (lockedSecrets cross-brain).

**Strong points of CHAT_AGENT:**
- Data-ownership clause at the top forbids refusal/redaction of user's own data. Necessary because frontier models default to redacting ID numbers / phone numbers / addresses.
- Voice-transcription clause is real-world tuned ("Kobus" → "Qubus", etc.) — direct evidence of beta feedback baked in.
- Vault-lock clause prevents the model from claiming "not found" when `lockedSecrets` is non-empty. Critical for trust.
- `[NO_INFO:topic]` tag at the end of factual lookups is a great hook for a "missing memory" feedback loop (P3).

---

## Cross-cutting

### Telemetry — the biggest single gap

Zero in-flight telemetry on retrieval. You don't know:
- Tier 1 hit rate (the whole canonical-fact layer)
- p95 retrieval latency
- which tier surfaces the final-answer citation
- false-negative rate (`[NO_INFO:topic]` frequency vs. ground truth)
- per-user "wow vs miss" ratio

You have basic chat tool-call audit (`auditToolCalls` at `llm.ts:476-498`) and the `audit_log` table. Extend, don't replace. See P0-8.

### Eval coverage

Eval at `scripts/retrieval-eval/` has 18 fixtures, exits non-zero on regression. Strong foundation.

**Gaps:**
- Christian-only data — no random-user synthetic fixtures.
- Single-brain only — `retrieveEntriesForUser` (chat path) untested.
- No tag-pollution fixture (P0-7 hides from the eval).
- No latency budget — slow queries don't fail.
- No prose-fact fixture (P0-1) — facts in `content`, not `metadata`.
- No voice-transcription fixture (proper-name misheard variants).
- No spelling-error fixture (irregular plurals, common typos).

### Locale

English Porter stemming + `english` FTS config + `pg_trgm` for the rest. Afrikaans / mixed-language users rely on trigram alone. Acceptable for v1, real gap at v2 (P1-6).

### Cost (rough math)

Per capture, server side:
- 1 `stepParse` call — ~2K input tokens, ~500 output → ~$0.001 (Gemini Flash)
- 1 `stepInsight` call — ~1K in, ~300 out → ~$0.0005
- 1 `stepConcepts` call — ~1K in, ~400 out → ~$0.0005
- 1 embed call — flat ~$0.00003
- 1 `stepPersonaExtract` call — ~1K in, ~300 out → ~$0.0005, only if not a persona/list entry
- 0–N persona-fact embed calls (each ~$0.00003)
- 0 LLM call for `stepFactExtract` (deterministic)

Per capture total: **~$0.003** server-side. Client also pays ~$0.001 for the split. So ~$0.004 / capture for the managed-AI path.

At 10K beta users × 30 captures/month = 300K captures = ~$1,200/month. Bearable. P0-9 (dedup client/server parse) cuts ~$300/month.

Per chat turn: retrieval embed (~$0.00003) + Gemini chat with cached system prompt (~$0.002) → ~$0.003/turn.

---

## What I did NOT verify (be honest)

- **Live latency.** No measurement against real DB. All claims are static-analysis based.
- **Embedding model parity.** Both `gemini-embedding-001` and OpenAI's `text-embedding-3-large` truncated to 768 — but cosine between them is not necessarily compatible. If users mix providers (BYOK), one user's old vectors don't compare to their new ones. Worth a fixture.
- **Concept-graph rebuild cost.** Daily-ish rebuild on captures > 3. At 300K captures/month across 10K users that's a lot of LLM calls in `rebuildConceptGraph`. Need a usage cap.
- **The mobile capture UX itself.** Did not audit `MobileHome.tsx` / `CaptureWelcomeScreen.tsx` flow. Stop-the-world UX bugs in voice/orb/list could undermine all of the above silently.
- **Hourly cron behaviour.** Trust the doc — but did not read `api/user-data?resource=cron-hourly`. Bears a final-pass audit before launch.
- **/api/search caching.** Mentioned in retrieval-followups; did not read implementation.

---

## What to fix first (proposed order)

Pre-launch sprint (1–2 days):
1. **P0-2** — return `importantMemories` from `/v1/context`. 5 LOC. Ship now.
2. **P0-3** — surface Tier 1 in `/v1/answer` prompt. 15 LOC.
3. **P0-4** — copy chat tool description into MCP. 20 LOC.
4. **P0-6** — share tokenizer between candidate-gen and scorer. 10 LOC.
5. **P0-8** — telemetry events on every retrieve. 30 LOC + dashboard.
6. **P0-7** — tag-sibling pollution guard. 15 LOC + fixtures.

Pre-launch sprint (3–5 days):
7. **P0-1** — LLM-driven fact extraction from prose. 80 LOC + prompt + backfill.
8. **P0-5** — graph boost on `retrieveEntriesForUser` (probably the same-brain-top-3 compromise). 40 LOC.
9. **P0-9** — collapse client + server parse passes. 30 LOC + UX validation.

First 30 days:
10. P1-1 batched persona reinforcement
11. P1-2 per-bucket cosine thresholds
12. P1-4 Tier 1 freshness on edit
13. P1-7 expand eval fixtures continuously from beta feedback

---

## Bottom line

This pipeline is closer to "impressive" than the score suggests. The bones are right: layered retrieval, canonical fact extraction, persona-as-first-class-citizen, vault privacy as a structural boundary, idempotent capture, careful AI-vs-user-owned key separation.

The headline wins are nine concrete diffs above. Ship the six pre-launch P0s and the system jumps from "good RAG with quirks" to "users say wow." None require a redesign. All have file:line evidence and a clear fix.

The single highest-leverage one is **P0-8 telemetry**. Without it, every other claim in this audit is unverifiable in production. With it, every regression and every win is measurable, and the eval harness grows from 18 fixtures to whatever your beta users surface — bug-driven coverage on rails.

— audit-2026-05-12
