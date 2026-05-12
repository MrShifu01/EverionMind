# Retrieval follow-ups

Outstanding work after the 2026-05-12 retrieval audit. The audit shipped
the eval harness, auto-fact extraction → important_memories, stemming,
ILIKE/trgm fuzzy title paths, and a title-weighted hybrid score. Eval
went from 13/14 to 18/18.

Recorded here so the work isn't lost to chat history. Each item ranks
by user-visible impact + launch criticality. Pick up in priority order.

## P0 — should ship before public launch

### 1. Swap `wfts` PostgREST call → `search_entries_fts` RPC

**What:** Migration 088 (`search_entries_fts` RPC) is applied to prod but
not yet called from `retrievalCore.ts`. The RPC uses `ts_rank_cd` over
the existing search_tsv (title=A, content=B, tags=C weights), which
naturally ranks title matches above content matches. Switching the FTS
pass to use the RPC removes the "unordered LIMIT cut drops good
candidates" failure mode at the source.

**Why it matters:** Currently the FTS pass is rescued by the title-ILIKE
and trgm paths sitting next to it. That works but is structurally weak —
every new failure mode means another rescue path. The ts_rank RPC fixes
the root cause and lets us simplify the parallel paths.

**Scope:** ~30 LOC in retrievalCore.ts. Replace the
`fetch(...wfts(english).query)` block in both retrieveEntries and
retrieveEntriesForUser with `fetch('/rpc/search_entries_fts')`.
Drop the LIMIT 20 to LIMIT 30 since results are now meaningfully
ordered.

**Risk:** All 18 fixtures must still pass. If they do, ship and pull
back the title-ILIKE rescue path (Phase 4 cleanup).

### 2. LLM-driven fact extraction from prose

**What:** Phase 2A's auto-fact extraction is deterministic — it only
walks structured metadata fields (`phone`, `id_number`, etc.). Misses
facts written in prose like "Sarah's birthday is July 4" with no
`birthday` metadata field.

**Why it matters:** ~50% of user-captured entries don't have parsed
metadata fields populated. They have rich prose in `content`. Those
facts are invisible to the Tier 1 fast path today.

**Scope:** New `stepLLMFactExtract` in `api/_lib/enrich.ts` running
after the deterministic walker. Single Gemini call per entry, prompt
asks for atomic factual statements with high confidence. Writes to
important_memories same path as Phase 2A.

Prompt design: confidence ≥0.85, no inference, extract dates / IDs /
amounts / relationships / decisions only. Skip opinions, plans,
emotional content.

**Risk:** False positives pollute the canonical-fact layer. Mitigate via
the confidence floor, plus a `created_by='system_llm'` marker (different
from `system` deterministic) so users can audit + bulk-remove if needed.

### 3. Backfill LLM fact extraction over existing 275 entries

**What:** Once #2 ships, run the LLM extraction over all existing
entries. Gemini cost: ~275 calls × ~$0.002 = ~$0.55. Negligible.

**Scope:** Extend `scripts/backfill-canonical-facts.ts` with a `--llm`
flag that adds the LLM pass after the deterministic pass.

## P1 — ship in first 30 days post-launch

### 4. Add 20-30 more eval fixtures

**What:** The current 18 fixtures cover Christian's data. Need fixtures
for failure modes that haven't been reported yet — synonym aliases,
temporal queries ("last week"), aggregations ("how many X"),
relationship queries ("X's manager").

**Why it matters:** The eval is only as good as its fixture set. Real
users will hit failure modes we haven't anticipated. Every reported
miss → new fixture.

**Scope:** Ongoing. Capture every "I asked X and didn't get Y" report
as a fixture immediately.

### 5. Entity alias table

**What:** Users use multiple words for the same entity. "Dad", "father",
"Henk", "Adriaan", "old man" all refer to the same person. Currently
relies on persona facts being phrased multiple ways + vector embedding
overlap.

**Scope:** New `entity_aliases` table: `(canonical_name, alias,
user_id)`. Migration + small UI for users to confirm aliases on capture
("you mentioned 'dad' — link to Adriaan Hendrik Stander?"). Tier 1
expansion: queries with an alias also search the canonical.

**Why P1, not P0:** vector + trgm cover ~80% of alias cases already.
The remaining 20% are noticeable but not launch-blocking.

### 6. Sentence-level fact freshness

**What:** When an entry gets edited (phone number changes, address
updates), the auto-extracted important_memory still points at the old
value. Current Phase 2A returns 409 on the unique-key collision and
leaves the row alone.

**Scope:** On 409, fetch the existing row → PATCH summary if it differs
+ append entry.id to source_entry_ids. Plus an enrichment-state flag
that re-runs fact extraction when the entry is edited.

**Risk:** Race conditions on concurrent edits. Use IF MATCH on
updated_at or just last-write-wins (probably fine).

### 7. Per-tier latency telemetry

**What:** No visibility into which retrieval tier is doing the work for
a given query. Hard to tune weights without numbers.

**Scope:** One PostHog event per retrieve_memory call:
`{ tier_1_hits, vector_top_score, fts_count, trgm_count, total_ms,
final_returned }`. Read from a dashboard to spot whether Tier 1 is
firing (it should be, on direct-fact queries) and whether vector is
contributing (or whether we could shrink it).

## P2 — opportunistic

### 8. Compress hybrid score into named-path system with reasons

**What:** Originally part of Phase 3's "multi-path with confidence
merging." Each path attaches a `reason` ("title-exact", "tag-match",
"vector", "trgm", "fact") to its hits. LLM tool result includes the
reason. Citations become richer ("found in `Landon - Staff Details`
because title contained 'Landon' AND tag matched 'staff'").

**Scope:** Substantial refactor of retrievalCore (~300 LOC). Each
existing block becomes a named function returning `Hit[]` with
`{ entry_id, score, reasons[] }`. Merge layer dedupes by entry_id, sums
scores, concatenates reasons.

**Why P2:** Doesn't change the 18/18 result. Helps debuggability and
LLM citation quality. Real value once users start asking "why did you
return this?" — pre-launch I doubt they will.

### 9. Caching layer for repeated queries

**What:** Same query within a session → cache the retrieval result.
Currently `/api/search` has a 5-min in-memory cache. `/api/llm` (Ask)
doesn't.

**Scope:** Wrap `retrieveEntriesForUser` in a per-user Map<queryHash,
result>. TTL 60s. Skip cache when the user has just captured (mutates
the brain).

**Why P2:** chat queries are mostly one-shot per session. Hit rate would
be <10%. Save it for when telemetry shows the need.

## Done

- Eval harness with 18 fixtures, exit 1 on failure
- Auto-fact extraction (deterministic) + 148-row backfill
- Title-weighted hybrid score (sim 45 / title 40 / body 15 / trgm 50)
- pg_trgm fuzzy title path with word_similarity (irregular verbs)
- Stemming in client-side scoring
- Tier 1 important_memories lookup
- Search_tsv FTS column + GIN index
- FTS keyword pass with OR-joined tokens

## How to use this file

Move items to `Audits/archive/` once shipped. Add new follow-ups
to the bottom of the appropriate priority section as they surface.
