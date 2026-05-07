# Stability & Scale Audit — 2026-05-06

## Executive Summary

The codebase is well-architected for a single-user/early-beta system and has clearly had multiple hardening passes. The enrichment pipeline, rate limiting, and idempotency are more robust than typical projects at this stage. However, four issues will cause observable failures under launch traffic: (1) `runGmailScanAllUsers` fans out all user Gmail scans in parallel with no concurrency cap — at 20+ users this will saturate Gemini rate limits and Vercel's 300s function timeout simultaneously; (2) fire-and-forget IIFEs inside `scanGmailForUser` / `persistClusters` for auto-accept enrichment are cut off when the parent Vercel invocation exits, silently dropping enrichment for auto-accepted entries; (3) `enrichAllBrains` fetches **all** brains from the DB with no pagination/limit, which is a full-table scan that grows unboundedly; (4) the `_cache` Map in `search.ts` has no eviction and is never pruned, growing without bound across the serverless instance lifetime. Pre-launch verdict: **not yet production-ready for thousands of users** — critical fixes required before public launch.

---

## Critical Findings (will break under launch traffic)

### F1: `runGmailScanAllUsers` — unbounded `Promise.all` over all users

- **Confidence**: high
- **File**: `api/_lib/gmailScan.ts:2309`
- **Symptom**: At N=20 concurrent Gmail users, the daily cron fires 20 simultaneous `scanGmailForUser` calls. Each scan runs up to 80 thread fetches + a Gemini classification call + `clusterThreadBlocks` (batch embedding call) + `persistMatches` (per-entry attachment extraction + Gemini PDF extraction). Total wall-clock easily exceeds 300s. Vercel kills the function mid-flight, leaving partial scan state (some users scanned, others not; `last_scanned_at` already written for scanned users so the next cron skips them).
- **Root cause**: `Promise.all(integrations.map(...))` has no concurrency limit. `scanGmailForUser` itself has no timeout guard at the user level.
- **Repro / load profile**: Triggers as soon as >~5 active Gmail users overlap in a cron window. At 20 users the 300s wall-clock will be exceeded on almost every daily run.
- **Fix**: Replace `Promise.all` with a bounded-concurrency loop (e.g. the existing `mapWithConcurrency` helper already in `enrich.ts:1198`), concurrency 3–5. Add a per-user `AbortController` timeout of ~45s. Example:
  ```ts
  await mapWithConcurrency(integrations, 4, async (int) => { ... });
  ```

### F2: Fire-and-forget IIFEs for auto-accept enrichment cut off by Vercel

- **Confidence**: high
- **File**: `api/_lib/gmailScan.ts:1466` (classifier mode) and `api/_lib/gmailScan.ts:1821` (cluster mode)
- **Symptom**: Auto-accepted Gmail entries silently have no parse/insight/concepts/persona enrichment. They appear in the UI with the red P/I/C/E chips stuck pending, and the hourly cron is acknowledged as the only safety net. On Vercel, an invocation ends the moment the response is sent (or 300s elapses). Any work queued in an un-awaited IIFE after `insertRes` returns is terminated before it can complete, specifically `enrichInline` and `extractGmailAttachmentsForEntry`.
- **Root cause**: `(async () => { ... })()` launches work after the last `return` from `persistMatches`/`persistClusters`. The calling function (`scanGmailForUser`) returns to the HTTP handler which sends the response. Vercel freezes the process immediately after `res.end()`.
- **Repro / load profile**: Every auto-accepted Gmail entry on the Vercel-hosted deployment. The hourly cron provides eventual recovery, but that is up to 60 minutes of broken state per entry, and the cron itself has the F1 concurrency problem.
- **Fix**: Await the enrichment calls inline (preferred), or collect IDs and enqueue them in a post-scan `enrichBrain` call that is itself awaited before `scanGmailForUser` returns. The comment in the code acknowledges this is fire-and-forget; the assumption that Vercel keeps the process alive is incorrect.

### F3: `enrichAllBrains` — full-table scan of all brains, no limit

