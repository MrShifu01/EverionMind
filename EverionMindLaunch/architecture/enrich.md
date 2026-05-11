# Enrichment Pipeline

End-to-end map of how an `entries` row gets from "raw text + title" to
"parsed metadata + insight + concepts + embedding + persona facts." The
pipeline drives the PICE chips, semantic search, persona memory, and
merge detection. Reflects state as of commit `11fb3bb`.

## TL;DR

- One module (`api/_lib/enrich.ts`, ~1460 lines) does all enrichment work.
  Three public entrypoints: `enrichInline` (one entry, awaited),
  `enrichBrain` (loop over a brain, batched + time-budgeted),
  `enrichAllBrains` (daily cron over every brain).
- Five steps per entry: **parse → insight → concepts → embed → persona**.
  Each writes its own explicit boolean flag in `metadata.enrichment`. No
  fallback heuristics — flag not `true` means the step needs to run.
- Two provider paths: LLM (Gemini or Anthropic via `resolveProviderForUser`)
  and embedding (Gemini or OpenAI via `resolveEmbedProviderForUser`).
  Anthropic doesn't offer first-class embeddings, so embedding is always a
  separate adapter call.
- Errors per step are non-fatal. A `runStep` wrapper catches each, stamps
  `metadata.enrichment.{last_error, attempts, last_attempt_at}` so the PICE
  chip and admin debug endpoint can tell "transient failure" from "never
  ran." Successful follow-up clears `last_error`.

---

## File map

| File | Role |
|---|---|
| `api/_lib/enrich.ts` | All five steps + three public entrypoints + four persona-management ops |
| `api/_lib/enrichFlags.ts` | Server-side `flagsOf(entry)` — single source of truth for "is this step done?" |
| `src/lib/enrichFlags.ts` | Client mirror (server is .js after build, client is bundled by Vite — duplication is cheaper than a shared package) |
| `api/_lib/extractPersonaFacts.ts` | Persona-step LLM call + identity context loader |
| `api/_lib/personaTools.ts` | Persona-fact insert + dedup-set helpers |
| `api/_lib/aiProvider.ts` + `resolveProvider.ts` | LLM provider resolution (BYOK vs platform) |
| `api/_lib/generateEmbedding.ts` | Standalone embedding helper used outside the pipeline (reuses same 768-dim shape) |
| `api/_lib/prompts.ts` | `SERVER_PROMPTS.CAPTURE` / `INSIGHT` / `ENTRY_CONCEPTS` |
| `src/components/EntryListBits.tsx:63` | `EnrichFlagChips` — admin-only P/I/C/E (and B for backfilled) chips on every card |
| `src/components/settings/AITab.tsx` | Run-now button, retry-failed button, clear-backfill button, recent-entries debug list |
| `api/entries.ts:775` | `handleEnrichDebug` — `GET /api/entries?action=enrich-debug` powers the AITab debug list |
| `api/user-data.ts:1326` | `handleCronDaily` invokes `enrichAllBrains()` |

---

## The five steps

### 1. parse — `stepParse` (`enrich.ts:182`)

Extracts structured fields (due_date, priority, energy, ...) from the entry
title + content via `SERVER_PROMPTS.CAPTURE` JSON-mode call. Two safeguards
that exist *because of past bugs*:

- **`USER_OWNED_KEYS`** (`status`, `scheduled_for`, `due_date`, `deadline`,
  `event_date`, `recurrence`, `day_of_week`, `day_of_month`) — AI is
  forbidden from writing these under any circumstance. Source of multiple
  "I edited X and it reverted" reports.
- **User-set wins** for non-owned keys. AI fills MISSING fields only; never
  overwrites a value the user already set.

Stamps `enrichment.parsed = true`. If the LLM returned unparseable output
**but** the entry has a title, still stamps `parsed=true` — without this,
short todos/events with empty content get stuck pending forever.

### 2. insight — `stepInsight` (`enrich.ts:228`)

One-line "what this is for" annotation. Stored at `metadata.ai_insight`.

