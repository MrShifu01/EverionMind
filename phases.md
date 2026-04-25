# Enrichment Rewrite — Phases

## Goal

One enrichment pipeline. One source of truth for "is this enriched?". One provider abstraction that handles **managed providers (tier-based)** and **bring-your-own-keys** uniformly, with room for future providers (local models, other APIs) without touching business logic.

## Non-goals

- Don't rewrite capture, search, chat, or anything outside enrichment + provider routing.
- Don't change user-facing behaviour (entries still parse → insight → concepts → embed). Same outputs, different plumbing.
- Don't add new features. Pure simplification + correctness.

---

## Design summary

### Provider routing

```
resolveProviderForUser(userId)
  → if user has BYOK key for any of [anthropic, openai, gemini], use that
  → else if tier === 'pro' | 'max'                → managed Anthropic
  → else if tier === 'starter'                    → managed Gemini
  → else (free / unknown)                         → null  (no enrichment)
returns { provider, apiKey, model, source: 'byok' | 'managed' } | null
```

Embedding is **always Gemini** (or OpenAI if BYOK) — Anthropic has no first-class embedding model and we don't want enrichment success tied to the user's LLM choice.

### Provider abstraction

```ts
type Provider = 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';

interface AICall {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl?: string;     // for openai-compatible (Ollama, LM Studio, OpenRouter, …)
}

callAI(cfg: AICall, system: string, content: string, opts?: { maxTokens?: number, json?: boolean }): Promise<string>
```

One adapter per shape. `'openai-compatible'` covers most future local-model gateways out of the box.

### Single source of truth for "enriched"

```ts
type EnrichmentFlags = {
  parsed: boolean;
  has_insight: boolean;
  concepts_extracted: boolean;
  embedded: boolean;
};

flagsOf(entry): EnrichmentFlags
isFullyEnriched(entry): boolean   // = all four true
```

Used by:
- `enrichInline` (decides which steps to run)
- the `?action=enrich-debug` endpoint (counts)
- `EnrichFlagChips` in `EntryList.tsx` (per-card visual)
- `isPendingEnrichment` for the wave-dot

No fallback heuristics. If a flag isn't explicitly `true`, the step runs (and stamps it on success). Legacy data gets a one-shot SQL migration.

### Pipeline shape

```ts
async function enrichInline(entry, userId) {
  const cfg = await resolveProviderForUser(userId);
  if (!cfg) return;                   // free tier or no provider — no-op

  const flags = flagsOf(entry);

  if (!flags.parsed)             await stepParse(entry, cfg);
  if (!flags.has_insight)        await stepInsight(entry, cfg);
  if (!flags.concepts_extracted) await stepConcepts(entry, cfg);
  if (!flags.embedded)           await stepEmbed(entry, embedCfgFor(cfg));

  // each step PATCHes metadata + flag atomically; failures leave the flag unset for retry
}
```

Awaited from `capture.ts`. No queue. No cron drain. No fire-and-forget. The function holds open until done — capture has `maxDuration: 30` already.

For users that timeout (slow networks, long content): the next click of "Run now" picks up whichever flags are still false. Same code path, same convergence guarantee.

---

## Phases

### Phase 1 — Provider abstraction (foundation)

**Deliverable**: `api/_lib/aiProvider.ts` exporting `callAI(cfg, system, content, opts)`.

Adapters for `anthropic`, `openai`, `gemini`, `openai-compatible`. Each adapter handles its own auth header, request shape, and response parsing. Gemini adapter sets `thinkingConfig: { thinkingBudget: 0 }` by default.

**Verification**: unit-test each adapter with a mocked `fetch`. Run `tsc --noEmit`. No runtime change yet (existing code still uses `callAnthropic`/`callGemini` privately).

### Phase 2 — Provider resolver

**Deliverable**: `api/_lib/resolveProvider.ts` exporting `resolveProviderForUser(userId): Promise<AICall | null>`.

Reads `user_ai_settings` for BYOK keys, falls back to `user_profiles.tier` for managed routing. Pure SELECT query, cached per request.

**Verification**: unit-test the decision matrix (BYOK Anthropic → returns BYOK; tier=pro no BYOK → managed Anthropic; tier=starter → managed Gemini; tier=free → null).

### Phase 3 — Single source of truth for flags

**Deliverable**: `api/_lib/enrichFlags.ts` exporting `flagsOf(entry)`, `isFullyEnriched(entry)`. No fallback heuristics — explicit booleans only.

