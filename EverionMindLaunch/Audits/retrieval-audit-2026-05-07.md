# Retrieval Audit — 2026-05-07

> Scope: `api/_lib/retrievalCore.ts`, `api/search.ts`, `api/_lib/generateEmbedding.ts`. Maps every retrieval mode (vector-only, hybrid, keyword expand, tag sibling expand, graph boost), the underlying RPCs (`match_entries`, `match_entries_for_user`, `build_similarity_graph`), HNSW index usage, secret + deleted-entry exclusion, brain-scope enforcement, embedding provider behaviour. Out of scope: chat layer (future chat-view-audit), enrichment (covered in `archive/enrichment-audit.md`), HNSW build params (defer to `vector-index-audit` 2026-06-14). Live `EXPLAIN ANALYZE` blocked — Supabase MCP not authenticated this session; captured under Limitations and replaced with code+migration evidence.

## Verdict

**Architecture is sound. Enforcement at the SQL layer is the right call.** `match_entries` (migration 049) and `match_entries_for_user` (migration 071) bake `deleted_at IS NULL` and `type IS DISTINCT FROM 'secret'` into the function bodies — not the calling code. HNSW index live since migration 074. Cosine similarity via pgvector `<=>`. Brain scope is SQL-resolved for both single-brain and cross-brain paths. Secret-leak surface (`findLockedSecretTitles`) is title-only by design.

**Eight findings. Zero critical, three high, three medium, two low.** Top three: F1 — no embedding cache; every chat turn re-embeds the same query (cost + latency); F2 — `retrieveEntries` runs four PostgREST round-trips per call (vector + keyword + tag + metadata hydrate) instead of one RPC, dragging p95 latency; F3 — keyword/tag passes use `ilike` over unindexed `title`/`content`, full sequential scan once `entries` grows past a few thousand rows.

Pre-launch: ship the embedding LRU (F1, ~30 min), collapse the metadata-hydrate round-trip into the RPC SELECT (F2, ~15 min), add `pg_trgm` GIN index on `title` (F3, one migration). The rest are post-launch.

---

## Architecture overview

```
                     ┌─ /v1/context (em_*)         ── retrieveEntries(brain)
                     ├─ /v1/answer  (em_*)         ── retrieveEntries(brain)
client query ───►    ├─ /api/memory/retrieve       ── retrieveEntries(brain)
                     ├─ /api/mcp::retrieve_memory  ── retrieveEntries(brain)
                     ├─ /api/llm chat tool         ── retrieveEntriesForUser(user)
                     └─ /api/search (POST)         ── match_entries direct (no expand)

retrieveEntries(query, brainId):
  1. generateEmbedding(query) ──► Gemini embedContent (gemini-embedding-001, 768d)
  2. POST /rpc/match_entries  ──► HNSW <=> top-20 (excludes secret + deleted at SQL)
  3. PostgREST keyword expand ──► ilike on title|content, type≠secret, +10 rows
  4. PostgREST tag sibling     ──► ilike on title from tag tokens, +10 rows
  5. PostgREST metadata hydrate ─► id IN (...) → metadata jsonb
  6. Hybrid score = sim*0.7 + kw_match*0.3, sort desc, slice 40
  7. concept_graphs row → applyGraphBoost (+0.05 same-concept, +0.08 same-rel)
  8. slice(limit), reinforcePersonaFacts (fire-and-forget bump confidence)
  → { entries, concepts }

retrieveEntriesForUser(query, userId):
  Same shape minus graph boost. Brain set = owned + brain_members.
  Vector RPC = match_entries_for_user (resolves accessible brains + entry_shares server-side).

handleSearch (api/search.ts):
  embed → match_entries → filter sim ≥ THRESHOLD (0.3) → cache 5min
  No keyword/tag expand. No graph boost. Pure vector.
```

No cross-encoder rerank. No BM25 — keyword expand is `ilike` substring match, not BM25 (pg `ts_rank` not used anywhere in retrieval). "Hybrid" here means linear blend of cosine sim + presence-based keyword overlap, not lexical scoring.

---

## What's solid

