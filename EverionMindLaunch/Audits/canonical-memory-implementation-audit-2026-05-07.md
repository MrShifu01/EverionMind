# Canonical Memory — Spec vs Implementation Audit (2026-05-07)

**Source spec:** `CanonicalMemory.md` (root, 2122 lines, 43 sections)
**Built equivalent:** `important_memories` (migration 062) + `/api/important-memories` + `ImportantMemoriesView.tsx`
**Verdict:** ~15-20% built. Shell only. AI reconciliation engine + Ask Everion retrieval injection are absent. Deliberate v0 scope per `LAUNCH_CHECKLIST.md:1251-1258`.

---

## Phase-by-phase coverage (spec §33)

| # | Phase | Status | Evidence |
|---|---|---|---|
| 1 | Database (4 tables) | **partial — 1 of 4** | `migration 062` only ships `important_memories`. Missing `memory_reconciliation_queue`, `memory_review_items`, `memory_events`. |
| 2 | Queue hook | **not built** | `api/_lib/enrich.ts` has zero memory-side write |
| 3 | Worker (`process-memory-reconciliation`) | **not built** | no cron, no claim-loop, no retry semantics |
| 4 | Candidate filter | **not built** | `shouldConsiderForCanonicalMemory()` does not exist |
| 5 | Related memory search | **not built** | `findRelatedCanonicalMemories()` does not exist |
| 6 | LLM reconciliation | **not built** | no Zod schema, no prompt, no provider call |
| 7 | Deterministic write layer | **not built** | `applyMemoryDecision()` does not exist |
| 8 | UI: Important Memories | **done** | `ImportantMemoriesView.tsx`, `MemoryHeader.tsx`, `MemoryContext.tsx`, "Keep this" promote in `DetailModal.tsx:209-229`, filter chips, edit/retire/restore |
| 9 | UI: Needs Review | **not built** | no review table → nothing to render |
| 10 | Retrieval integration | **not built** | `retrievalCore.ts` / `promptContext.ts` / `llm.ts` do not query `important_memories`. Tracked as v0b in `LAUNCH_CHECKLIST.md:1251` |
| 11 | Suggested actions | **not built** | obligations have no reminder bridge |
| 12 | Tests | **partial** | `importantMemory.test.ts` slug unit, `important-memories.spec.ts` e2e CRUD happy path. No reconciliation/RLS/queue/idempotency tests. |

---

## Schema gap on the one shipped table

`important_memories` (migration 062) vs spec §5.1 `canonical_memories`:

| Spec column | Built? | Gap impact |
|---|---|---|
| `confidence numeric` | ❌ | thresholds (0.85/0.65/0.92) impossible — gate of write rules |
| `importance numeric` | ❌ | retrieval ranking impossible |
| `embedding vector(1536)` | ❌ | similarity dedupe impossible — spec §14, §23 dead |
| `structured_data jsonb` | ❌ | obligation dates, person facts have nowhere to live |
| `supersedes_memory_ids[]` / `superseded_by_memory_id` | ❌ | merge/retire chain impossible — spec §20 |
| `requires_review boolean` | ❌ | sensitive-data gate impossible — spec §19.2 |
| `last_seen_at` / `last_confirmed_at` | ❌ | reinforcement loop impossible — spec §21 |
| `archived_reason text` | ❌ | no audit trail on retire |
| `source_enrichment_ids[]` | ❌ | only entry-side traceability, not enrichment-side |
| `created_by` / `updated_by` extended actors | ❌ | only `'user' \| 'system'` — no `review_acceptance` / `import` / `llm_reconciliation` |
| `type` enum | partial | 4 values vs spec's 7 (missing `person`, `project_context`, `business_context`, `life_fact`, `pattern`; built has `decision` which spec lacks) |

Decision pending: rename to `canonical_memories` when AI layer lands, or rewrite spec to match `important_memories`. Current naming drift hurts grep + onboarding.

---

## What does ship today (v0)