Update three consumers to import from this module:
- `api/entries.ts` (`?action=enrich-debug`)
- `src/components/EntryList.tsx` (`EnrichFlagChips`, `isPendingEnrichment`)
- `api/_lib/enrichBatch.ts` (current pipeline — temporary, deleted in Phase 5)

**Verification**: diagnostic + card chips show the same state for every entry. Type-check clean.

### Phase 4 — One-shot data migration

**Deliverable**: migration `045_enrichment_canon.sql`.

Stamps explicit flags for legacy data:
- `parsed = true` where any non-`SKIP_META` key exists in metadata
- `has_insight = true` where `metadata.ai_insight` is set
- `concepts_extracted = true` where `metadata.concepts` is non-empty array OR legacy `enrichment.concepts_count > 0`
- `embedded = true` where `embedded_at IS NOT NULL` (in addition to the existing `embedding_status='done'` mirror)

Strips legacy fields no longer in use: `enrichment.concepts_count`, `enrichment.has_related`, `enrichment.embedded`.

**Verification**: post-migration, `SELECT COUNT(*) FROM entries WHERE NOT (… all four flags true …) AND deleted_at IS NULL` matches the diagnostic count. Run before Phase 5 ships.

### Phase 5 — Inline pipeline + delete the queue

**Deliverable**: replace `scheduleEnrichJob` / `runEnrichEntry` / `runEnrichBatchForUser` with `enrichInline(entry, userId)` and `enrichBrain(brainId, userId, batchSize)` for the manual "Run now" path.

- `capture.ts` — `await enrichInline(entry, user.id)` instead of `await scheduleEnrichJob(...)`.
- `entries.ts ?action=enrich-batch` — call `enrichBrain` (loops over un-flagged entries, each goes through `enrichInline`).
- Remove fallback heuristics in flag checks (they live in the migration now).
- Drop the `entry_enrichment_jobs` table writes from the hot path.
- Drop the daily-cron drain section in `user-data.ts cron-daily`.

**Verification**: capture a new entry → all four flags green within the response time. Run-now on legacy backlog → entries flip to enriched in batches without queue rows being created.

### Phase 6 — Cleanup

**Deliverable**: delete dead code.

- Remove `callAnthropic` / `callGemini` private helpers from `enrichBatch.ts`. The adapter in Phase 1 is the only path.
- Remove `entry_enrichment_jobs` table (migration `046_drop_enrichment_jobs.sql`).
- Remove `drainEnrichmentJobs` and the cron-daily call site.
- Remove `SKIP_META` and the fallback branch of `isParsed`.
- Update CLAUDE.md to point at the new pipeline.

**Verification**: `git grep -E "scheduleEnrichJob|runEnrichEntry|drainEnrichmentJobs|callAnthropic"` returns zero matches in `api/`. Type-check clean. Diagnostic still works.

### Phase 7 — Per-card embedding-aware UI polish

**Deliverable**: small UX cleanups now that the pipeline is reliable.

- "Retry embedding" button on the diagnostic when `failed_embedding > 0`.
- `Pending` stat counts entries with any flag false (not just three of four).
- Remove the wave-dot for entries with `embedding_status === 'failed'` — they have a separate ⚠ indicator already, the dot is misleading.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Inline enrichment makes capture slow on long entries | maxDuration=30 already set; if a Gemini parse step takes >25s we abort the step and let the user re-trigger via Run-now. Wave-dot stays visible until done. |
| BYOK key invalid mid-flight | adapter returns `""`, step doesn't stamp flag, retry next click. Same behaviour as today. |
| Migration 045 mis-stamps an entry | run on a copy of prod first; verify counts match diagnostic before applying. |
| Removing the queue loses retries for transient failures | inline is awaited so transient failures surface as 5xx to the client; client can retry. The 1/day cron was barely a safety net anyway (it only ran once a day). |
| Free-tier users now get no enrichment | matches stated tier policy. Surface "Upgrade to enrich" prompt where the wave-dot would be. (Phase 7 follow-up if wanted.) |

---

## Out of scope (parking lot)

- Streaming partial enrichment results to the UI as steps complete.
- Rate-limit / cost guardrails per provider (use `checkAndIncrement` if needed — existing primitive).
- Cost telemetry per enrichment call.
- Per-user prompt customisation.