- **Secret + deleted exclusion enforced at the SQL function level** (`supabase/migrations/049_match_entries_exclude_secrets.sql:48-52` and `:88-89`; `supabase/migrations/071_match_entries_for_user.sql:53-54`). Even if a caller forgets `&type=neq.secret` on a PostgREST query, the RPC will not surface secrets. Defence-in-depth done right. Comment at migration 049:6-12 explicitly calls this out.
- **HNSW live, ivfflat dropped** (`supabase/migrations/074_entries_embedding_hnsw.sql:20-27`). One-way migration. `entries_embedding_hnsw_idx ON entries USING hnsw (embedding vector_cosine_ops)`. ANALYZE run at the bottom of the migration so planner stats refresh immediately.
- **Brain scope at SQL, not application** (`api/_lib/retrievalCore.ts:165` passes `p_brain_id` to RPC; migration 008:29-33 / 049:19-23 / 071:15-19 use it as the WHERE clause). For cross-brain, `match_entries_for_user` resolves accessible brain set inside a `WITH accessible_brains AS (...)` CTE (migration 071:36-40) so the API key client never gets to influence the predicate.
- **`SECURITY DEFINER` + pinned `search_path` on `match_entries_for_user`** (migration 071:33-34). Without `extensions` on the path, `<=>` operator-class lookup fails — the project hit this exact bug in 2026-04 and migration 044 patched the older `match_entries` and `build_similarity_graph` the same way (migration 044:18-22). Lesson learned, applied consistently.
- **EXECUTE granted only to authenticated/service_role, REVOKE ALL FROM PUBLIC** on `match_entries_for_user` (migration 071:66-68). Anonymous can't call it.
- **`findLockedSecretTitles` returns title only** (`api/_lib/retrievalCore.ts:130-150`). Comment at 119-129 spells out the threat model: "Title-only disclosure is the maximum we can leak here." Function selects `id,title` exclusively, never content or metadata. Brain-scoped (`brain_id=eq.${brainId}`), `deleted_at=is.null` enforced.
- **Embedding model + dim hard-coded** (`api/_lib/generateEmbedding.ts:8` `EMBED_DIM = 768`, `:40` `GOOGLE_EMBED_MODEL = "gemini-embedding-001"`). `validateEmbedding` (`:83-90`) asserts both — any provider drift on dimension throws synchronously rather than corrupting the vector store. `entries.embedding` column is `vector(768)` (migration 008:10) so a wrong-dim insert would also fail at the DB. Belt + braces.
- **Retry on transient embedding errors** (`api/_lib/generateEmbedding.ts:46-57`). 429 + 503 retried with backoff `[500, 1500, 3500]` ms, max 3 retries, 10s per attempt. Comment at :42-45 explains why this matters: without it, a single 429 on Gemini free tier marks an entry `embedding_status='failed'` permanently in `enrich.ts`. Lesson from production.
- **Search-side 5-minute LRU cache** (`api/search.ts:16-39`). 500-entry cap, lazy eviction on access, stale entries swept on insert. Keyed `${brain_id}:${query.lower}`. Eliminates duplicate RPC traffic for the search endpoint.
- **Soft threshold gate** (`api/search.ts:13` `SEARCH_THRESHOLD ?? "0.3"`). Below-threshold matches dropped before response. Tunable via env.
- **Embedding provider failure → graceful fallback** (`api/search.ts:139-141`). Try/catch returns `{ fallback: true }`. Client-side decides what to do (the surface is documented as `fallback: true` when no embed key / empty query / RPC error). No 500 cascading to the UI.
- **Replica identity full + RLS audit** (migration 048, 053) means RLS-side gaps are documented and audited; combined with service-role-only retrieval calls (`api/_lib/sbHeaders.ts:11-18` always uses service role) the policy surface is small.
- **Locked-secret leak vector limited to brain-scope, not user-scope** (`api/llm.ts:261`). `findLockedSecretTitles` runs on the active brain only — chat does not search vault titles across every brain the user can read. Right call: less surface for accidental cross-brain leakage of sensitive entry titles.

---

## Findings

### F1 — No embedding cache; every retrieval re-embeds the query (HIGH)

`api/_lib/retrievalCore.ts:158` and `:353` call `generateEmbedding(query, ...)` on every invocation. Same query string against the same brain re-hits Gemini every time. `api/search.ts:114` does cache the *response* (5-min LRU at lines 16-39) but `api/v1.ts:48`, `:125`, `api/memory-api.ts:78`, `api/mcp.ts:420`, `api/llm.ts:255` do not.