- `important_memories` table — `active|retired`, soft-delete, unique-active key by `(brain_id, memory_key)`, GIN on `source_entry_ids`, RLS by `user_id`
- `/api/important-memories` GET/POST/PATCH/DELETE — rewrite via `api/user-data.ts:891-1090`
- "Keep this" entry-promote flow — `DetailModal.tsx:209-229`
- Listing + type-filter chips + edit/retire/restore — `ImportantMemoriesView.tsx`
- Feature flag `VITE_FEATURE_IMPORTANT_MEMORIES` — `featureFlags.ts:21-25`
- e2e — `important-memories.spec.ts` (shipped 2026-04-29)
- Brain boundary — every query passes `brain_id`; RLS gates on `user_id`

---

## Findings

### HIGH

**H1 — Memories invisible to chat.** No retrieval injection. User curates a fact; Ask Everion never sees it. Largest functional gap. Patch: ~50 lines in `systemPromptBuilder.ts` + getter in `retrievalCore.ts`. Tracked: `LAUNCH_CHECKLIST.md:1251` (v0b).

**H2 — No audit log on memory mutations.** Spec §5.5 calls `memory_events` "critical." Today: zero traceability. User edits / retires / system creates leave no trail. Audit-log discipline elsewhere in the app does NOT cover `important_memories`.

**H3 — Source-entry orphans on delete.** Entry hard-delete does not scrub UUIDs from `important_memories.source_entry_ids`. GIN index exists but no cleanup. Tracked: `LAUNCH_CHECKLIST.md:1254`.

### MEDIUM

**M1 — Naming drift.** Spec engineering name `canonical_memories`. Built `important_memories`. User-facing matches spec. Forces grep across both terms; new contributors confused.

**M2 — No export.** `/api/transfer` excludes `important_memories`. Compliance + portability gap. Tracked: `LAUNCH_CHECKLIST.md:1256`.

**M3 — 409 has no UI affordance.** Unique-active constraint fires; UI shows raw error. Spec §29 calls for side-by-side "keep both / retire old / cancel." Tracked: `LAUNCH_CHECKLIST.md:1253`.

**M4 — No provenance UI.** Spec §28 "View Sources" is a trust requirement. Built UI does not link memory → source entries.

### LOW

**L1 — Type set drift.** Built `decision` not in spec; spec `person`/`pattern`/`life_fact`/`project_context`/`business_context` not built.

**L2 — Memory key collision risk in slug logic.** `generateMemoryKey()` slices to 80 chars + strips diacritics — long titles with shared 80-char prefix collide. Edge case; no test.

**L3 — No embedding column.** Future v1 soft-merge (`LAUNCH_CHECKLIST.md:1258`) needs schema migration before it lands.

---

## Recommendation

Spec is the post-launch "final boss." Pre-launch ordering:

1. **v0b retrieval injection** (H1) — biggest user-visible win, no AI cost
2. **Source-entry delete sync** (H3) — data hygiene, ~1 trigger
3. **Audit log on memory mutations** (H2) — extend existing `audit_log` rather than building `memory_events` table now
4. **Export inclusion** (M2) — compliance
5. **Defer phases 2-7 + 9 + 11** to post-launch v1, gated by usage data: only build the AI engine if v0 user-curated traffic is high enough to justify it.

Catalogue this audit as a recurring `canonical-memory-pipeline-audit` (section B) once the AI layer ships. Until then, spec ↔ build gap re-audit yearly or on roadmap revision.

---

## Resolution

**Findings deferred:** all (H1, H2, H3, M1-M4, L1-L3) — none addressed in this pass. This audit is a status reconciliation, not a fix sprint. Lifted to `LAUNCH_CHECKLIST.md` post-launch section (entries already exist for H1/H3/M2/M3/L3; H2/M1/M4/L1/L2 to be appended in next checklist update).

**Catalogue:** added new row `canonical-memory-pipeline-audit` to AUDIT-CATALOGUE.md section B as a future pipeline audit (cadence 🟢 quarterly post-launch, currently dormant — subsystem doesn't exist yet).