- **Confidence**: high
- **File**: `api/_lib/enrich.ts:1855`
- **Symptom**: `GET /rest/v1/brains?select=id,owner_id` with no `limit` or `user_id` filter. At 1000 users with 3 brains each this fetches 3000 rows in a single PostgREST call, then serially calls `enrichBrain` on each within a time-boxed loop. PostgREST default limit is 1000 rows — above that, rows are silently truncated, so brains beyond the first 1000 are never enriched.
- **Root cause**: No pagination, no `limit` param, relies on PostgREST returning all rows.
- **Repro / load profile**: Triggered at every daily cron run. At >1000 brains PostgREST silently drops rows. At >500 users the query itself starts to be slow (sequential scan on `brains` if not indexed by something the query filters on — it doesn't filter at all).
- **Fix**: Add `&limit=500&order=id` and paginate via cursor, or filter to only brains that have pending entries (join with `entries?embedding_status=eq.pending`). At minimum add `&limit=1000&order=id` and handle cursor pagination. The RPC `claim_pending_enrichments` already handles per-brain batching — the outer loop just needs to be bounded and paginated.

### F4: Gmail dedup window fetches up to 10 000 metadata rows per scan

- **Confidence**: high
- **File**: `api/_lib/gmailScan.ts:1059–1063`
- **Symptom**: `fetchImportedIdentifiers` fetches `limit=10000` rows of `metadata` (a JSONB column) on every scan invocation. At scale (user with 5000+ Gmail entries), this is a large payload transferred over PostgREST — potentially several MB of JSON per scan — burning Supabase egress and slowing every scan's startup. PostgREST itself will 200 with truncated results if the row count exceeds the configured `max_rows` (default 1000 on Supabase).
- **Root cause**: Dedup relies on an in-memory set built from all historical entries. The comment acknowledges "past ~10k the window narrows" but at even 1000 rows this is already a significant query.
- **Repro / load profile**: Every Gmail scan for any user with >1000 Gmail entries. Supabase default `max_rows=1000` means `limit=10000` is silently capped at 1000 anyway — so the dedup window is already broken for heavy users without anyone noticing.
- **Fix**: Rely on the DB unique index (`entries_contact_email_uniq` is mentioned at line 1091; a similar unique index on `gmail_thread_id` would be the canonical fix). Enforce dedup at insert time with `on_conflict=ignore-duplicates` rather than pre-fetching all identifiers into memory. Failing that, reduce the fetch to the last 30 days of entries only.

---

## High Priority (fix before scale beyond ~100 users)

### H1: `_cache` Map in `search.ts` has no eviction and grows without bound

- **Confidence**: high
- **File**: `api/search.ts:15–23`
- **Symptom**: `_setCache` adds entries; `_getCached` reads them with a TTL check but never deletes stale entries. The Map grows without bound for the lifetime of the serverless instance. On a warm/long-lived instance (Vercel keeps functions warm for ~15 min), a user doing many unique queries fills this Map continuously with never-pruned entries. Not a memory leak in the traditional sense (serverless instances do recycle), but on a busy instance this can inflate memory use and slow Map lookups.
- **Root cause**: `_getCached` checks TTL but returns null without deleting the stale entry. There is no LRU eviction, no max-size cap, and no periodic sweep.
- **Repro / load profile**: Any moderately active instance. The `verifyAuth` cache at `api/_lib/verifyAuth.ts:25` does have a `CACHE_MAX_ENTRIES=500` eviction guard — `search.ts` lacks an equivalent.
- **Fix**: Mirror `verifyAuth.ts` — add a `MAX_CACHE_ENTRIES` constant and evict the oldest entry on overflow, or delete stale entries in `_getCached`:
  ```ts
  function _getCached(k: string): unknown | null {
    const e = _cache.get(k);
    if (!e) return null;
    if (Date.now() - e.ts >= _TTL) { _cache.delete(k); return null; }
    return e.r;
  }
  ```

### H2: `deepExtractEntry` and `generateIgnoreRule` in `gmailScan.ts` still hard-wire Anthropic API key — silently return null/fallback when key absent

- **Confidence**: high
- **File**: `api/_lib/gmailScan.ts:906–907` and `api/gmail.ts:53–54`
- **Symptom**: Both functions check `process.env.ANTHROPIC_API_KEY` and return `null`/fallback string if not set. Per CLAUDE.md, Anthropic key is not configured — the project runs on Gemini. Every `deepExtractEntry` call silently returns `null`, meaning invoice/action-required/signing-request entries never get their rich field extraction (amount, account_number, reference_number, id_number, etc.). `generateIgnoreRule` returns a generic fallback string. Users see entries with empty structured fields for all "deep extract" email types.
- **Root cause**: `deepExtractEntry` is not ported to use the project's standard `callAI`/`resolveProviderForUser` path — it bypasses `aiProvider.ts` entirely and calls Anthropic directly.
- **Repro / load profile**: Every classifier-mode Gmail scan for all 6 deep-extract types (`invoices`, `action-required`, `signing-requests`, `deadline`, `appointment`, `subscription-renewal`). Affects all users.
- **Fix**: Replace the raw Anthropic fetch in `deepExtractEntry` with `callAI(cfg, ...)` using the user's resolved provider (Gemini). The prompt is already well-formed — just route it through `resolveProviderForUser`.

### H3: `persistMatches` — `Promise.all` over all classified matches with no concurrency cap on Gemini extraction

- **Confidence**: high
- **File**: `api/_lib/gmailScan.ts:1281`
- **Symptom**: All classified matches are processed concurrently via `Promise.all`. Each match may call `fetchAndExtractAttachments` (up to 3 Gemini PDF extraction calls per attachment) plus `deepExtractEntry` (one Anthropic call — see H2). On a scan with 20 classified matches, this fires up to 60 Gemini API calls simultaneously, immediately hitting the Gemini free-tier rate limit (60 RPM). The retry logic in `generateEmbedding.ts` has 3.5s max backoff — nowhere near enough for a 429 storm.
- **Root cause**: `Promise.all` with no concurrency control over external API calls.
- **Repro / load profile**: Any scan returning >10 classified matches. Users with active inboxes will hit this on every manual scan.
- **Fix**: Replace `Promise.all(classified.map(...))` with `mapWithConcurrency(classified, 3, ...)`. This is the same pattern already used in `bulkEmbedBatch`.

### H4: `handleEmptyTrash` / `handleBulkPatch` — no explicit timeout on PostgREST calls touching large row sets

- **Confidence**: medium
- **File**: `api/entries.ts` — bulk operations route through PostgREST without a per-request `AbortController` timeout
- **Symptom**: `DELETE /api/entries?action=empty-trash` deletes all trash entries for a user with a single PostgREST `DELETE` call. A user with 10 000 trashed entries causes a long-running DELETE that holds the Vercel function slot open. No timeout — can run up to 300s before Vercel kills it, with the delete potentially incomplete.
- **Root cause**: No `AbortController` / `signal` on bulk PostgREST calls. `verifyAuth.ts` correctly uses a 5s abort signal on auth calls; bulk data mutations do not.
- **Repro / load profile**: Any user who has accumulated >1000 trashed entries and then empties trash. Rare today, common post-launch.
- **Fix**: Add `AbortController` with a ~25s timeout to bulk PostgREST mutations, or batch the delete in chunks of 500 with a loop.

### H5: `upsertGmailContact` race — INSERT then SELECT is not fully atomic under parallel scans

- **Confidence**: medium
- **File**: `api/_lib/gmailScan.ts:1113–1147`
- **Symptom**: The code does `INSERT ... ignore-duplicates` then `SELECT` on conflict. However `persistMatches` runs all matches via `Promise.all` — multiple concurrent matches from the same sender can each observe an empty INSERT response (PostgREST `return=representation` returns `[]` on conflict), then all fall through to the SELECT-then-PATCH path simultaneously. The PATCH is idempotent so no duplicate rows, but `interaction_count` can be incremented by multiple concurrent patches, leading to an incorrect (higher) count.
- **Root cause**: `contactCache` deduplication in `persistMatches` (line 1277) shares the cache across the concurrent `Promise.all` — but only if the `contactCache.has(fromEmail)` check fires before the first awaited `upsertGmailContact` resolves. Due to JavaScript's cooperative scheduler and multiple awaits inside `persistMatches`'s mapper, two mappers for the same sender email can both call `upsertGmailContact` before either has populated `contactCache`.
- **Repro / load profile**: Any scan with two emails from the same sender in the same batch (common for invoice threads).
- **Fix**: The `contactCache` pattern is correct — it just needs the cache set to be populated synchronously before the first `await`. Change to: set `contactCache.set(fromEmail, upsertGmailContact(...))` unconditionally (not inside `if (!contactCache.has(fromEmail))`) or move the dedup check to before any `await` in the mapper and re-check atomically.

---

## Medium Priority (hardening pass)

### M1: `mapWithConcurrency` uses a shared `cursor` variable — data race under async iteration

- **Confidence**: medium
- **File**: `api/_lib/enrich.ts:1198–1220`
- **Symptom**: `cursor` is a closure variable incremented by each worker with `cursor++`. In JavaScript this is safe because `++` is synchronous — workers only advance `cursor` between awaits, not during. However `out[idx] = await fn(items[idx]!)` writes to a pre-allocated array at the same index as `idx` captured before the await. If `fn` throws, the array slot stays `undefined` (typed as `R` which could be `EmbedResult`). The `results` array returned has holes that downstream `.filter()` calls may not handle correctly — `r.kind` on `undefined` will throw.
- **Fix**: Wrap the `fn` call: `out[idx] = await fn(items[idx]!).catch(() => ({ id: items[idx]!.id, kind: 'failed' } as R))` or guard the filter with `results.filter(Boolean)`.

### M2: `fetchPersonaDedupSet` hard-caps at 1000 persona rows — dedup silently breaks beyond that

- **Confidence**: medium
- **File**: `api/_lib/enrich.ts:663`
- **Symptom**: `limit=1000` means users with >1000 persona facts (possible for heavy users after months) get incomplete dedup. Duplicate persona facts will be inserted for facts beyond the dedup window.
- **Fix**: This is a pgvector similarity search — the right fix is a DB-side dedup query (`match_entries` RPC with the new fact's embedding) rather than loading all embeddings into memory.

### M3: `_counts` Map in `rateLimit.ts` grows to 500 entries then only evicts expired on overflow — in-memory only, zero protection in prod

- **Confidence**: medium (informational — already documented in code)
- **File**: `api/_lib/rateLimit.ts:22–23`
- **Symptom**: The code comment correctly notes this is dev-only. However the `_onVercel` branch at line 164 returns `false` (fail closed) when Upstash is unconfigured, meaning Vercel deployments without Upstash configured silently block ALL requests. If `UPSTASH_REDIS_REST_URL` is not set in a Vercel preview deployment, every authenticated request returns 429.
- **Fix**: Confirm Upstash env vars are set in all Vercel environments (production, preview). Add a startup check/log so a missing var is immediately visible in function logs rather than manifesting as silent 429s.

### M4: `updateStreak` in `capture.ts` is fire-and-forget — no `.catch` and no await

- **Confidence**: medium
- **File**: `api/capture.ts:44–68`
- **Symptom**: `updateStreak(user.id)` called without `await` or `.catch()` — an unhandled promise rejection if the auth admin API call fails, which in Node 18+ emits an `UnhandledPromiseRejection` warning and in some configurations terminates the process.
- **Fix**: Add `.catch(() => {})` to the `updateStreak(user.id)` call, or `await` it with a try/catch.

### M5: `fetchImportedIdentifiers` Supabase default `max_rows` silently truncates to 1000

- **Confidence**: high (overlaps F4 — documenting separately as a DB config risk)
- **File**: `api/_lib/gmailScan.ts:1059`
- **Symptom**: `limit=10000` in the query exceeds Supabase's default PostgREST `max_rows=1000`. Supabase hosted projects cap response rows at 1000 unless explicitly configured otherwise. The query will silently return 1000 rows regardless of the `limit=10000` parameter, meaning the dedup window is already broken for any user with >1000 Gmail entries.
- **Fix**: Verify Supabase project `max_rows` setting and either raise it or switch to a DB-native dedup strategy.

---

## Low Priority / Informational

- `api/gmail.ts:53` — `generateIgnoreRule` calls Anthropic directly with no fallback to Gemini. Returns a generic string when key absent. Low severity because this is a UX nicety (auto-generated ignore rule text), not a data path.
- `api/search.ts:90` — `cacheKey` is `${brain_id}:${query}` without user_id scoping. On a shared serverless instance where two users in the same brain trigger the same query simultaneously, one user gets the other's cached results. In practice RLS on `match_entries` means both users get the same public results for shared brains, but for personal brains this could theoretically expose data if two users somehow share the same brain_id (not possible by design, but worth noting).
- `api/_lib/enrich.ts:456` — `stepEmbed` failure path calls a `.catch(() => {})` on the "mark failed" PATCH. If this PATCH also fails, the entry stays at `embedding_status='pending'` forever with no breadcrumb. Low risk since the cron retries, but the silence is worth logging.
- `src/hooks/useEntryRealtime.ts:68` — `pending.slice(0, 100)` silently drops pending entries beyond 100. For a user with 200 unprocessed entries after a bulk import, enrichment progress for the last 100 entries won't appear until the first 100 are done. Not a bug, but a UX gap.
- `api/_lib/verifyAuth.ts:63` — evicts the oldest cache entry on overflow (correct). But `cache.keys().next().value` returns `undefined` when the map is empty — the `if (oldestKey !== undefined)` guard handles this correctly.
- `api/transfer.ts:140` — `enrichBrain(user.id, brain_id, 30).catch(() => {})` is fire-and-forget after import. Same Vercel lifetime issue as F2 — enrichment may be cut off. Mitigated by hourly cron, but the first-paint experience after import shows all entries as unenriched.
- `api/_lib/idempotency.ts:103` — lazy cleanup of expired keys uses `Math.random() < 0.01` (1% probability). At high capture rates this provides adequate cleanup. At low rates (< 100 captures/day), old keys may accumulate. Not a correctness issue.
- No timeout on `fetch` calls to PostgREST in `enrich.ts` (outside of `verifyAuth`). If Supabase is slow, enrichment functions can hang for the full 300s Vercel budget. Low risk while Supabase is healthy; should be addressed before public launch.

---

## Architectural Risks

1. **Vercel Hobby 12-function cap is already exhausted.** Per CLAUDE.md, all 12 slots are used. Any new feature requiring a dedicated endpoint must consolidate an existing one. This is already acknowledged but constrains the remediation options for F1 (can't add a separate cron worker function without consolidating).

2. **All long-running work lives in `user-data.ts`.** The daily cron (`handleCronDaily`), hourly cron (`handleCronHourly`), Gmail scan, enrichment, persona hygiene, push notifications, and all billing webhooks share a single Vercel function. A timeout or crash in any one of these paths cancels all others in the same invocation. The 300s Vercel limit is a shared budget across everything `handleCronDaily` calls sequentially.

3. **PostgREST connection pooling.** The enrichment pipeline makes many small PostgREST calls (one per entry per step). At `batchSize=50` with 4 steps each, `enrichBrain` makes ~200 HTTP requests to PostgREST per invocation. PgBouncer in transaction mode (Supabase default) handles this, but sustained cron + real-time user traffic may exhaust the connection pool (default ~60 connections on free/pro tier) during peak.

4. **HNSW index capacity.** `pgvector` HNSW indexes perform well up to ~1M vectors but degrade gracefully. At launch scale (thousands of users × hundreds of entries) this is not an issue. Worth monitoring `pg_stat_user_indexes` for index size as a leading indicator.

5. **`_cache` in `verifyAuth.ts` is per-process, not per-user across instances.** A revoked token remains valid in the cache for up to 30s. Acknowledged in code comments. Not an issue today (no token revocation flow), but needs hardening before any admin/moderation tooling that requires immediate revocation.

6. **No dead-letter queue for enrichment.** Entries stuck at `enrichment_state='failed'` with `attempts >= 5` are never retried automatically. The only recovery path is the admin `?action=enrich-retry-failed` endpoint. A single bad Gemini response for a batch can permanently fail entries with no user-visible indication beyond the red enrichment chips.