**Cost shape**: every chat turn that calls `retrieve_memory` is one embed at 768 dims. Project runs on `gemini-embedding-001`, billed per 1k input tokens. A typical chat session of 8 turns × N users × 30 days = N × 240 paid embeddings/month *just for retrieval re-issues of paraphrased questions*. Most of those are repeats — the user re-asks "what's my dad's birthday?" three different ways in the same hour.

**Latency shape**: median Gemini embedContent latency on a warm region is 80-150ms. p99 commonly 600ms+. This is straight serial in `retrieveEntries` (await on line 158 blocks every downstream step). Trim it and chat TTFB drops by ~100ms median.

**Fix**: in-memory LRU keyed `sha256(text).slice(0,16)` → `number[]`, 1000 entries, 1h TTL. Module-level Map (matches the search.ts pattern at lines 16-39). Skip if `process.env.NODE_ENV === 'test'` to keep tests deterministic. ~30 min including a unit test.

### F2 — Four PostgREST round-trips per retrieval (HIGH)

`retrieveEntries` issues, in serial:

1. `POST /rpc/match_entries` (line 162-170) — vector top-20.
2. `GET /entries?...&or=(title.ilike.*kw*,content.ilike.*kw*)...&limit=10` (line 184-187) — keyword expand.
3. `GET /entries?...&or=(title.ilike.*tag*,...)&limit=10` (line 217-220) — tag sibling expand.
4. `GET /entries?id=in.(<ids>)&select=id,metadata` (line 235-237) — metadata hydrate.

Each is a separate HTTPS round trip. From a Vercel function in `iad1` to Supabase in `eu-west`, that's ~50-90ms each. Total network overhead: 200-360ms before any compute. Add the embed call (F1) and median p50 retrieval is closer to 600ms than to 150ms.