Refusal detection — `REFUSAL_RE` matches "I cannot…", "without context",
etc. Got a refusal? Stamp the flag (don't loop) but don't store the refusal
as the insight. Length floor of 20 chars also rejects truncated noise.

### 3. concepts — `stepConcepts` (`enrich.ts:254`)

Returns `metadata.concepts: [{label, entry_ids?}]` — typically 0–5 short
labels per entry, validated against `ConceptResultSchema` (max 20). Powers
graph view, concept search, and merge-detect overlap scoring.

**Gotcha (recently fixed):** `concepts_extracted = true` only means "the
step ran without throwing." It does NOT mean concepts were stored. The LLM
can run, return `{concepts: []}`, and the flag flips. That's why
`enrichFlags.ts` exposes `has_concepts` (derived from `concepts.length > 0`)
as a separate signal — UI uses that for honest "is this enriched?"
rendering, while the pipeline gates on `concepts_extracted` for "should
we re-run?"

### 4. embed — `stepEmbed` (`enrich.ts:356`)

768-dim pgvector. The column is fixed at `vector(768)` so both providers
must return that exact shape:
- Gemini: `outputDimensionality: 768`
- OpenAI: `dimensions: 768` (only valid for `text-embedding-3-*`)

Length mismatch produces a silent PostgREST 400 on the PATCH that writes
the vector — without the explicit length check + thrown error here, the
row stays `embedding_status='pending'` forever. **This was a real bug.**

`fetchEmbedWithRetry` retries 429 / 503 with backoff `[500, 1500, 3500]ms`.
Without retry, a single Gemini free-tier 429 was permanently stamping
`embedding_status='failed'`.

`embedding_status='failed'` is **terminal** until manual retry — the
pipeline won't re-run automatically. Surfaces as the "E" chip in warn state
("embedding failed — won't appear in semantic search"). User retries via
Settings → AI → "Retry failed embeddings."

Empty content → stamp done (don't loop).

### 5. persona — `stepPersonaExtract` (`enrich.ts:416`)

The only step that *creates new rows*. Runs `extractPersonaFacts` against
the entry, gets back 0–N short third-person facts ("User wakes at 5:30",
"User runs Smash Burger Bar"), inserts each as a separate
`type='persona'` entry pointing back via `metadata.derived_from`.

Source entry's type/tags are NEVER touched. Only its metadata gets
`enrichment.persona_extracted = true`.

Skips:
- `type='persona'` self (recursion guard)
- `metadata.skip_persona === true` (chat tool path that already knows what
  it's writing — also strips the flag itself)

Three layers of dedup before insert:
1. **Title fast-path** — normalized title in `dedup.titles` set → reject.
   Catches word-for-word repeats even when the existing fact's embedding
   is missing.
2. **Cosine ≥ 0.85** vs every existing fact's embedding (`FACT_DEDUP_COSINE`).
   Lowered from 0.88 because the model emits very close paraphrases
   ("founder of X" vs "a founder of X") that 0.88 lets through.
3. **Same dedup set is mutated** as facts are inserted — the next entry in a
   batch sees newly-inserted facts. ⚠ **Critical:** batch callers must pass
   the SAME `precomputed.dedup` reference to every iteration. A spread copy
   silently breaks dedup across entries.

Empty extraction is a real answer — flag stamps regardless so the step
doesn't loop.

---

## Three triggers (when does enrichment actually run?)

### A. Capture-time inline

`enrichInline(entryId, userId)` — **awaited** at the end of `handleCapture`
(`api/capture.ts:293`) so the user's response includes the freshly-enriched
state. Vercel kills the function as soon as we respond, so fire-and-forget
would never resolve.

12+ entry-creation sites fire `enrichInline`:

| Site | Awaited? | Why |
|---|---|---|
| `api/capture.ts:293` | yes | User-facing response carries enriched state |
| `api/llm.ts:319, 369` | no (fire-forget) | Auto-create-entry from chat tool — chat already returned |
| `api/mcp.ts:655, 678` | no | MCP `createEntry` tool — the agent moves on |
| `api/v1.ts:227, 275` | no | API-key capture — ack first, enrich after |
| `api/entries.ts:335, 1045, 1123` | no | edit / merge / split — original response already sent |

`enrichInline` never throws to its caller — every step's failure is caught
internally and stamped on the entry. A surrounding `.catch(() => {})` is
defensive only.

### B. Daily cron — `enrichAllBrains` (`enrich.ts:1435`)

Fires from `handleCronDaily` at 04:00 UTC (GitHub Actions schedule, see
`.github/workflows/cron-daily.yml`). Walks every brain in `public.brains`,
calls `enrichBrain(owner_id, id, batchSize=50, perBrainBudget)` for each.

Time-budget split:
- **Per-run budget**: 240 s wallclock total
- **Per-brain budget**: `min(remaining_run_budget, 60 s)` — one chatty brain
  can't starve the others
- Bails when `remaining < 5 s` — not enough left to make progress

The previous `batchSize=3` left free-tier users permanently behind. 50 is
the new default; 50 entries × ~4 LLM calls + 1 embed = real wallclock, hence
the budget guard.

### C. Run-now — Settings → AI → "Run now"

`enrichBrain(userId, brainId, batchSize=50)` via
`POST /api/entries?action=enrich-now`. Background-task UI in `AITab.tsx`
(via `useBackgroundOps`) polls and surfaces processed/remaining counts.

Two adjacent buttons in the same tab:
- **Retry failed embeddings** — clears `embedding_status='failed'` →
  triggers re-run (terminal-failed entries are skipped by the normal
  pending filter, so they need an explicit clear)
- **Clear backfill flag** — strips `metadata.enrichment.backfilled_at` so
  the "B" chip stops showing. Diagnostic-only, no actual re-enrichment.

### D. Other call-sites of `enrichBrain`

| Site | Batch | Why |
|---|---|---|
| `api/transfer.ts:140` | 30 | After importing a brain dump |
| `api/mcp.ts:691` | 10 | MCP `enrichBrain` tool (rate-limited) |
| `api/entries.ts:543, 931` | varies | Bulk re-enrich endpoints |

---

## The flag model

`metadata.enrichment` is the only authority. Both `flagsOf` modules read
from there and surface the booleans. Schema lives in
`api/_lib/enrichFlags.ts`:

```ts
interface EnrichmentFlags {
  parsed: boolean;
  has_insight: boolean;
  concepts_extracted: boolean;   // step ran
  has_concepts: boolean;          // ≥1 concept stored — derived
  concepts_count: number;         // exact count — derived
  embedded: boolean;              // embedding_status='done' or embedded_at non-null
  embedding_status: "done" | "pending" | "failed" | null;
  backfilled: boolean;            // stamped by silence-the-dot backfill, not real
}
```

Persona-row exception: when `entry.type === 'persona'`, `parsed`,
`has_insight`, `concepts_extracted`, and `has_concepts` all return `true`
unconditionally. Persona facts are tiny single-sentence rows — trying to
"enrich" "User wakes at 5:30" wastes Gemini calls and renders red chips
forever. Embedding still applies normally.

Client mirror at `src/lib/enrichFlags.ts` is intentionally identical. Two
files exist because the server compiles to .js and the client is Vite-
bundled — a shared package would mean a build-step dependency for both. Keep
them in sync by hand.

`isPendingEnrichment(entry)` (client only) is the helper that drives the
pulsing "enrichment dot" on cards: returns `true` if any LLM step is missing
**or** embedding is pending (not failed). Used by `EntryList` to render the
breathing indicator.

---

## Error breadcrumbs (`runStep`)

The 2026-04-29 refactor wrapped each step in this:

```ts
const runStep = async (name, fn) => {
  try {
    const next = await fn();
    if (next) { workingMeta = next; changed = true; }
  } catch (err) {
    stepErrors.push(`${name}: ${err.message.slice(0, 200)}`);
    console.error(`[enrich:${name}]`, entryId, msg);
  }
};
```

After the steps run, if `stepErrors.length > 0`:

```ts
metadata.enrichment.attempts          += 1
metadata.enrichment.last_attempt_at    = new Date().toISOString()
metadata.enrichment.last_error         = stepErrors.join(" · ").slice(0, 500)
```

Successful run with no errors clears `last_error` and updates
`last_attempt_at` so a recovered entry isn't tagged with stale failure
context.

This is what makes the diagnostic UI honest. Before the refactor, a single
step throwing aborted the rest silently and left
`metadata.enrichment === null` — admins couldn't tell "transient 429" from
"never ran." Now the PICE chips render the actual state and the admin debug
endpoint surfaces `last_error` per recent entry.

---

## Diagnostic surfaces

### PICE chips (`EnrichFlagChips`)

Admin-only. Four 14×14px monospace letter chips per card:

| Letter | Source | Green | Amber | Red |
|---|---|---|---|---|
| P | `flags.parsed` | true | — | false |
| I | `flags.has_insight` | true | — | false |
| C | `flags.has_concepts` / `flags.concepts_extracted` | has_concepts | extracted but 0 | not extracted |
| E | `flags.embedded` / `flags.embedding_status` | embedded | failed (warn) | pending |

A 5th chip ("B" green) appears for entries flagged by the
silence-the-dot backfill — surfaces "this isn't really enriched, it was
just stamped quiet."

### `GET /api/entries?action=enrich-debug` (`entries.ts:779`)

Admin-only. Returns:
- `providers.{gemini, anthropic, gemini_model}` env state
- `counts` — total / secrets / missing_parsed / missing_insight /
  missing_concepts / missing_embedding / failed_embedding / fully_pending /
  backfilled
- `recent` — top 12 entries ranked by missing-flag count desc, each with
  full `flags` plus `last_error / attempts / last_attempt_at` from the run
  breadcrumbs

The ranking change (missing-count desc rather than created_at desc) is what
made this useful — chronological ordering buried the actual outliers under
fresh fully-enriched rows.

Surfaced in `AITab.tsx` as "Top {N} most-unenriched · server time {…}" — the
admin sees stuck entries first, with their last_error visible inline.

---

## Persona-management ops (separate from the pipeline)

Four public exports in `enrich.ts` that operate on persona rows produced by
`stepPersonaExtract`. None of them re-run the main pipeline.

| Function | Purpose | When to use |
|---|---|---|
| `backfillPersonaForBrain` (line 824) | Run only `stepPersonaExtract` over every entry that's missing the flag | New user with 200 existing entries — drains in seconds vs waiting on daily cron |
| `wipeExtractedPersonaForBrain` (line 1017) | Hard-delete auto-extracted persona rows + clear `persona_extracted` from sources | Updating the extractor prompt; want a fresh re-scan |
| `revertBackfilledPersonaForBrain` (line 902) | First-iteration cleanup — flips entries that got `type='persona'` (the old buggy backfill) back to inferred original type | One-time migration; idempotent re-run finds zero rows |
| `auditPersonaForBrain` (line 1108) | Re-scores active persona facts vs current rules: dedup, rejected-pattern (cosine ≥ 0.85), core-profile (cosine ≥ 0.72), distilled rules (LLM bulk-classify) | Periodic cleanup — scan adds, audit reviews |

Protected from audit/wipe under all circumstances:
- `metadata.pinned === true`
- `metadata.skip_persona === true`
- `metadata.source ∈ {manual, chat}` — user-confirmed origin

A father and a brother who share a name → same embedding, both stay (the
audit's "winner pool" seeds protected rows first so auto-extracted dups
dedupe against them, but protected rows can never be the loser).

---

## Provider resolution

```
resolveProviderForUser(userId)         → llmCfg or null
resolveEmbedProviderForUser(userId)     → embedCfg or null
```

LLM goes through `callAI(cfg, prompt, input, opts)`. Embedding bypasses
`callAI` because Anthropic has no first-class embedding model — so
`generateEmbedding` switches on `embed.provider` directly and hits
Gemini's `:embedContent` endpoint or OpenAI's `/v1/embeddings`.

`resolveProviderForUser` checks BYOK keys first (`anthropic_key`,
`openai_key`, `gemini_key` on `user_ai_settings`), falls back to the
server's `GEMINI_API_KEY` for free-tier users.

Failures here are tracked too: `stepErrors.push(\`provider: …\`)` if
`resolveProviderForUser` throws. The entry then stamps a `last_error` like
`"provider: BYOK key invalid"` — admin sees it in the debug endpoint.

---

## Recent changes worth knowing

- **2026-04-29**: `runStep` wrapper added. Per-step errors now stamp
  `last_error/attempts/last_attempt_at` instead of being swallowed.
  Successful follow-up clears `last_error`.
- **2026-04-29**: `enrichBrain` batchSize 3 → 50 + 240s time-budget guard.
  Daily cron now keeps up with users capturing 10–30/day on free-tier
  Gemini.
- **2026-04-29**: `has_concepts` flag added (derived from `concepts.length`).
  `concepts_extracted` kept as the pipeline gate; `has_concepts` drives the
  honest UI. C chip renders amber when extracted but empty.
- **2026-04-28**: USER_OWNED_KEYS guard added to `stepParse`. Re-enrichment
  no longer overwrites user-edited dates / status.
- **`stepEmbed`** now throws on PATCH failure (rather than swallowing) so
  dim mismatch / RLS rejection / schema drift can't leave the row at
  `pending` forever.
- **Embedding retry** with `[500, 1500, 3500]ms` backoff added to
  `fetchEmbedWithRetry`. One 429 no longer terminally fails an entry.

---

## Known limitations / future work

- **`concepts_extracted` is pipeline-gate only** — true after one run even
  if zero concepts were stored. Re-running won't try again. User has to hit
  Run-now (which runs every step whose flag isn't set, and `concepts_extracted`
  IS set), or admin has to manually clear the flag in SQL.
- **No retry budget** for LLM failures — `runStep` catches and moves on, but
  doesn't track per-step retry count. Five consecutive 429s on parse looks
  identical to one 429 in `last_error`. `attempts` counts whole-pipeline
  retries, not per-step.
- **Embedding-failed is terminal**. The user must explicitly hit "Retry
  failed embeddings" in Settings → AI. Daily cron skips them. Reasonable
  default (don't retry forever) but the user has no way to know an entry
  needs the retry until they look at the C/E chips.
- **Persona dedup is per-brain**. A fact already extracted in personal
  brain gets re-extracted into a side brain. Cross-brain dedup would need
  the dedup set to span brains, which is a deliberate architectural split
  (brains are isolation boundaries).
- **`auditPersonaForBrain` Phase 4** (LLM rules pass) sends candidate facts
  to Gemini in one call. ~100 candidates fit in 600 max tokens; bigger
  brains either truncate or need pagination — not yet wired.
- **Client mirror drift risk**. Two `flagsOf` files. They're tiny but
  diverging is silently bad — the chip and the pipeline disagree about
  what's "done." Worth a unit test that imports both and runs them on
  fixtures.

---

## Phase 2A — queue state, daily quota, claim worker (2026-05-06)

Shipped commit `beecc65`. Migrations `081_enrichment_queue.sql` +
`082_recompute_enrichment_state.sql`. Full design in
**[`Specs/enrichment-queue-v1.md`](../Specs/enrichment-queue-v1.md)**.

What changed in `enrich.ts`:

- **`enrichInline` now stamps `enrichment_state`**. At entry: `processing`
  + `locked_at = now()`. At exit: calls `recompute_enrichment_state(uuid[])`
  RPC which inspects metadata flags + embedding_status and writes the
  correct final state (`done` / `pending` / `failed`).
- **Quota gate** (`api/_lib/enrichQuota.ts`) — every enrichInline call
  consumes one daily credit unless the user is pro/max (unlimited
  sentinel). Free=20/day, starter=200/day. Over-quota entries get marked
  `quota_exceeded` and skipped. Fail-OPEN on infra error so a Supabase
  blip can't freeze the pipeline.
- **`enrichBrain` switched to claim RPC**. `claim_pending_enrichments
  (user_id, brain_id, limit)` does `FOR UPDATE SKIP LOCKED` against the
  partial state index — concurrent crons can't double-process. Stale
  `processing` rows (locked >5min) auto-recover. After bulk embed, calls
  `recompute_enrichment_state(claimed_ids)` to converge state.
- **Backward compatible.** Every existing call site of `enrichInline`
  works the same way. Quota is the only behavior change, and only for
  free-tier users exceeding 20/day.

State distribution after deploy: 329 done, 0 pending. Worker drains
within an hour. Foundation ready for Phase 2B (async capture / fire-fast)
when needed.