The metadata hydrate (#4) is unambiguously waste: `match_entries` already SELECTs `metadata` (migration 049:42; migration 071:46). The keyword and tag passes are the only ones that fetch rows with stripped metadata — and they're filling the metaMap with rows that mostly came from the RPC (which already had metadata).

**Fix path**:
- **Quick (15 min)**: drop step 4 entirely. Update the keyword and tag PostgREST queries to include `metadata` in `select`. Net effect: same data, one fewer round trip, ~80ms saved.
- **Medium (1 hour)**: collapse keyword + tag into a single PostgREST request via OR-grouping. Saves another ~80ms.
- **Better (defer to vector-index-audit)**: push keyword expand into the SQL function. `match_entries_hybrid(query_embedding, p_brain_id, p_query_text, match_count)` does cosine + `ts_rank` lexical inside a single SQL function. One round trip total. Index-driven both sides.

### F3 — Keyword/tag expand uses `ilike '*kw*'` — full table scan once `entries` grows (HIGH)

`api/_lib/retrievalCore.ts:183` and `:215` build OR clauses of `title.ilike.*${kw}*,content.ilike.*${kw}*`. The leading `*` (PostgREST's `*kw*` translates to SQL `ILIKE '%kw%'`) means **no index is usable**. Every keyword expand is a `Seq Scan` on `entries` filtered by `brain_id` and `deleted_at IS NULL`.

For a single user with a few hundred entries this is invisible. At launch volume — thousands of users × hundreds-to-thousands of entries each, all in the same `entries` table — the planner picks `entries_brain_id_idx` for the brain filter then sequentially scans the brain's slice. With 1k entries/brain and 6 keyword tokens OR'd together that's 6k substring evaluations per call. Combined with the 4-round-trip shape (F2), cold-cache p95 trends past 1.5s.

**Mitigations in place**: token list capped at 6 (line 181 `slice(0, 6)`). Stopwords stripped (line 64-117 STOP set). Length filter `>3 chars` (line 180).

**Mitigations missing**: no full-text index, no trigram index. The `pg_trgm` extension is *not* enabled (no migration adds it; check `extensions` schema in vector-index-audit).

**Fix**: add `pg_trgm` GIN index. One migration:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
CREATE INDEX entries_title_trgm_idx ON public.entries
  USING gin (title gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX entries_content_trgm_idx ON public.entries
  USING gin (content gin_trgm_ops) WHERE deleted_at IS NULL;
```

`ILIKE '%kw%'` then index-scans. Real-world wins on similar datasets: 50-100x faster substring lookup once the table exceeds a few thousand rows. Alternative: full-text via `tsvector` + `ts_rank` if you also want lexical scoring (better for hybrid retrieval — see F2 longer-term fix).

### F4 — `match_count: 20` hard-coded; user `limit` ignored at SQL layer (MEDIUM)

`api/_lib/retrievalCore.ts:168` and `:367` send `match_count: 20` to the RPC regardless of caller `limit`. Caller's `limit` only kicks in at line 298 / 473 after all the in-memory shuffling. Side effects:

- Asking for `limit=5` still pulls 20 vector rows + 10 keyword + 10 tag = up to 40 rows over the wire. Wasted bandwidth + tokens-per-second on the metadata hydrate.
- Asking for `limit=50` (allowed at `api/v1.ts:47`, `api/memory-api.ts:76`, `api/mcp.ts:419`) is silently capped at 20 vector hits because `match_count` is fixed. User passes `limit=50` thinking they'll get a wider result set; they get the top-20 vector + keyword/tag fillers.

**Fix**: pass `match_count: Math.max(20, limit)` (or `limit * 2`) so the RPC returns enough rows for the hybrid blend to work. ~5 min.

### F5 — No circuit breaker / fallback when Gemini embeddings are down (MEDIUM)

`api/_lib/generateEmbedding.ts:73-75` throws on non-2xx after the retry exhaust. `retrieveEntries` (line 159) re-throws as `"Embedding failed"`. Callers handle it differently:

- `api/search.ts:139-141` — try/catch returns `{ fallback: true }`. Client renders fallback UI.
- `api/memory-api.ts:80-82` — try/catch returns 502.
- `api/v1.ts` `handleContext` — exception bubbles to `withApiKey`'s `handleRouteError`, becomes 500.
- `api/llm.ts` `retrieve_memory` tool — exception caught upstream in `runChat`, but the chat turn fails ungracefully.

Net effect: when Gemini's embedding service is down (it has been, twice in 2026, see `Working/2026-05-04-db-io-budget-incident.md` for context on similar outage handling), every chat / API client that depends on retrieval errors out. There is no lexical-only fallback path that can answer "what's my dad's birthday?" by `ts_rank` alone.

**Fix path**:
1. `generateEmbedding` returns `null` rather than throwing on terminal failure (after retries exhausted).
2. `retrieveEntries` checks for null and falls back to a lexical-only search (`tsvector` once F3 is in, or just the existing `ilike` keyword expand) over the brain.
3. Response includes `{ fallback: 'lexical' }` for client UX.

This is also the right shape for free-tier users who exhaust their Gemini quota mid-month — degraded but useful retrieval beats a 500.

### F6 — Concurrent-embed dedup absent (MEDIUM)

If two concurrent requests land on the same Vercel function instance with identical query strings (multi-tab user, refresh storm), both fire independent Gemini calls. Module-level Map cache (F1 fix) covers serial requests but races on concurrent ones.

**Fix**: stash an in-flight `Promise<number[]>` in the cache map so the second caller awaits the first. Standard "request coalescing" pattern. ~10 min on top of F1.

### F7 — Tag-sibling expand can spider into noise (LOW)

`api/_lib/retrievalCore.ts:200-211` collects tokens from tags of the top-5 hybrid results, ilike-matches them against titles, expands the result set. Token cleaning at :208 strips non-alphanum and digits-only — but a fact tagged `["family"]` will pull every entry with "family" in the title regardless of whether it's actually relevant to the query. Dilutes the rerank pool with low-similarity rows that happened to share a generic tag.

**Mitigations in place**: capped at 8 tokens, 10 rows pulled, scored back into the hybrid blend at 0.7 sim + 0.3 kw match (so a row with sim=0 only ranks via kw match — and kw match here is the *original query*, not the tag).

**Recommendation**: log how often tag-expand rows land in the final `slice(0, limit)` post-rerank. If under ~5% they're dead weight; remove the pass entirely. Trim 50-80ms off median. Defer measurement to post-launch via `pg_stat_statements`.

### F8 — `applyGraphBoost` only fires for `retrieveEntries`, not `retrieveEntriesForUser` (LOW — by design)

`retrieveEntriesForUser` (line 347) — the cross-brain chat path — skips the graph boost step entirely. Comment at line 343-346 explains: graphs are per-brain, merging across N brains is expensive. Trade-off documented and intentional. Not a finding so much as a noted asymmetry: chat retrieval ranking has slightly less concept-aware boosting than v1/mcp/memory-api retrieval.

If retrieval ranking quality starts diverging measurably between chat and the other surfaces, revisit by either (a) running graph boost only on the active brain's slice of results, or (b) building a cross-brain concept graph (much heavier, post-launch).

---

## Performance probe

**Limitation: live `EXPLAIN ANALYZE` blocked.** Supabase MCP not authenticated in this session — `mcp__claude_ai_Supabase__execute_sql` and `get_advisors` not callable. Section reconstructed from migration evidence; recommend re-running once auth is restored.

### Expected plan shape — `match_entries`

Given migration 074 (HNSW index live, ivfflat dropped) and migration 049 (function body), the planner choice for a typical call (`match_count=20`, brain with ~200 embedded rows):

```
Limit  (cost=... rows=20)
  ->  Index Scan using entries_embedding_hnsw_idx on entries e
        Order By: (e.embedding <=> $1)
        Filter: ((e.brain_id = $2)
                 AND (e.embedding IS NOT NULL)
                 AND (e.deleted_at IS NULL)
                 AND (e.type IS DISTINCT FROM 'secret'))
```

**Risk**: HNSW index orders by `<=>` but does *not* pre-filter `brain_id`. With many brains in one `entries` table, the planner returns top-K by similarity then drops rows where `brain_id ≠ p_brain_id`. If a user's brain has 500 rows but the table has 100k rows, the index returns rows from other users' brains first, post-filters them out, and may need to walk much further down the HNSW graph to fill `match_count=20`. This is a known pgvector pattern documented as the "filtered HNSW recall problem".

**Mitigation paths** (defer details to vector-index-audit 2026-06-14):
- HNSW index with a `brain_id` pre-filter via partial indexes per brain — impractical at thousands of brains.
- Pre-filter via planner hint: increase `hnsw.ef_search` so more candidates are walked. Helps recall.
- Move to an IVF-flat per-brain partition — heavyweight.
- Accept the recall cost at current scale (low thousands of total entries) and revisit when total table > 50k rows.

### Expected plan — keyword expand

```
Bitmap Heap Scan on entries
  Filter: ((title ~~* '%kw%' OR content ~~* '%kw%')
           AND brain_id = $1 AND deleted_at IS NULL AND type <> 'secret')
  ->  BitmapOr ... (no usable index for ILIKE '%...%')
  -> Seq Scan / Index Scan on entries_brain_id_idx
```

This is the F3 hot spot. Without `pg_trgm`, `ILIKE '%kw%'` is unindexable. Acceptable today; not at scale.

### `pg_indexes` inventory expected on `public.entries`

From migration history alone:
- `entries_pkey` — primary key on `id`.
- `entries_embedding_hnsw_idx` — HNSW (migration 074).
- `entries_embedded_at_idx` — partial B-tree where `embedded_at IS NULL` (migration 008:22). Used by enrich worker for "what still needs embedding".
- `entries_brain_id_idx`, `entries_user_id_idx`, `entries_type_idx`, `entries_created_at_idx` — assumed from migrations 001/013/016 (verify in vector-index-audit).
- Likely a `import_hash_idx` from migration 050.

Missing — should land before launch: `pg_trgm` GIN on title (and/or content). See F3.

### Sample query metrics

**Cannot capture live.** Once Supabase MCP is restored:

1. Short keyword (e.g. `"plumber"`):
   ```sql
   EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
   SELECT * FROM match_entries(<embedding>, '<brain_uuid>', 20);
   ```
2. Phrase query (e.g. `"recommended electrician contact"`).
3. Empty-result query (random UUID-shaped string).

Capture: `Index Scan vs Seq Scan`, `actual time`, `shared hits / reads`, `rows`. Compare cold vs warm by running each twice.

---

## Surface map

| Surface | Auth | Path | Function | Brain scope | Graph boost | Locked-secret titles | Cache |
|---|---|---|---|---|---|---|---|
| `POST /api/search` | JWT | `api/search.ts:90-142` | `match_entries` direct | single (req.body) | ✗ | ✗ | 5-min LRU on response |
| `GET /api/search` (graph view) | JWT | `api/search.ts:54-87` | `build_similarity_graph` | single | n/a | n/a | none |
| `POST /v1/context` | em_* | `api/v1.ts:42-50` | `retrieveEntries` | single (key-bound) | ✓ | ✗ | none |
| `POST /v1/answer` | em_* | `api/v1.ts:115-143` | `retrieveEntries` | single | ✓ | ✗ | none |
| `POST /api/memory/retrieve` | em_* or JWT | `api/memory-api.ts:49-83` | `retrieveEntries` | single | ✓ | ✗ | none |
| MCP `retrieve_memory` | em_* | `api/mcp.ts:415-421` | `retrieveEntries` | single | ✓ | ✗ | none |
| MCP `search_entries` | em_* | `api/mcp.ts:427-450` | `match_entries` direct | single | ✗ | ✗ | none |
| LLM chat tool `retrieve_memory` | JWT | `api/llm.ts:247-263` | `retrieveEntriesForUser` + `findLockedSecretTitles` | cross-brain | ✗ (by design) | ✓ | none |
| LLM chat tool `search_entries` | JWT | `api/llm.ts:265-278` | `match_entries_for_user` direct | cross-brain | ✗ | ✗ | none |

Every retrieval path uses the service role key (`api/_lib/sbHeaders.ts:11-18`) — bypasses RLS. Brain-scope enforcement therefore **must** live in the SQL function or the calling code's `WHERE` clause. Both routes do enforce it (verified above).

---

## Findings to prove or refute

| # | Question | Verdict | Evidence |
|---|---|---|---|
| F | Does retrieval exclude `deleted_at IS NOT NULL`? | **YES** | `match_entries` (migration 049:51), `match_entries_for_user` (migration 071:53), `findLockedSecretTitles` (`retrievalCore.ts:145`), `build_similarity_graph` (migration 049:86-87). Belt+braces at SQL + caller. |
| F | Does retrieval exclude `is_secret=true` for non-vault sessions? | **YES (typed)** | App models secrets as `type='secret'`, not a boolean. Excluded at `match_entries` (migration 049:52), `match_entries_for_user` (migration 071:54), keyword pass (`retrievalCore.ts:185`), tag pass (`:218`), MCP search (`api/mcp.ts:433`). `findLockedSecretTitles` is the *only* path that returns secret-typed rows, and only titles. |
| F | Does brain_id scoping happen at SQL level? | **YES** | `match_entries(p_brain_id)` is the function parameter (migration 049:21, 008:31). `match_entries_for_user` resolves the brain set inside a CTE (migration 071:36-40). PostgREST keyword/tag fallbacks use `brain_id=eq.${brainId}` (`retrievalCore.ts:185, 218`) and the cross-brain variant uses `brain_id=in.(${list})` (`:377`). No JS-side filtering of returned rows. |
| F | Is HNSW actually used for vector search? | **YES (presumed; cannot run EXPLAIN)** | Migration 074:20-22 creates HNSW index, 074:27 drops ivfflat. Migration 074:31 ANALYZEs. Index-only competitor for `<=> ` exists nowhere else on the column. Confirm via `EXPLAIN ANALYZE` post-MCP-restore. |
| F | Is there an embedding cache for repeat queries? | **PARTIAL — no** | Response cache exists for `/api/search` only (lines 16-39). `generateEmbedding` itself has no cache. Every other surface (v1, memory-api, mcp, llm-chat) re-embeds. See F1. |
| F | Does `generateEmbedding` have a circuit breaker / fallback when Gemini is down? | **NO** | Only retry-on-transient (`generateEmbedding.ts:46-57`). Terminal failure throws (`:73-75`). No lexical fallback path. See F5. |
| F | Are concurrent embedding requests deduplicated? | **NO** | No in-flight promise dedup. Two simultaneous identical queries → two Gemini calls. See F6. |

---

## Recommendations (priority order)

1. **[HIGH] F1** — embedding LRU cache in `generateEmbedding` module. 1000 entries, 1h TTL, sha256-keyed. ~30 min including unit test. Saves ~100ms median per retrieval call + paid embed cost on repeat queries.
2. **[HIGH] F2** — drop the metadata-hydrate round-trip; add `metadata` to the keyword + tag SELECT lists. ~15 min. Saves ~80ms median.
3. **[HIGH] F3** — `pg_trgm` GIN indexes on `title` (and optionally `content`) under `WHERE deleted_at IS NULL`. One migration, ~5 min author + apply. Required before launch volume.
4. **[MEDIUM] F4** — make `match_count` proportional to caller `limit`. One-line change. ~5 min.
5. **[MEDIUM] F5** — null-return + lexical fallback when embedding fails terminally. Wraps `generateEmbedding` to return `null`, `retrieveEntries` falls back to keyword pass over the brain. ~45 min including a test for the down-Gemini path.
6. **[MEDIUM] F6** — in-flight promise coalescing in the embedding cache. Bolted onto F1. ~10 min extra.
7. **[LOW] F7** — measure tag-sibling expand contribution post-launch via metric on `_score` source. If <5% of final-slice rows came from tag pass, remove the pass.
8. **[LOW] F8] — noted asymmetry in `applyGraphBoost` between brain-scoped and cross-brain retrieval. Documented in code; revisit only if ranking quality diverges.

### Hand-off to vector-index-audit (2026-06-14)

- Confirm `entries_embedding_hnsw_idx` is the index actually picked by the planner for `match_entries`. `EXPLAIN (ANALYZE, BUFFERS)` cold + warm.
- Capture `hnsw.ef_search` (default 40) — recall cost at filter ratio when one brain is a small fraction of total entries.
- Audit unused-index advisor lints (deferred from migration 063 line 8-11). Drop any index that hasn't been touched a week post-launch.
- Recall sweep: run a labelled set of queries through `match_entries` and `match_entries_for_user`, measure recall@10 vs a brute-force baseline, capture in audit.

---

## Limitations of this audit

- **Live SQL probes blocked**: Supabase MCP (`mcp__claude_ai_Supabase__*`) is not authenticated this session. `EXPLAIN ANALYZE` plans, advisor 0005, `pg_stat_statements` top-N, and total-row / unembedded-row counts could not be captured. All structural claims about indexes and function bodies derive from migration files (verified) — the planner's actual choices are inferred. **Re-run once MCP auth is restored:**
  - `select pg_get_functiondef(oid) from pg_proc where proname IN ('match_entries','match_entries_for_user','build_similarity_graph');`
  - `select indexname, indexdef from pg_indexes where schemaname='public' and tablename='entries';`
  - `select count(*) from entries; select count(*) from entries where embedding is null;`
  - `mcp__claude_ai_Supabase__get_advisors({type:'performance'})` — capture advisor 0005 (unused index) + any HNSW-related entries.
  - Run the three sample-query plans listed in "Performance probe".
- **No cross-encoder rerank** in the codebase (verified by reading `retrievalCore.ts` end-to-end — no `Cohere`, `Voyage`, or `rerank` references). The "rerank" the scope mentions is the linear hybrid sort at `retrievalCore.ts:268`. No latency budget to capture.
- **No BM25** in the codebase — keyword expand is `ILIKE`, not `ts_rank`. The "BM25 fallback" in scope doesn't exist; `ILIKE` substring is the lexical layer.
- **No explicit tests against retrieval correctness** — `tests/api/search.test.ts` exists (per Glob output) but was not opened in this audit; verifying secret/deleted exclusion tests are present is a follow-up.

## Method

- Read `api/_lib/retrievalCore.ts` end-to-end (612 lines).
- Read `api/search.ts`, `api/_lib/generateEmbedding.ts`, `api/_lib/sbHeaders.ts`, `api/_lib/withAuth.ts`, `api/_lib/checkBrainAccess.ts`, `api/_lib/googleAi.ts` end-to-end.
- Read `api/llm.ts:1-100, 200-400` (chat retrieval tool wiring).
- Read `api/memory-api.ts` (em_*-key retrieval surface).
- Read `api/v1.ts:1-200` (`/v1/context`, `/v1/answer`, ingest).
- Read `api/mcp.ts:400-530` (retrieve_memory + searchEntries + getEntry).
- Read SQL migrations: `008_pgvector.sql`, `010_similarity_graph.sql`, `044_vector_search_path.sql`, `049_match_entries_exclude_secrets.sql`, `063_perf_rls_and_io.sql`, `071_match_entries_for_user.sql`, `074_entries_embedding_hnsw.sql`.
- Cross-checked surface map against grep of all callers of `retrieveEntries`, `retrieveEntriesForUser`, `findLockedSecretTitles`, `match_entries`, `match_entries_for_user`, `generateEmbedding`.
- Did not run live SQL or hit Gemini in this audit. Defer index-build params + recall measurement to vector-index-audit (2026-06-14, scoped).
