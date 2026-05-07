# Enrichment Pipeline — Comprehensive Audit (2026-05-06)

## Resolution Update — 2026-05-07

Implemented and verified in the current working tree:

- [x] **S-01 / E2E-01** Removed Gemini API keys from Google AI request URLs.
  Added `api/_lib/googleAi.ts` and routed Gemini generation, embedding,
  batch embedding, model-list, concept-graph, feedback, Gmail classifier,
  persona extractor, and distillation calls through `x-goog-api-key` headers.
  Verification: `rg` for `generativelanguage.googleapis.com.*?key=` and
  `generateContent?key=` returned no matches.
- [x] **T-02 / E2E-04** Changed metered enrichment quota checks from
  fail-open to fail-closed. Quota RPC failures now leave entries pending
  instead of consuming unmanaged LLM spend.
- [x] **T-04** Wrapped `entries.ts` audit LLM `JSON.parse` in a try/catch so
  malformed model output returns an empty batch result instead of crashing the
  audit endpoint.
- [x] **S-05 / E2E-06** Hardened Gmail accept/reject distillation with explicit
  injection-defense instructions, untrusted-data delimiters, and control-character
  sanitization before learned rules are generated.
- [x] **E2E-08** Clamped `GMAIL_CRON_SCAN_CONCURRENCY` to an integer range
  of `1..10`, defaulting to `3` on invalid env input.
- [x] **E2E-09** Cross-brain move now clears context-dependent enrichment
  metadata and forces destination-brain insight/concept regeneration.
- [x] **E2E-11** Persona extraction now loads confirmed/rejected context from
  the user's personal brain before writing extracted facts there.
- [x] **E2E-12** Batch embedding responses now validate vector count and
  768-dimensional vectors before returning them to callers.

Verification run:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — passed, 80 files / 560 tests.

Deferred items were lifted to `EverionMindLaunch/LAUNCH_CHECKLIST.md` under
`Enrichment Audit Deferrals — 2026-05-07`.

---

Single-document consolidation of the security, stability, architecture, and UX audits performed against the Everion Mind enrichment pipeline. Scope: every code path that ingests external input and feeds enrichment — `/api/capture`, `/api/entries` (CRUD + bulk + audit + persona + distill), `/v1`, `/api/mcp`, `/api/llm` (chat + split + transcribe + extract-file), Gmail sync/distill, crons, manual auto-enrich button — plus the supporting layers (brain access, retrieval, embedding, persona, schema/RLS, security headers, observability, prompts).

The system is days from public launch with target audience in the thousands. Findings are graded for that bar.

**Severity scale**
- **P0** — launch-blocker: data leak, auth bypass, exploitable, hot-path crash, dataloss, wrong-data shown.
- **P1** — must fix soon: abuse vector, silent corruption, observability/audit gap, integration silent-fail, noticeable UX friction.
- **P2** — polish, defence-in-depth, future-proofing.

---

## Executive summary

| Category | P0 | P1 | P2 | P3 | ID prefix |
|---|---|---|---|---|---|
| Security | 5 | 9 | 6 | — | `S-` |
| Stability | 5 (3 resolved 2026-05-06; 2 partial) | 12 | 6 | — | `T-` |
| Architecture | 3 (1 resolved 2026-05-06) | 11 | 7 | — | `A-` |
| UX | 3 (1 resolved 2026-05-06) | 17 | 7 | — | `U-` |
| Workflow E2E | 1 | 5 | 5 | 2 | `E2E-` |
| **Total findings** | **17** (11 still-open after hardening) | **54** | **31** | **2** | |

Several P0s overlap categories. The de-duplicated still-open launch-blocker set is **8 root causes** post-2026-05-06 hardening, listed below. Resolved items moved to a "Resolved on 2026-05-06" subsection so the audit history stays navigable.

### P0 launch-blocker set (de-duplicated, in fix-order)

1. **S-01 — Gemini API key in URL query string** (`aiProvider.ts`, `enrich.ts`, `gmailScan.ts`, `distillGmail.ts`, `distillRejected.ts`, `extractPersonaFacts.ts`, `generateEmbedding.ts`, `retrievalCore.ts`, `providers/gemini.ts`, `entries.ts`, `feedback.ts`, `user-data.ts`). Logs exfil the key.
2. **S-02 / A-03 — Service-role headers used for every entry write; RLS bypassed**. Lint guards key location (`scripts/check-service-role-headers.mjs`) but the write pattern still bypasses RLS.
3. **S-04 — Admin endpoints gated only on JWT `app_metadata.is_admin`, no DB verification**. JWT compromise = full admin session.
4. **S-05 / E2E-06 — Distillation prompts feed unfiltered email content to Gemini** (`distillGmail.ts:96–125`) without the INJECTION DEFENSE wrapping used elsewhere. Long-term learning loop poisoning.
5. **T-01 / E2E-03 — No `AbortController`/timeout on any enrichment `fetch()`**. Hung upstream = hung user request, up to platform timeout.
6. **T-02 / E2E-04 — Quota gate fails OPEN on RPC error** (`enrichQuota.ts:81–102`). Outage = uncapped LLM spend.
7. **A-02 / S-06 — Audit-log coverage missing on `/v1/*` and all MCP write tools**. No forensic trail under public-API or MCP key compromise.
8. **U-02 / U-03 — Calendar and Gmail integrations silent-fail on token refresh**. No user-visible reconnect prompt.

### Resolved on 2026-05-06 (verified in current working tree)

- ~~A-01 / T-05 / U-01~~ — **MCP `create_entry` and `update_entry` now await `enrichInline`** (`api/mcp.ts:744–749, 778`). Hardening note in code: "AWAIT enrichInline so the MCP tool returns a fully-enriched [...]". The orphan-entry hole is closed for MCP single-entry writes.
- ~~T-03 (single path)~~ — **`generateEmbedding` now validates 768 dims** (`api/_lib/generateEmbedding.ts:74 if (values.length !== 768)`). Single-entry path guarded. Batch path (`generateEmbeddingsBatch`) still unverified — see **E2E-12** below.
- Service-role usage centralized to `api/_lib/sbHeaders.ts` and `api/_lib/oauthState.ts` (allowlist in `scripts/check-service-role-headers.mjs:6–8`); CI lint blocks new offenders. The RLS-bypass concern (S-02 / A-03) is the architectural pattern, not the file location — still open.

### Still-open P0 set after today's hardening

- **T-04** — `JSON.parse` of LLM output in `entries.ts handleAudit:585` without try/catch.

The single highest-leverage architectural lift is **A-04 — move enrichment behind a Vercel Queue**. It eliminates A-01, T-01, T-06, U-06 simultaneously; was previously blocked by Vercel's serverless background-task limitation, but Vercel Queues GA'd in 2025 and Fluid Compute supports `waitUntil`.

### Strong areas confirmed
- AES-256-GCM token encryption (`gmailTokenCrypto.ts`), per-namespace key derivation via scrypt, random 12-byte IVs per encrypt, no static nonces.
- OAuth state with HMAC-SHA256 + 16-byte nonce + 10-min TTL + timing-safe verification (`oauthState.ts`).
- Robust prompt INJECTION DEFENSE blocks across `prompts.ts` (CAPTURE, INSIGHT, CONCEPTS) — explicit "literal content" framing with `<user_entry>` tags.
- Vault per-brain RLS (migration 079); concept-graph excludes `type='secret'` entries (`retrievalCore.ts:540–542`).
- Recursion-free brain-share RLS via SECURITY DEFINER helpers (`is_brain_owner`, `is_brain_member`, mig 069).
- Service-role linter (`scripts/check-service-role-headers.mjs`) gates direct service-role usage.
- Persona-fact privacy boundary (always written to + read from personal brain, `buildProfilePreamble.ts:133–141`).
- CSP without `unsafe-eval`; HSTS preload-eligible; X-Frame-Options DENY; minimal Gmail scopes (`gmail.readonly` + `userinfo.email`).
- PII redaction in logger (`logger.ts`) on key/token/secret/email regex with depth-cap to 4.
- Cron auth uses timing-safe bearer comparison.
- Robust dedup primitives: `claim_pending_enrichments` RPC with `FOR UPDATE SKIP LOCKED`; `expiry_notification_log` UNIQUE constraint; idempotency-key reserve/replay/in-flight state machine; `entries_contact_email_uniq` partial index for contact dedup.

---

## End-to-end workflow

The pipeline has 11 logical stages. This section traces an entry from arrival to retrievable, calling out every component in scope, with file:line refs for navigation. Findings cited inline are detailed in their respective sections below.

### Stage 0 — Authentication

Three auth surfaces feed enrichment. Each resolves to `{ userId, brainId? }` before any handler runs.

- **User JWT** — browser/PWA sessions. `withAuth()` (`api/_lib/withAuth.ts`) wraps `verifyAuth()` (`api/_lib/verifyAuth.ts`), which validates the Supabase JWT and pulls `sub` → `userId`, plus `app_metadata` for tier and admin status. Used by `/api/capture`, `/api/entries`, `/api/llm`, `/api/transfer`, `/api/calendar`, `/api/search`, `/api/memory`.
- **`em_*` API key** — public REST + MCP. `withApiKey()` in `api/v1.ts` and `resolveApiKey()` in `api/_lib/resolveApiKey.ts` look up the SHA-256 hash against `user_api_keys` table; resolves to `{ userId, keyId, brainId }`. Each key is bound to a single brain (per-key brain scope). Pre-auth rate-limit at 150/min/IP (S-15) before validation.
- **`mcp_*` signed token** — short-lived MCP session token. `verifyMcpAccessToken()` in `api/mcp.ts:45–56` validates HMAC-SHA256 signature, 24h expiry. Issued via `?_oauth=token` (lines 612–623) on top of an `em_*` key.
- **Cron bearer** — `verifyCronBearer()` in `api/_lib/cronAuth.ts:1–25`. Single shared `CRON_SECRET` env, timing-safe comparison. No nonce/timestamp (S-10).

After auth, every handler reads:
1. **Tier** — `fetchUserTier()` (`enrichQuota.ts`) → `user_profiles.tier` (`free | starter | pro | max`).
2. **BYOK provider keys** — looked up in `user_settings.providers` for Anthropic/OpenAI/Gemini/OpenRouter.
3. **Brain access** — for any operation that takes a `brain_id`: `requireBrainAccess()` or `requireBrainRole()` (`api/_lib/checkBrainAccess.ts:17–38`). Returns `{ role: 'owner' | 'member' | 'viewer' }`. Owner derived from `brains.owner_id`; members live in `brain_members`.

### Stage 1 — Entry arrival

The 8 entry-creation surfaces, listed in the [Entry-point matrix](#entry-point-matrix-architectural-baseline) below. Behaviour diverges per surface — that divergence is A-01, A-02, S-06.

| Path | What it does |
|---|---|
| `POST /api/capture` (`api/capture.ts handleCapture:236–305`) | Validates body (hand-rolled, hard caps: 500-char title, 200k-char content, 50 tags, 64KB metadata, 5 extra brain IDs). Inserts via service-role headers (S-02). `Idempotency-Key` reserve (24h TTL). Awaits `enrichInline`. Audit log + streak + merge-detect fired async. |
| `POST /api/capture?action=links` | Link batch ingestion. `requireBrainAccess`. **No enrichment trigger, no audit log.** |
| `PATCH /api/entries` (`api/entries.ts handlePatch:219–385`) | Edit existing entry. Reads entry without `user_id` filter (S-03). `requireBrainRole` for source + dest brain. Awaits `enrichInline` if title/content changed. |
| `POST /api/entries?action=enrich-batch` (line 689–698) | Manual auto-enrich. Calls `enrichBrain(userId, brainId, batchSize≤50)`. No per-brain rate limit beyond 30/min (U-04). |
| `POST /api/entries?action=merge` → `mergeEntriesOneShot()` (`mergeEntries.ts:478–490`) | Validates 2–8 same-brain non-vault entries. `generateMergePreview` LLM-synthesizes merged fields. `commitMerge` inserts merged entry + awaits enrichment with **60s timeout** (line 421–435), falls back to `enrichment_pending=true` (U-15). Soft-deletes sources. |
| `POST /api/entries?action=move` | Cross-brain move clears `embedded_at` + `embedding_status='pending'`, then awaits `enrichInline`. **Does NOT clear `metadata.enrichment.concepts_extracted` / `insight` flags**, so concepts and insight from source-brain context survive into destination (E2E-09). |
| `POST /v1/ingest` (`api/v1.ts handleIngest:145–234`) | API-key path. Quota check via `checkAndIncrement(captures)`. Generates embedding inline if `GEMINI_API_KEY`. Awaits `enrichInline`. **No audit log** (S-06). |
| `POST /api/mcp tools/call create_entry` (`api/mcp.ts:744–749`) | MCP tool. Generates embedding inline. **Awaits `enrichInline`** (post-2026-05-06 hardening). |
| `POST /api/mcp tools/call update_entry` (`api/mcp.ts:778`) | MCP tool. **Awaits `enrichInline`** (post-2026-05-06 hardening). |
| `POST /api/llm?action=chat` create_entry tool (`api/llm.ts:302–355`) | Chat-tool path. Awaits `enrichInline` (line 351). Tool-call audit log via `auditToolCalls`. |
| `POST /api/llm?action=split` (`api/llm.ts:670–693`) | Server-side LLM split prompt → `parseServerEntries()` returns array. **No insert.** Client must POST each. No cap on returned count (S-17). Contract is implicit — no server-side split-and-save action (E2E-18). |
| Gmail sync (`gmailScan.ts persistMatches:1262–1520`) | Cron + manual. Inserts entries with `status='staged'` or `'active'` per pattern verdict. **Detached fire-and-forget embedding PATCH on staged rows; auto-accept spawns unawaited IIFE that runs attachment extraction + `enrichInline`** (E2E-05). Embedding can complete while parse/insight/concepts/persona state is still null. |

Idempotency layer: `Idempotency-Key` header → `api/_lib/idempotency.ts` reserve/replay/in_flight state machine. 24h TTL. 1% probabilistic cleanup (T-10).

Rate-limit layer: `api/_lib/rateLimit.ts` Upstash Redis sliding window. Per-IP + per-user + per-action buckets. Fail-CLOSED in production if Upstash absent. Circuit breaker after 3 consecutive Upstash failures (5-min closed).

### Stage 2 — Quota gating

Two quota surfaces, both gated tier-aware.

- **`enrichQuota.ts checkAndConsumeQuota`** (lines 81–102) — daily LLM-call quota gating `enrichInline`. Limits: free=20/day, starter=200/day, pro/max=unlimited. Persona-typed entries skip the gate (T-16). RPC `consume_enrich_quota` assumed atomic but unverified (T-08). **Fails OPEN on RPC error** (T-02).
- **`usage.ts checkAndIncrement`** — monthly per-action quota for chats/captures/voice/improve. Used by `/v1/ingest`, `/api/memory/retrieve`. Free tier always rejected. BYOK bypasses limits.

Embedding generation has no separate quota (T-16) — abuse vector via persona-fact spam.

### Stage 3 — Brain scoping (personal vs shared)

Multi-brain model. Every entry has `brain_id`.

- **Personal brain** — auto-resolved via `getPersonalBrainId()` (`api/_lib/personalBrain.ts:26–42`). 60s TTL cache. Filter: `brains?owner_id=eq.{userId}&is_personal=eq.true`. Critical: persona facts **always** live here regardless of active brain (`buildProfilePreamble.ts:142, personaTools.ts:242`).
- **Shared brains** — `brains.is_personal=false`. `brain_members` table holds non-owner members with role `member`/`viewer`. RLS enforced via SECURITY DEFINER helpers `is_brain_owner`, `is_brain_member`, `is_brain_member_with_role` (mig 069 — recursion-free).
- **Brain-bound API keys** — `em_*` keys are pinned to a single brain at creation; `keyId → brainId` resolved in `resolveApiKey`.
- **Profile preamble privacy boundary** (`buildProfilePreamble.ts:81–236`) — full core (family, habits, About-Me) injected only when `isOwnPersonalBrain=true`. Name + pronouns leak to shared brains (intentional, documented). Persona facts always read from personal brain (lines 133–141, 145–159).
- **Vault per-brain** (mig 079) — vault entries scoped to a specific brain. Concept graph excludes `type='secret'` (`retrievalCore.ts:540–542`). Locked secret titles disclosed via `findLockedSecretTitles` (titles only, no content).

### Stage 4 — Provider resolution

`api/_lib/resolveProvider.ts:79–136` selects the LLM provider per call.

Priority order:
1. **BYOK**: anthropic > openai > gemini > openrouter. User keys win.
2. **Managed Gemini** for starter/pro/max tiers (per current pivot in lines 117–124 — Anthropic gated until `ANTHROPIC_API_KEY` validates; S-08).
3. **Free tier returns null** → no enrichment. Entry sits with `enrichment_state='pending'`.

`forChat=true` selects `proChatModel` vs `proModel` (`providers/select.ts:64–84`).

Default models (`resolveProvider.ts:31–34`): anthropic `claude-haiku-4-5-20251001`, gemini `gemini-2.5-flash`, openai `gpt-4o-mini`, openrouter `openai/gpt-4o-mini`.

Stale model risk: `providers/select.ts:46` fallback `claude-sonnet-4-6` does not match any current Anthropic model (S-08).

### Stage 5 — Enrichment core

`api/_lib/enrich.ts enrichInline(entryId, userId, opts?)` runs sequentially:

1. **`stepParse`** — extract structured metadata (type-specific). Prompt `prompts.ts CAPTURE` (lines 3–38) with INJECTION DEFENSE (line 5–6). Salvages malformed JSON via `[ ... ]` regex match (line 75–96).
2. **`stepInsight`** — generate `metadata.summary`. Prompt `prompts.ts INSIGHT` (lines 40–46) wraps user content in `<user_entry>` tags with INJECTION DEFENSE.
3. **`stepConcepts`** — extract `metadata.concepts[]` for graph linkage. Prompt similarly framed.
4. **`stepEmbed`** — `generateEmbedding()` (`generateEmbedding.ts:1–100`). Model `gemini-embedding-001`, 768-dim, 8000-char truncation (T-09). Retry [500, 1500, 3500ms] on 429/503. **No dim validation on write** (T-03).
5. **`stepPersonaExtract`** (`enrich.ts:475–545`) — extracts 0..N persona facts. **Always written to personal brain** (line 518). Embeds + dedups via cosine ≥0.85 (line 585). Skips quota check (line 793).

Per-step writes go through `patchMetadata()` (line 140) using service-role `SB_HDR` (S-02). Failures caught per-step; entry can end at `enrichment_state='failed'` permanently (no DLQ — A-07).

`enrichBrain(userId, brainId, batchSize, timeBudgetMs)` is the batch worker:
- Claims rows via RPC `claim_pending_enrichments` with `FOR UPDATE SKIP LOCKED` (line 991–1009). 5-min stale-claim recovery via `recompute_enrichment_state` RPC (line 745).
- Bulk-embed at concurrency 5, chunk 100 (line 1169).

`enrichAllBrains({ mode: 'daily' | 'hourly' })` is the cron entry — sweeps all brains, time-budgeted (90s hourly, full daily window).

### Stage 6 — Retrieval

`api/_lib/retrievalCore.ts:150–305` `retrieveEntries(query, brainId, geminiKey, limit)` is the single-brain RAG path used by `/api/search`, `/api/memory`, `/v1/context`.

Pipeline:
1. **Vector search** — RPC `match_entries` (line 160–171) → 20 candidates by cosine.
2. **Keyword expand** — full-text search; `type=neq.secret` (line 183).
3. **Tag sibling expand** — entries sharing top tags.
4. **Metadata hydrate** — second fetch pulls metadata (line 231–244).
5. **Hybrid score** — similarity × 0.7 + keyword × 0.3 (line 247–266).
6. **Graph boost** — concept graph linkage adds +0.05 to +0.08 per neighbour, capped at +0.15 (lines 269–294).
7. **Slice** — top 15 (default).
8. **Persona reinforcement** — fire-and-forget bumps `last_referenced_at` + confidence on retrieved persona facts (lines 298–302).

Cross-brain variant `retrieveEntriesForUser` (lines 345–476) is used by `/api/llm` chat. Drops graph boost for cost (A-10). Vault-filtered (`type=neq.secret`) at every stage.

Locked-secret title disclosure (`findLockedSecretTitles:128–148`) returns vault titles only — no content.

Similarity threshold: `SEARCH_THRESHOLD=0.3` (`search.ts:12`).

### Stage 7 — Insights & concept graph

Concept graph rebuild (`retrievalCore.ts:524–608`):
- Triggered by enrichment + post-mutation paths.
- 10-min debounce per brain (line 12, A-18).
- Top 100 entries by recency, vault-excluded.
- Gemini Flash extracts `{ concepts, relationships }`, sliced to 500 each.
- Upserts to `concept_graphs` table.

Per-entry insight (`metadata.summary`) is written by `stepInsight` and rendered in entry detail UI.

### Stage 8 — Persona system

Multiple feeders, single sink (personal brain, type='persona'):
- **Manual** — settings UI → `personaTools.execAddFact` (`api/_lib/personaTools.ts:198–256`). Trusts caller's `brainId` (S-13).
- **Chat-driven** — chat tool `add_persona_fact` calls same path. Inline confirmation chip missing (U-11).
- **Auto-extracted** — `enrichInline stepPersonaExtract` after each entry. Uses `extractPersonaFacts.ts` (~16KB). Bar set higher (confidence ≥ 0.85) than manual.
- **Hygiene** — `personaHygiene.ts` runs daily decay + Sunday weekly dedup/digest. Confidence decays with no recent reference; near-duplicates merged.

Profile preamble (`buildProfilePreamble.ts`) injects ranked facts (max 80 confirmed + 12 auto, 4500-char cap) into chat system prompt. Privacy gating per Stage 3.

### Stage 9 — Gmail pipeline

Most-complex subsystem. End-to-end:

1. **OAuth setup** (`api/gmail.ts:32–35, 93, 128`). Scopes minimal: `gmail.readonly` + `userinfo.email`. State token HMAC-signed (`oauthState.ts`).
2. **Token at rest** (`gmailTokenCrypto.ts`). AES-256-GCM, scrypt-derived key per namespace, random 12-byte IV per encrypt. `enc:v1:` prefix versioning.
3. **Refresh** (`gmailScan.ts:314–342`). 60s pre-expiry buffer. Single attempt — no backoff (T-13). Rotated refresh tokens not persisted (S-09).
4. **Scan** (`scanGmailForUser`, manual or cron). For each thread block:
   - `gmailPatternScore.ts:185–207` verdict: `auto-accept | hard-block | contested | normal`. Scores capped at 10, no decay (T-15). Probation 7d (lines 112–129) — no UI surface (U-08).
   - PII masking on phone/address/ID number (`maskPii:20–26`). **Attachment text unmasked** (S-12).
   - LLM classification — `buildPrompt:694–796` includes INJECTION DEFENSE block. Body truncated to 400 chars per message in prompt; 3000 chars persisted; 6000 chars attachment text persisted.
   - Deep extract (`gmailScan.ts:927–928`) for structured fields with same INJECTION DEFENSE.
   - Insert via service-role with status from verdict.
   - Fire-and-forget embedding + `enrichBrain` (no await).
5. **Staging → active promotion** — opaque (A-11). When user accepts a staged item via PATCH or `?action=gmail-decision`, the path that flips status varies. No central `promoteStagedEntry` helper.
6. **Decision recording** (`entries.ts:796–851`). `gmail_decisions` row written. Pattern-rule scoring fire-and-forget. Distill triggered every 20 decisions.
7. **Distillation** (`distillGmail.ts`). Loads 200 recent accepts + rejects. Min 3 each. Gemini compresses into 5–10 classification rules. **Overwrites wholesale** (T-11). **Prompt feeds unfiltered user content** (S-05).
8. **Ignore patterns** — natural-language patterns appended to `gmail_integrations.preferences.custom`. No length cap (S-16).

Concurrency: cron 3 users × 4 thread fetches × 3 match persists ≈ 12 concurrent Gmail API calls per tick (T-12). No exponential backoff on 429.

### Stage 10 — Cron clean-up & catch-up

Two cron orchestrators, both monolithic (A-12).

- **Daily** (`api/user-data.ts handleCronDaily:2646–2759`, schedule `0 4 * * *` via `.github/workflows/cron-daily.yml`):
  1. `runGmailScanAllUsers()` — Gmail sweep across all users.
  2. `enrichAllBrains({ mode: 'daily' })` — catch-up enrichment, tier-capped.
  3. `runPersonaDecayPass()` — daily persona-fact decay.
  4. `runPersonaWeeklyPass()` (UTC Sunday only) — dedup + digest.
  5. Admin summary push + in-app notification (gated by `admin_summary_enabled`).
  All four jobs share one 300s budget. One slow job starves the rest.
- **Hourly** (`handleCronHourly:2292–2639`, schedule `0 * * * *`):
  1. Daily-capture prompt fan-out (per-user local-time, dedup `daily_last_sent_at`).
  2. Weekly-nudge fan-out (per-user weekday+hour, dedup `nudge_last_sent_at`).
  3. Expiry reminders — walks accessible brains, finds `due_date`/`deadline`/`expiry_date`/`event_date` within lead window. Dedup via `expiry_notification_log` UNIQUE (user_id, entry_id, brain_id, item_label).
  4. `enrichAllBrains({ mode: 'hourly' })` with 90s budget — uncapped per-brain time (A-13).

Cron auth = `CRON_SECRET` bearer, no rotation/nonce (S-10). Cron logs include user emails (S-11).

### Stage 11 — Audit log

`audit_log` table (mig 057). Service-role insert; user RLS on read.

Coverage matrix:
| Surface | Audit-log written? |
|---|---|
| `capture.ts` capture | ✓ (line 274–284) |
| `entries.ts` PATCH | ✓ (line 341–351) |
| `entries.ts` DELETE | ✓ (`entryDelete.ts:68–78`) |
| `entries.ts` bulk-patch | ✓ (line 477–487) |
| `mergeEntries.ts` commitMerge | ✓ (line 453–463) |
| `llm.ts` chat tool calls | ✓ via `auditToolCalls` (line 618) |
| **`v1.ts` all actions** | **✗ MISSING (S-06)** |
| **`mcp.ts` all tool calls** | **✗ MISSING (S-06)** |
| **`capture.ts handleSaveLinks`** | **✗ MISSING** |
| **Admin endpoints** | **✗ MISSING (S-04)** |

All writes are fire-and-forget — failures silently dropped (S-20, T-17). No user-facing Activity view (U-19).

### Prompt-learning loop (longitudinal)

Three feedback loops mutate prompts and scoring over time:
1. **Pattern-rule scores** (`gmail_pattern_rules` table). Score ±1 per accept/reject decision. No decay (T-15). Drives `auto-accept | hard-block | contested | normal` verdict.
2. **Distilled summaries** (`gmail_integrations.accepted_summary` + `rejected_summary`). LLM-compressed rules from recent decisions. Fed into classifier prompt as examples. Overwritten wholesale (T-11). Reason field unfiltered (S-05).
3. **Persona fact reinforcement** (`buildProfilePreamble`). Retrieval bumps `last_referenced_at` + confidence; hygiene cron decays unused. Confirmed (manual/chat/pinned) facts stay sticky; auto-extracted facts compete for a smaller pool.

Prompt versions themselves are not telemetry-tracked (A-15). Future prompt edits in `prompts.ts` cannot be A/B tested without instrumentation.

---

## Entry-point matrix (architectural baseline)

The pipeline accepts entries from 8 surfaces. Behaviour diverges across them — that divergence is the architectural defect spine.

| Surface | File | Auth | Brain scope | Enrich trigger | Idempotent | Audit log |
|---|---|---|---|---|---|---|
| `POST /api/capture` | `api/capture.ts` | User JWT | `requireBrainAccess` per `brain_id` + `extra_brain_ids[]` | **AWAIT** | ✓ (24h) | ✓ |
| `POST /api/capture?action=links` | `api/capture.ts handleSaveLinks` | User JWT | `requireBrainAccess` | None | ✗ | ✗ |
| `PATCH /api/entries` | `api/entries.ts handlePatch` | User JWT | `requireBrainRole` after read | **AWAIT** if title/content changed | ✗ | ✓ |
| `POST /api/entries?action=enrich-batch` | `api/entries.ts` | User JWT | `requireBrainAccess` | `enrichBrain` (batch ≤50) | ✗ | partial |
| `POST /api/entries?action=merge` | `api/entries.ts` → `mergeEntriesOneShot` | User JWT | source + dest brain checks | **AWAIT 60s timeout, falls back to cron** | ✗ | ✓ |
| `POST /v1/ingest` | `api/v1.ts` | `em_*` API key (single brain) | implicit (token) | **AWAIT** | ✓ (24h) | **✗ MISSING** |
| `POST /api/mcp tools/call create_entry` | `api/mcp.ts:744–749` | `em_*` or `mcp_*` token | implicit (token) | **AWAIT** (post-2026-05-06 hardening) | ✓ (24h) | **✗ MISSING** |
| `POST /api/mcp tools/call update_entry` | `api/mcp.ts:778` | same | implicit (token) | **AWAIT** (post-2026-05-06 hardening) | ✗ | **✗ MISSING** |
| `POST /api/llm?action=chat` (create_entry tool) | `api/llm.ts` | User JWT | `checkBrainAccess` | **AWAIT** | ✗ | ✓ tool-call audit |
| `POST /api/llm?action=split` | `api/llm.ts handleSplit` | User JWT | n/a (returns array) | n/a (no insert) | ✗ | ✗ |
| Gmail sync (cron + manual) | `api/_lib/gmailScan.ts` | cron secret / MCP `gmail_sync` | per-user; auto/manual | **fire-and-forget** `enrichBrain()` + detached embedding (E2E-05) | per-message dedup | ✗ |
| Cron sweeps (daily/hourly) | `api/user-data.ts handleCron*` | `CRON_SECRET` bearer | all brains | `enrichAllBrains` (O(all brains), E2E-07) | partial | n/a |

---

# Section 1 — Security

## P0

### S-01 — Gemini API key embedded in URL query string
- **Where**: `api/_lib/gmailScan.ts:168, 184, 806–807`; same pattern likely in other managed-Gemini calls.
- **Evidence**:
  ```
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EXTRACT_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  ```
- **Impact**: Vercel access logs, Sentry breadcrumbs, any observability stack that captures `fetch` URLs will store live `GEMINI_API_KEY` in plaintext. One compromised log line = full Gemini account exfil. Affects every cron + per-user manual scan.
- **Fix**: Switch to header `x-goog-api-key: <key>`. Audit `aiProvider.ts`, `gmailScan.ts`, `enrich.ts`, `distillGmail.ts`, `extractPersonaFacts.ts`, `personaHygiene.ts`. Add CI lint: any URL string containing `?key=` from `process.env` fails.

### S-02 — Service-role headers used for every entry write; user_id filter is app-layer only
- **Where**: `capture.ts:236–240`, `v1.ts handleIngest`, `mcp.ts create_entry/update_entry`, `entries.ts handlePatch`, `enrich.ts patchMetadata/insertExtractedFactDeduped`. All flow through `sbHeaders()` carrying `SUPABASE_SERVICE_ROLE_KEY`.
- **Impact**: If service-role key leaks (env exfil, accidental log, compromised SSR build), every row in every tenant is writable. Defence-in-depth missing.
- **Fix**: Two-layer model — service-role for cron/RPC/audit_log only. User-scoped writes via anon-key + user JWT so RLS applies. Tests asserting RLS would block cross-user writes if the app filter were removed.

### S-03 — DELETE/PATCH `/api/entries` reads entry without `user_id` filter before auth check
- **Where**: `api/_lib/handlers/entryDelete.ts:20–28`, `api/entries.ts handlePatch:277–289`.
- **Evidence**: First fetch retrieves entry by `id` only; `requireBrainRole(user.id, entry.brain_id, ...)` runs after the read.
- **Impact**: Service-role read returns the row to handler memory before auth check. (a) Entry contents transit handler memory; (b) row metadata is in scope for any pre-auth logging; (c) timing differential leaks "entry exists in brain X" to a non-member. Side-channel, not direct exfil.
- **Fix**: Combine read + auth: SELECT with `user_id=eq.{user.id} OR brain_id IN (<accessible brain ids>)`. Or pre-check `requireBrainAccess` for the entry's owning brain via JOIN.

### S-04 — Admin endpoints gated only on JWT `app_metadata.is_admin`
- **Where**: `api/entries.ts isAdminUser` (~line 978); used by `?action=enrich-debug`, `persona-prompt`, `distill-gmail`, `audit-persona`, `wipe-persona-extracted`.
- **Impact**: Admin demotion not reflected until JWT expires. JWT compromise via XSS/localStorage = full admin session lifetime. No audit log on admin endpoint hits.
- **Fix**: Per-request DB read of `user_profiles.is_admin`. `audit_log` write on every admin endpoint hit. Consider short-TTL admin sessions or step-up auth.

### S-05 — Distillation prompts feed unfiltered email content to Gemini
- **Where**: `api/_lib/distillGmail.ts:96–125`. Block built from `gmail_decisions` rows with no JSON-escaping or instruction-stripping beyond truncation.
- **Evidence**:
  ```
  const block = rows.map((row, i) => `${i+1}. From: ${sender}\n     Subject: ${row.subject}${snippet}${reason}`).join("\n");
  ```
- **Impact**: Sender-controlled subjects/snippets and user-typed `reason` reach the LLM with weak framing — no `<untrusted>` wrap, no INJECTION DEFENSE block like `prompts.ts` uses for INSIGHT/CONCEPTS. An attacker who emails the user can attempt to corrupt classification rules. Worst case: rules say "always accept emails from attacker.com".
- **Fix**: Wrap in `<untrusted_decisions>...</untrusted_decisions>`, prepend INJECTION DEFENSE preface used in `prompts.ts:5–6, 40, 43`. Strip control chars; cap `reason` at 200 chars.

## P1

### S-06 — Audit log writes missing on `/v1/*` and all MCP write tools
- **Where**: `api/v1.ts` (all actions); `api/mcp.ts` create_entry/update_entry/delete_entry/merge_entries/gmail_sync.
- **Impact**: Public API key + MCP token actions leave no audit trail. Compliance/forensic gap.
- **Fix**: Centralize audit writes in `withAuth`/`withApiKey`/MCP dispatcher. Wrapper writes a `request_id` + `action` + `resource` row; `source` field distinguishes web/v1/mcp.

### S-07 — Verify `Authorization`/api-key never enters Redis rate-limit bucket key in raw form
- **Where**: `api/_lib/rateLimit.ts`, used by `withApiKey`. Bucket suffix uses `api-key:{userId}:{keyId}` after resolution; pre-auth uses IP+path. Confirm `keyId` is never raw-key derived.
- **Fix**: Verification ticket; assert masked auth header in unit test.

### S-08 — Anthropic provider gated on a key documented as "not yet valid"; managed Gemini routed for paid tiers; `claude-sonnet-4-6` fallback model ID does not exist
- **Where**: `api/_lib/resolveProvider.ts:117–124` (comment); `api/_lib/providers/select.ts:46`.
- **Impact**: First Anthropic call after key activation will 404. Mis-billing risk if pro/max users believe they're getting Claude. Honesty/marketing risk on launch.
- **Fix**: Update fallback to a real, current Anthropic model ID. Verify `ANTHROPIC_API_KEY` against `/v1/messages` ping in CI. Note pivot in `EML/Ops/vendors.md`.

### S-09 — OAuth `refresh_token` rotation not handled when Google rotates silently
- **Where**: `api/_lib/gmailScan.ts refreshGmailToken:314–342`; `api/calendar.ts refreshGoogle:203–233`.
- **Impact**: If Google rotates the refresh token, next refresh fails silently → integration breaks until re-auth.
- **Fix**: On every refresh, if response contains `refresh_token`, encrypt + persist. Notification row after 3 consecutive failures.

### S-10 — Cron secret has no rotation, nonce, or timestamp; long-lived bearer
- **Where**: `api/_lib/cronAuth.ts verifyCronBearer`; `.github/workflows/cron-{daily,hourly}.yml`.
- **Impact**: If the secret leaks, attacker can replay-trigger crons (mass enrich, Gmail scans, persona decay).
- **Fix**: HMAC-of-timestamp signing with 5-min skew + Redis replay-protection nonce. The HMAC variant `verifyCronHmac` already exists — re-enable. Or migrate to Vercel native crons.

### S-11 — Cron logs include user emails (PII)
- **Where**: `api/user-data.ts:2327, 2338, 2363`.
- **Impact**: Vercel function logs retain user emails. GDPR/POPIA exposure.
- **Fix**: Replace `user.email` with `user.id` or hashed-email (SHA-256 first 8 hex).

### S-12 — Gmail attachment text stored unmasked
- **Where**: `api/_lib/gmailScan.ts:1404` — `metadata.attachment_text: attachmentText.slice(0, 6000)`.
- **Impact**: Bank statements, tax returns, ID docs forwarded by email become 6000-char plaintext blobs. RAG-indexed sensitive PII at rest.
- **Fix**: Regex sweep for RSA ID, US SSN, IBAN, credit card before persistence; replace with `[REDACTED:type]`. Or store hash + first/last chars only. Per-user opt-in for full text.

### S-13 — `personaTools.execAddFact` trusts caller's `brainId` without re-checking it's the personal brain
- **Where**: `api/_lib/personaTools.ts:198–256`.
- **Impact**: A future caller passing arbitrary `brainId` could write persona facts to a shared brain, violating the documented privacy boundary.
- **Fix**: Hard-resolve `brainId = await getPersonalBrainId(userId)` inside `execAddFact`; ignore the parameter. Add assertion + test.

### S-14 — Vault setup race on concurrent first-time setup
- **Where**: `api/user-data.ts handleVault POST` (~line 1497+).
- **Impact**: Two concurrent setup requests without idempotency-key violate PK uniqueness. App may show "vault already exists with someone else's salt" confusion.
- **Fix**: Mandate `Idempotency-Key` from clients. On PK conflict, return existing row with `?conflict=replay`. Verify `vault_keys_all` policy is `WITH CHECK (auth.uid() = user_id)` on insert.

## P2

### S-15 — Pre-auth rate limit on v1 is `limit*5` (~150/min)
- **Where**: `api/v1.ts withApiKey:196`.
- **Fix**: Drop pre-auth bucket to 30/min/IP; separate "invalid-key" counter with escalating ban.

### S-16 — Gmail `preferences.custom` ignore-pattern string has no length cap
- **Where**: `api/mcp.ts:521–543`.
- **Fix**: Cap at 4000 chars; on overflow, dedupe + summarize via a one-shot LLM call.

### S-17 — `/api/llm?action=split` has no cap on returned entry count
- **Where**: `api/llm.ts handleSplit:670–693`.
- **Fix**: `parseServerEntries(...).slice(0, 50)` server-side. Document max in API surface.

### S-18 — `Strict-Transport-Security: preload` set but domain not yet on the HSTS preload list
- **Where**: `vercel.json:79–80`.
- **Fix**: Add HSTS preload submission to `LAUNCH_CHECKLIST.md` as P1 launch-day task. Pin domain choice first.

### S-19 — `includeSubDomains` could break sibling subdomains lacking HTTPS
- **Where**: same.
- **Fix**: Audit subdomain inventory before HSTS preload submit. If any sibling needs HTTP, drop `includeSubDomains` or move Everion to its own apex.

### S-20 — `audit_log` insert is fire-and-forget on every write path
- **Impact**: During incidents, audit_log silently misses entries.
- **Fix**: Batch via 1s flush, or await with 100ms timeout. Track audit-write failure count metric.

---

# Section 2 — Stability

## P0

### T-01 — No `AbortController`/timeout on any `fetch()` in the enrichment hot path
- **Where**: `api/_lib/enrich.ts` (lines 45–62, 359–368, 873–876, 992–1009, 1131–1138), `api/_lib/aiProvider.ts:40–63`, `api/_lib/enrichQuota.ts`, `api/_lib/gmailScan.ts`, `api/_lib/distillGmail.ts:127`, `api/_lib/personaHygiene.ts`.
- **Evidence**: `fetchWithRetry` retries on 5xx/429 with backoff [100, 400, 1600ms], no `AbortSignal.timeout()` on the underlying `fetch`.
- **Impact**: Hung Gemini/Anthropic/Supabase response keeps the function alive until platform timeout (300s on Fluid Compute default), multiplied by retries. Worst-case `enrichInline` hangs the entire request — and since enrichment is awaited inline on capture, this hangs `POST /api/capture` too.
- **Fix**: `AbortSignal.timeout(15_000)` for LLM calls, `5_000` for embeddings, `3_000` for Supabase. Catch `AbortError` as transient. Per-step budget so `enrichInline` returns within 60s on bad upstream.

### T-02 — Quota gate fails OPEN on RPC error
- **Where**: `api/_lib/enrichQuota.ts:81–102`. On non-2xx from `consume_enrich_quota`, returns `{ allowed: true, used: -1 }`.
- **Impact**: Postgres outage, RLS misconfig, or RPC rename silently disables quota enforcement. Free-tier users could consume unlimited LLM calls during outages. Direct cost risk.
- **Fix**: Fail CLOSED — return `{ allowed: false, reason: 'quota_check_unavailable' }` and queue retry. Surface as P0 alert.

### T-03 — Embedding dimension validation **PARTIALLY RESOLVED 2026-05-06** (single-path guarded; batch path still unguarded)
- **Single-path** (`api/_lib/generateEmbedding.ts:74`): now validates `if (values.length !== 768)`. ✓ resolved.
- **Batch-path** (`generateEmbeddingsBatch` in same file; `bulkEmbedBatch` in `enrich.ts:1131–1138`): maps `data.embeddings` to `values` without per-vector length check. **Open — see E2E-12 below.**
- **Impact**: Cron bulk path can persist mismatched vectors silently and mark `embedding_status='failed'` permanently.
- **Fix**: Share validation between single and batch helpers. On mismatch, drop or retry that specific vector, store reason in `embedding_status='failed'` row.

### T-04 — `JSON.parse` on LLM output without try/catch in `entries.ts handleAudit`
- **Where**: `api/entries.ts handleAudit:585`.
- **Impact**: Malformed Gemini Flash output → 500. If fired inside a batched audit, entire batch fails → user retries → quota burn.
- **Fix**: try/catch; log raw output + skip that entry's flag. Salvage strategy: regex `[ ... ]` block (same as `enrich.ts:75`).

### T-05 — ~~MCP `create_entry` does not await `enrichInline`~~ **RESOLVED 2026-05-06**
- See A-01 above. `api/mcp.ts:744–749, 778` now `await enrichInline`.

## P1

### T-06 — `enrichInline` awaited inline; Vercel kills function on response — race window
- **Where**: `api/capture.ts:287–305` (comment: "Vercel kills the function as soon as we respond... enrichInline runs end-to-end, awaited"); `api/v1.ts:224–229`.
- **Impact**: User-perceived latency on first save = full enrichment chain (parse → insight → concepts → embed → persona): 8–15s typical, 60s worst. With T-01 unfixed can blow past timeout.
- **Fix**: Migrate to Vercel Queues (GA 2025) or `waitUntil`. Respond `202 + { enrichment_state: 'queued' }`. Client polls.

### T-07 — `enrichBrain` claims rows with `FOR UPDATE SKIP LOCKED` but `enrichInline` has no per-entry compare-and-set
- **Where**: `api/_lib/enrich.ts enrichBrain:991–1009`, `setEnrichmentState`.
- **Impact**: Two workers stalling on Gemini past 5-min stale threshold can both re-claim; metadata PATCHes interleave; last-write-wins loss of insight or concepts under burst.
- **Fix**: Make `setEnrichmentState('processing')` atomic CAS: `WHERE enrichment_state='pending' OR enrichment_locked_at < now() - interval '5 min'`. Verify `recompute_enrichment_state` RPC. Regression test.

### T-08 — `consume_enrich_quota` RPC atomicity not verified in code
- **Where**: `api/_lib/enrichQuota.ts:81–102`. Trusts the RPC.
- **Impact**: If RPC is read-then-write, two concurrent enrichments at the limit boundary both pass.
- **Fix**: Read the migration. Confirm single-statement upsert: `INSERT ... ON CONFLICT DO UPDATE SET count = user_enrich_quota.count + 1 RETURNING count`.

### T-09 — `buildEnrichText` truncates at 8000 chars without warning or chunking
- **Where**: `api/_lib/enrich.ts:219`, `generateEmbedding.ts:10`.
- **Impact**: Long PDFs/transcripts truncated mid-sentence. Insights and embeddings reflect first ~2000 tokens. User has no signal.
- **Fix**: Set `metadata.enrichment.truncated=true` + `truncated_chars=<n>`. Long-term: chunk at sentence boundaries; per-chunk embeddings in `entry_chunks`.

### T-10 — Idempotency cleanup probabilistic at 1%; orphan slots block retries 24h
- **Where**: `api/_lib/idempotency.ts:9, 101–107`.
- **Impact**: Mobile networks dropping mid-POST → next retry sees `in_flight` → 409. User taps repeatedly. Looks broken.
- **Fix**: Hard timeout on `in_flight`: `if reserved_at < now() - 60s AND entry_id IS NULL` → reclaimable.

### T-11 — Distillation overwrites `accepted_summary`/`rejected_summary` wholesale
- **Where**: `api/_lib/distillGmail.ts:166–185`.
- **Impact**: User trims decision history → trained summary nuked when below `MIN_FOR_DISTILL=3`.
- **Fix**: Only write field when new value is non-null. Per-user "lock summary" toggle.

### T-12 — `gmailScan` cron concurrency burns Google quota under multi-user load
- **Where**: `api/_lib/gmailScan.ts runGmailScanAllUsers:2299–2327`. Defaults: 3 users × 4 thread fetches × 3 match persists ≈ 12 concurrent calls/tick.
- **Impact**: Per-project 250-quota-units/sec hit at ~21 active users. Exponential backoff missing on 429 → silent scan failures.
- **Fix**: 429 detection + Retry-After parse + per-user backoff queue. Drop `GMAIL_CRON_SCAN_CONCURRENCY` to 5 once user count crosses 100. Per-user circuit breaker (3 consecutive 429 = 1h pause).

### T-13 — `refreshGmailToken` has only one attempt
- **Where**: `api/_lib/gmailScan.ts:314–342, 2009`.
- **Impact**: Transient 503 → user's whole scan window missed.
- **Fix**: Wrap in `fetchWithRetry` ([100, 400, 1600], 5xx + 429 transient). Mark `last_refresh_error`; surface "Reconnect Gmail" after 3 failures.

### T-14 — Calendar refresh silent-skips on error
- **Where**: `api/calendar.ts:370`.
- **Impact**: Token revoked / refresh expired → empty `getUpcoming` with no diagnostic.
- **Fix**: Track per-integration `last_sync_error`; surface in `/api/calendar?action=integrations`; render in UI.

### T-15 — Pattern scores cap at 10 with no decay
- **Where**: `api/_lib/gmailPatternScore.ts:108–109`.
- **Impact**: Stale prefs stick — user accepted 10 newsletters from `team@oldco.com` 6 months ago → still auto-accepts.
- **Fix**: Daily cron decays scores by 0.05 if no decision in 30 days; reset to 0 after 90 days inactive.

### T-16 — Persona-typed entries skip quota; embeddings count is uncounted
- **Where**: `api/_lib/enrich.ts:793–802`.
- **Impact**: Pro tier abuse: spam `add_persona_fact` to generate 1000 free embeddings.
- **Fix**: Count embeddings against separate `embeddings` quota at 10x LLM-call rate.

### T-17 — `audit_log` writes fire-and-forget; failures silently dropped
- **Impact**: During incident windows, retries don't happen. Forensic gap.
- **Fix**: In-memory ring buffer flushed on 1s timer + on shutdown. On failure, retry from buffer.

## P2

### T-18 — `aiProvider.fetchWithRetry` treats 401 as non-retryable
- **Fix**: Allow 1 retry on 401 with 5s delay (Anthropic transient 401 during key rotation).

### T-19 — `runChat` tool execution has no shared timeout
- **Where**: `api/llm.ts execTool` and orchestration.
- **Fix**: Per-conversation budget: 60s wall, 8 tool calls max, hard-stop with summarize.

### T-20 — `mergeEntriesOneShot` enrichment timeout is hardcoded 60s
- **Where**: `api/_lib/mergeEntries.ts:421–435`.
- **Fix**: Surface `enrichment_pending` in UI banner + retry button (see U-15).

### T-21 — `recompute_enrichment_state` reclaim threshold is 5min hardcoded; no metric on stale claim count
- **Fix**: `metrics.gauge('enrichment.stale_reclaims', count)` per cron tick. Alert if > 50.

### T-22 — `gmail_decisions` table not indexed on `(user_id, created_at)`
- **Where**: `api/_lib/distillGmail.ts loadDecisions:96–103`.
- **Fix**: Add composite index in next migration.

### T-23 — Embedding queue per-entry sequential inside `enrichInline`
- **Fix**: Acceptable for inline; `bulkEmbedBatch` already concurrency-5 in `enrichBrain`.

---

# Section 3 — Architecture

## P0

### A-01 — ~~`MCP create_entry` is the only write path that does NOT await enrichment~~ **RESOLVED 2026-05-06**
- **Where**: `api/mcp.ts:744–749` (create), `:778` (update). Both now `await enrichInline(id, userId)`.
- **History**: Previously fire-and-forget `rebuildConceptGraph()` only. Hardened in same-day session that produced the workflow-end-to-end review. Closes the orphan-entry hole for MCP single-entry writes.
- **Residual**: Still no audit-log writes from MCP write tools (S-06 / A-02 still open).

### A-02 — Audit-log coverage inconsistent — three surfaces produce no trail
- **Where**: `api/v1.ts` (all actions), `api/mcp.ts` (all tool calls), `api/capture.ts handleSaveLinks`.
- **Impact**: Public API key compromise = no record of what attacker did. POPIA/GDPR audit fail.
- **Fix**: Centralize audit writes in `withAuth`/`withApiKey`/MCP dispatcher. Wrapper logs every state-changing call. (See S-06.)

### A-03 — Service-role pattern leaks into every write; RLS becomes "best effort"
- **Where**: All writes via `sbHeaders.ts` → `SUPABASE_SERVICE_ROLE_KEY`. App-layer adds `user_id=eq.{user.id}`.
- **Impact**: RLS exists in migrations (032, 053, 069) and is correct in policy syntax, but is bypassed by every production write. The schema's defence-in-depth is theatre at the write layer. A dev bug dropping `user_id=eq.` from a query silently leaks across tenants.
- **Fix**: Two-tier client model. Phased migration starting with `/api/transfer`, `/api/entries DELETE`, `/api/mcp delete_entry`. (See S-02.)

## P1

### A-04 — No queue between user write and enrichment; awaited enrichment is the failure mode
- **Where**: All "AWAIT" surfaces in the entry-point matrix.
- **Background**: `capture.ts:287–289` ("Vercel kills the function as soon as we respond...") was correct for traditional serverless. **Vercel Queues GA'd in 2025; Fluid Compute supports `waitUntil`**. Original constraint gone.
- **Impact**: User-perceived 8–15s latency. Timeout risk. Surface inconsistency in enrichment trigger semantics.
- **Fix**: Migrate to Vercel Queues. POST returns `202 + { entry_id, enrichment_state: 'queued' }`. Worker processes within 30s. UI polls. Eliminates A-01, T-01, T-06, U-06 simultaneously. **Highest-leverage architectural lift.**

### A-05 — `entry_brains` ghost table referenced in older code paths
- **Where**: Project CLAUDE.md confirms it's a ghost. Supabase logs occasionally surface 404s.
- **Fix**: Grep `api/`, `src/`, migrations for `entry_brains`. Delete or rename. CI lint: `if grep -r entry_brains . ; exit 1`.

### A-06 — `entries.ts` is a 72KB / 1100+ line megafile fanning out via `?action=` and `?resource=`
- **Where**: Handles GET/PATCH/DELETE/audit/bulk-patch/enrich-batch/merge/persona/distill/gmail-decision/restore/empty-trash/share/unshare/shares/move/merge-undo/merge_into/gmail-prompt/enrich-debug.
- **Cause**: 12-function Vercel Hobby cap.
- **Fix**: When Vercel Pro is on, split into `api/entries-admin.ts` (audit, persona, distill, debug), `api/entries-bulk.ts` (bulk, share, move, merge), keep `api/entries.ts` for primary CRUD. Track in `Roadmap/post-launch-week-1.md`.

### A-07 — No durable queue → no DLQ for failed enrichments
- **Impact**: Entry that fails 3 retries gets `enrichment_state='failed'`. No automatic re-attempt beyond daily cron catch-up.
- **Fix**: Daily cron re-enqueues `enrichment_state='failed' AND updated_at < now() - 24h`. Per-entry `metadata.enrichment.attempts` counter, hard cap at 5.

### A-08 — `enrichInline` JSON contract per step is implicit and fragile
- **Where**: `stepParse, stepInsight, stepConcepts, stepPersonaExtract`.
- **Impact**: No formal schema. Prompt drift could subtly change output shape.
- **Fix**: Zod schema per step output, parse + validate before persisting. On mismatch, log + retry with `response_format: { type: "json_object" }`. Today's "soft JSON repair" (`enrich.ts:75–96`) is the workaround.

### A-09 — Pattern-rule weights hardcoded; no operator runtime tuning
- **Where**: `api/_lib/gmailPatternScore.ts:185–207`.
- **Fix**: `system_settings` table. Admin UI. Per-user override (`gmail_classifier_overrides`).

### A-10 — Cross-brain retrieval drops graph-boost; chat ranks worse than search
- **Where**: `api/_lib/retrievalCore.ts:340–344` (acknowledged trade-off).
- **Fix**: Either run graph-boost across brains (cost) or document divergence in user-facing help.

### A-11 — Gmail staging→active promotion path opaque
- **Where**: `gmailScan.ts persistMatches` writes status='staged' or 'active' based on verdict; PATCH path that flips staged→active is in `entries.ts handlePatch`.
- **Impact**: Trigger semantics undocumented. When user accepts staged item, what runs? Audit-log? Enrichment?
- **Fix**: Single `promoteStagedEntry(id)` helper handles audit + enrichment + decision recording + pattern score update.

### A-12 — Cron orchestration monolithic; `handleCronDaily` runs 4 jobs serially in one 300s budget
- **Where**: `api/user-data.ts:2646–2759`.
- **Impact**: Slow Gmail-scan eats budget; persona decay/weekly skipped.
- **Fix**: Split into `cron-gmail-daily`, `cron-enrich-daily`, `cron-persona-daily`. Requires function-split (A-06) under 12-function cap.

### A-13 — `enrichAllBrains hourly` budget 90s; per-brain time uncapped
- **Fix**: Per-brain `timeBudgetMs = remaining / brain_count`. Sort by oldest pending entry first.

### A-14 — Provider routing intentionally sends paid tiers to managed Gemini despite Anthropic billing
- **Where**: `api/_lib/resolveProvider.ts:117–124`.
- **Fix**: Either un-gate Anthropic before launch (after fixing S-08) or update `EML/Legal/pricing-billing.md` and `STRATEGY.md` to remove Claude promises.

## P2

### A-15 — `prompts.ts` is a 42KB single file
- **Fix**: Split into `prompts/{capture,insight,concepts,split,persona,gmail,merge}.ts`. `version` field per prompt. Telemetry: `prompt_version` recorded on each LLM call.

### A-16 — Embedding model and dim are scattered constants
- **Where**: `generateEmbedding.ts:36, 64`, `enrich.ts EMBED_DIM`, `personaHygiene.ts`.
- **Fix**: Single source `api/_lib/embedConfig.ts` exporting `{ model, dim, truncateChars }`.

### A-17 — Persona-fact ranking weights heuristic constants
- **Fix**: Move to `system_settings`.

### A-18 — Concept-graph rebuild debounced 10 min globally per brain
- **Where**: `api/_lib/retrievalCore.ts:12 REBUILD_DEBOUNCE_MS`.
- **Fix**: Reduce to 2 min OR add immediate "incremental update" path that only adds the new entry's concepts.

### A-19 — Gmail thread+attachment limits scattered constants
- **Fix**: Operational settings table. Document defaults in `EML/Ops/feature-flags.md`.

### A-20 — `vault_keys` Phase 2 keypair backfilled lazily
- **Fix**: Background backfill cron post-launch; prompt user next-login if vault is Phase 1 only.

### A-21 — `transfer.ts` import doesn't atomically move children across users
- **Fix**: Document for now. Plan `brain_owner_transfer(brain_id, new_owner_id)` RPC for post-launch.

---

# Section 4 — UX & Surface

## P0

### U-01 — ~~MCP-created entries appear empty for 0–60 minutes~~ **RESOLVED 2026-05-06**
- See A-01. MCP single-entry writes now wait for the full enrichment chain. Same UX surface (slow inline await) as capture — see U-06 for the queue migration that addresses it long-term.

### U-02 — Calendar integration silent-fails on token expiry
- **Source**: T-14.
- **User experience**: Calendar connected weeks ago. Token revoked/rotated. "Upcoming" shows nothing. No error toast, no Reconnect CTA.
- **Fix**: Bell-icon notification on first refresh failure. `Settings/Integrations` row shows `last_sync_error` + Reconnect button.

### U-03 — Gmail integration silent-fails on token refresh failure
- **Source**: T-13.
- **User experience**: Gmail connected. Refresh fails 401 → silent skip. Inbox stays empty. User believes "classifier is quiet today".
- **Fix**: Same as U-02 — surface notification + Reconnect. After 3 consecutive cron failures, mark `status='disconnected'`.

## P1

### U-04 — Manual auto-enrich button has no per-brain feedback
- **Where**: `POST /api/entries?action=enrich-batch` returns `{ brains, processed, mode }`.
- **User experience**: Tap "Re-enrich brain". Spinner. Returns "12 processed". No view into per-entry progress; no signal whether 12 was the whole brain or first batch (cap 50).
- **Fix**: Server returns `{ processed, remaining }`. UI shows "12/847 processed". Disable button when remaining=0. Per-brain rate limit (1 manual / 5 min).

### U-05 — Entry status indicators not consistently rendered
- **Where**: `enrichment_state`, `embedding_status` columns; UI per `EntryList.test.tsx` and detail components.
- **User experience**: Entry can be `enrichment_state='failed'` and look normal in feed. No way to selectively retry.
- **Fix**: Three-state indicator on every entry tile: `pending` (subtle pulse), `done` (no badge), `failed` (warning glyph + tap-to-retry). Different glyph for `embedding_status='failed'` (search-icon-with-strike).

### U-06 — Capture flow blocks for the entire enrichment chain
- **Source**: T-06, A-04.
- **User experience**: Save → 12s spinner → modal closes.
- **Fix**: Optimistic UI — close modal after insert (sub-second), show entry with `pending` pulse, upgrade in place. Long-term: queue eliminates the await.

### U-07 — Staging inbox review actions show no progress, no undo, no learning view
- **Where**: Decisions recorded via `entries.ts ?action=gmail-decision:796–851`.
- **User experience**: Tap Accept → item disappears. No view into how preferences are evolving. No undo. No "why was this auto-accepted next time".
- **Fix**:
  - Bell + toast: "Got it — I'll learn from this. (Undo)" 5s countdown → `?action=gmail-decision&undo=true`.
  - "Why did this get auto-accepted?" affordance on entries with `metadata.auto_accept_via_pattern=true`.
  - Settings page: "What I've learned about your inbox" — top 10 `gmail_pattern_rules` with edit/delete.

### U-08 — Auto-accept probation has no explanation surface
- **Where**: `gmailPatternScore.ts:112–129`. Pattern crosses threshold → `auto_accept_eligible_at = now() + 7 days`, status='staged' + `metadata.auto_accept_pending=true`.
- **User experience**: User accepts/rejects manually for 7 days, then suddenly the same emails stop appearing → confusion.
- **Fix**: Badge on probation items: "Auto-accepting in N days unless rejected" with "Decide now" affordance.

### U-09 — Manual Gmail sync via MCP rate-limited 5/min/IP — error opaque
- **Where**: `api/mcp.ts:810`.
- **Fix**: 429 body: `message: "Sync was just run — wait N seconds"`, `retry_after_s` field.

### U-10 — Vault per-brain has no cross-brain search
- **Where**: Migration 079.
- **User experience**: Personal-brain vault + work-brain vault. To find a credential, remember which brain it lives in.
- **Fix**: Vault search bar searches across user's brains (titles only — security boundary). Tap result → unlock that brain's vault.

### U-11 — Persona-fact extraction has no inline confirmation
- **Where**: `extractPersonaFacts.ts` + `personaTools.execAddFact`.
- **User experience**: Soft notification. Review at: profile → persona → ABOUT YOU. Discoverable, not contextual.
- **Fix**: Inline chip in chat: "I noticed you mentioned [fact] — save to profile?" with one-tap accept/reject.

### U-12 — Embedding-failure entries are search-invisible with no recovery prompt
- **Source**: T-03.
- **User experience**: Search for a phrase from a recent entry → nothing. Entry exists. User confused.
- **Fix**: Banner on entry detail: "Search index pending — retry?" Daily cron also picks these up (currently does).

### U-13 — Split flow drafts not server-side persisted
- **Where**: `api/llm.ts handleSplit:670–693`.
- **User experience**: Paste long brain-dump. Server splits 7 entries. User reviews. Tabs away. Returns 10 min later → state lost.
- **Fix**: `entry_split_drafts(id, user_id, payload, expires_at)` with 1h TTL. `draft_id` to resume. Accept → server creates from persisted draft.

### U-14 — Bulk-patch succeeds quietly with no item-level feedback
- **Where**: `api/entries.ts handleBulkPatch:392–490`.
- **User experience**: Select 50 entries, "Pin" → response "47 patched". Which 3 failed? Why?
- **Fix**: Response `{ ok: [ids], failed: [{id, reason}] }`. UI surfaces failed items with retry.

### U-15 — Merge UI doesn't surface `enrichment_pending=true`
- **Source**: T-20.
- **Fix**: "Still processing" chip on merged entry, auto-refreshing on 30s tick. Hide when state flips to `done`.

### U-16 — `/v1/*` errors lack machine-actionable codes
- **Fix**: `{ error, code: "QUOTA_EXCEEDED" | "BRAIN_ACCESS_DENIED" | "VALIDATION_FAILED", retry_after?: number }`. Document in `EML/Specs/`.

### U-17 — Free-tier quota exhaustion is silent — no upgrade prompt
- **Where**: `api/_lib/enrichQuota.ts`. Quota-exceeded entries tagged `enrichment_state='quota_exceeded'`.
- **User experience**: 21st save of the day succeeds; entry has no insight, no concepts. No banner. No upgrade prompt.
- **Fix**: Render upgrade banner on the entry: "Daily AI quota reached — upgrade to keep enriching" → `/settings/billing`. Contextual paywall.

### U-18 — `?action=enrich-debug` admin-only; users have no self-debug surface
- **Where**: `api/entries.ts handleEnrichDebug` (~line 990–994).
- **Fix**: User-facing variant: `GET /api/entries/:id?include=enrichment_status` returns sanitized state (`pending`/`processing`/`done`/`failed:<category>`) + `last_attempted_at`. Hide internal LLM error text.

### U-19 — `audit_log` invisible to users; no Activity view
- **Where**: Schema present (mig 057). No UI surface.
- **Fix**: `Settings → Activity` paginating `audit_log` for current user. Filter by action type.

### U-20 — `personaHygiene weekly digest` runs Sunday — no email/push to user about changes
- **Where**: `api/user-data.ts handleCronDaily` UTC-Sunday branch.
- **Fix**: Optional weekly email/push: "We tidied your profile — 3 outdated facts removed. Review or restore."

## P2

### U-21 — Entry detail doesn't show enrichment provider
- **Fix**: Footer chip: "Enriched by Gemini Flash · 2026-05-06".

### U-22 — Concepts graph view stale up to 10 min after capture
- **Source**: A-18.
- **Fix**: "Refresh concepts" button triggers immediate rebuild for that brain.

### U-23 — `transcribe` retries silently
- **Where**: `api/llm.ts handleTranscribe:762–896`.
- **Fix**: Response includes `retry_attempt`. UI shows "Retrying transcription (2/3)…".

### U-24 — Search results don't surface graph-boost contribution
- **Where**: `retrievalCore.ts:269–294`.
- **Fix**: Optional debug-mode tag: "matched via concept: '<concept>'".

### U-25 — Auto-accept eligible patterns count not surfaced
- **Fix**: "Smart inbox" settings: "47 patterns learned · 3 will auto-accept after probation".

### U-26 — `?action=empty-trash` has no double-confirm UI
- **Fix**: Inline custom confirm sheet (per CLAUDE.md: never `window.confirm`) showing trash count + typed-confirm: "Type DELETE to permanently remove 47 entries".

### U-27 — Idempotency 409 has no human message
- **Fix**: `{ error: "Already saved", entry_id: "...", code: "IDEMPOTENT_REPLAY" }`. UI shows "Already saved 2 minutes ago" + jump-to-entry.

---

---

# Section 5 — End-to-end workflow findings (E2E-*)

Additive findings surfaced by the workflow review. Some duplicate findings in earlier sections (cross-mapped); others are new perspectives that only emerge from end-to-end tracing.

## P0

### E2E-01 — Gemini API keys still sent in URL query strings (system-wide)
- **Cross-map**: extends S-01.
- **Where**: `api/_lib/aiProvider.ts`, `enrich.ts`, `gmailScan.ts`, `distillGmail.ts`, `distillRejected.ts`, `extractPersonaFacts.ts`, `generateEmbedding.ts`, `retrievalCore.ts`, `providers/gemini.ts`, `api/entries.ts`, `api/feedback.ts`, `api/user-data.ts`. Twelve files.
- **Fix**: Centralized `googleAiFetch(model, endpoint, body, key)` helper that puts the key in `x-goog-api-key`, applies timeout defaults, sanitizes logs, and rejects URL query keys by construction. CI lint: regex `generativelanguage.googleapis.com.*?key=` fails build.

## P1

### E2E-05 — Gmail scan mixes staged rows + fire-and-forget embeddings + auto-accept enrichment outside the queue contract
- **Where**: `api/_lib/gmailScan.ts persistMatches:1262–1520`. Staged inserts kick a detached embedding promise; auto-accept spawns an unawaited IIFE that runs attachment extraction + `enrichInline`.
- **Impact**: Staged entry can be `embedding_status='done'` while parse/insight/concepts/persona are still null. Auto-accepted entries can be killed after the function response or cron budget. Embedding calls evade the same quota and state path as normal enrichment.
- **Fix**: Gmail scan produces rows + jobs. Worker owns attachment extraction, parse, insight, concepts, embedding, persona, final state convergence. Stop fire-and-forget embedding PATCHes from scan; route through the same enrichment job path as user writes.

### E2E-07 — Cron enrichment is O(all brains) sweep
- **Where**: `enrichAllBrains` pages every brain from `brains`, calls `enrichBrain` per brain until budget expires.
- **Impact**: Acceptable at small scale; degrades linearly with brain count even when most brains have no pending entries. Pending entries for one user wait behind unrelated empty brains.
- **Fix**: Index pending work via partial index `WHERE enrichment_state IN ('pending','processing')` and scan only matching brains. Or queue-at-write so cron is a safety net rather than primary path. Track per-run skipped brains. Alert when `processed > 0` for multiple consecutive hourly runs.

### E2E-09 — Cross-brain move resets embedding but not concepts/insight flags
- **Where**: `api/entries.ts move handler` clears `embedded_at` + sets `embedding_status='pending'`, then calls `enrichInline`. **Does not clear** `metadata.enrichment.concepts_extracted` or `insight` flags.
- **Impact**: `enrichInline` skips already-flagged steps. Moved entry retains concepts and insight derived from source-brain context — graph semantics in destination are stale.
- **Fix**: On move, clear context-dependent flags (concepts_extracted, insight) so they regenerate. Rebuild source + destination concept graphs after worker completes. Regression test: move → destination concepts refresh.

### E2E-10 — Shared-entry overlays use source-brain enrichment semantics in destination brains
- **Where**: `entry_shares` adds overlay rows without entry duplication; entries' metadata, embedding, and concepts are reused across all target brains.
- **Impact**: Shared brains display entries whose concepts and insight were derived for a different context. Search, concept-graph view, and team interpretation can confuse.
- **Fix**: Either document source-context sharing as product behavior (lower-cost) or introduce `entry_share_enrichment` table for destination-specific concepts and graph edges (higher-cost, higher-fidelity).

### E2E-11 — Shared-brain persona extraction loads context from source brain instead of personal
- **Where**: `stepPersonaExtract` calls `loadExtractorContext(userId, brainId)` then resolves `personalBrainId` and inserts facts into the personal brain.
- **Impact**: Privacy boundary intact (facts land in personal brain), but the extractor doesn't see the user's personal confirmed/rejected persona context before deciding what to extract from a shared-brain entry. Higher false-positive and duplicate risk on persona extraction from shared content.
- **Fix**: Resolve `personalBrainId` first; load extractor context from the personal brain. Source-brain entry content stays as evidence, but dedup/rejection context comes from personal.

### E2E-14 — Gmail accept/reject decision recording detached from mutation outcome
- **Where**: `src/components/settings/GmailStagingInbox.tsx` starts accept/reject mutations and calls `recordDecision` immediately. Comment intentionally keeps PATCH backgrounded.
- **Impact**: Failed accept PATCH still teaches the model the message was accepted. Failed DELETE teaches rejection while staged row remains. UI-state vs learned-rules drift.
- **Fix**: Single server action that mutates entry state and writes the decision near-transactionally. Retry failed decision writes visibly. Store mutation status with the decision row.

## P2

### E2E-08 — `GMAIL_CRON_SCAN_CONCURRENCY` env var not validated/clamped
- **Where**: `api/_lib/gmailScan.ts` — `const GMAIL_CRON_SCAN_CONCURRENCY = Number(process.env.GMAIL_CRON_SCAN_CONCURRENCY || 3);` fed directly into `mapWithConcurrency`.
- **Impact**: NaN env value → no workers started → silent cron disable. Very high value → bursty Gmail/Gemini/Supabase calls.
- **Fix**: `const n = clamp(toInt(env, 3), 1, 10)`. Log effective concurrency at cron start.

### E2E-12 — Batch embeddings do not validate vector dimensions before write
- **Cross-map**: extends T-03 (single-path resolved 2026-05-06).
- **Where**: `generateEmbeddingsBatch` (and its consumer `bulkEmbedBatch` in `enrich.ts:1131–1138`) maps `data.embeddings` to `values` without per-vector length check.
- **Impact**: One malformed vector can fail a bulk chunk or poison state accounting. Cron path is the weak link.
- **Fix**: Share validation logic with single-path. Drop or retry mismatched vectors before `bulk_apply_embeddings`. Store a clear `embedding_status='failed'` reason.

### E2E-16 — Admin debug/diagnostic endpoints unaudited
- **Cross-map**: extends S-04 (DB verification missing) + S-06 (audit-log gaps).
- **Where**: `?action=persona-prompt`, `gmail-prompt`, `enrich-debug`, `audit-persona`, `distill-gmail`, `distill-rejected`. Admin gates via `app_metadata.is_admin` only.
- **Impact**: These endpoints expose live prompt context and learned summaries — exactly the surfaces an attacker would want to see. Production admin access should be forensic-grade.
- **Fix**: `writeAuditLog` helper called from every admin diagnostic/mutation endpoint. Include IP, UA, action, selected brain.

### E2E-17 — Local prompt learning in `localStorage` drifts and isn't observable
- **Where**: `src/lib/learningEngine.ts` stores chat/suggestion learnings in browser `localStorage`; `src/lib/systemPromptBuilder.ts` injects that into prompts.
- **Impact**: Prompt behaviour differs across devices/browsers. XSS or extensions can mutate. Support cannot inspect or reset from server logs.
- **Fix**: Decision call — make it a first-class server-side learning source (provenance + reset controls) or label its effect in debug tooling and cap its prompt-injection influence.

### E2E-19 — Concept extraction's "no proper nouns" rule hurts personal-recall precision
- **Where**: `prompts.ts ENTRY_CONCEPTS` prefers stable categorical labels, avoids proper nouns.
- **Impact**: Graph stays clean. Underrepresents the entities users actually search for: vendors, clients, restaurants, projects, policies, account names.
- **Fix**: Two-layer model — keep concepts clean for graph; add separate named-entity / facts layer used for retrieval and UI filters. Retrieval tests for people, vendors, projects, account names.

### E2E-20 — Gmail attachment extraction caps can hide critical content from view
- **Where**: Extraction processes a small N of attachments, skips large files, truncates extracted text before storing.
- **Impact**: Multi-attachment invoices, statements, contracts can be accepted and enriched without their most important content. User sees the entry but not what was omitted.
- **Fix**: Persist coverage: number scanned, number skipped, byte limits, chars extracted. Show coverage in staged-entry debug metadata. Retry / manual extract path for skipped attachments.

## P3

### E2E-21 — Architecture docs partly stale against current code
- **Where**: `EverionMindLaunch/architecture/enrich.md`, `gmail.md`, `cron.md`.
- **Impact**: Docs reflect pre-hardening behaviour (pre-MCP-await, pre-embedding-validation). Future fixes regress if engineers trust the older mental model.
- **Fix**: Update each doc to reflect current awaited MCP/v1/capture paths, Phase 2A queue behaviour, current Gmail auto-accept/probation/pattern-rule/accept-time extraction, hourly enrichment safety-net details.

### E2E-22 — Test coverage should follow workflows, not only individual helpers
- **Fix list**:
  - Capture → pending/processing/done integration tests.
  - Gmail staged accept/reject: assert learning writes only follow successful mutations.
  - Shared-brain move/share: concept and persona behaviour tests.
  - Quota failure: fail-closed behaviour tests.
  - Prompt-injection regression for Gmail distillation.
  - Cron budget: assert pending rows not starved by empty brains.

---

## Positive controls confirmed by workflow review

- Secrets bypass enrichment and converge to `enrichment_state='done'` (vault-respecting state machine).
- Queue claim RPC uses `FOR UPDATE SKIP LOCKED` with stale-lock recovery.
- The `recompute_enrichment_state` RPC centralizes state convergence.
- Persona facts extracted from shared-brain entries land in personal brain (privacy boundary).
- Gmail OAuth tokens encrypted at rest when token encryption configured.
- Service-role header creation centralized + lint-guarded (`scripts/check-service-role-headers.mjs`, allowlist `sbHeaders.ts` + `oauthState.ts`).
- Capture + v1 + MCP + chat-tool + entries PATCH paths now call `enrichInline` consistently — the older "wait for cron" hole is closed.
- Gmail accept-time attachment extraction runs before enrichment.
- Admin prompt/debug endpoints gated to admin JWTs (audit gap remains — see E2E-16).
- Per-namespace key derivation in `gmailTokenCrypto.ts` (gmail / calendar-google / calendar-microsoft) prevents cross-integration ciphertext reuse.

## Recommended hardening order

1. **E2E-01 / S-01** — Remove API keys from URLs. Centralized `googleAiFetch` helper. Largest blast radius if leaked.
2. **T-01 / E2E-03** — Add `AbortSignal.timeout()` wrappers and per-step budgets before doing more architecture work. Defaults: provider 15s, embedding 8–10s, Supabase 3–5s, Gmail attachment fetch 15s. Persist breadcrumb in `metadata.enrichment.last_error`.
3. **A-04 + E2E-02 + E2E-05** — One durable enrichment job path. Make entry writes cheap and deterministic: insert row, set state, enqueue work, return. Gmail scan produces rows + jobs through the same worker.
4. **T-02 / E2E-04** — Quota fail-CLOSED for managed/free tiers. Fail-OPEN only acceptable for users on their own API key.
5. **S-05 / E2E-06** — Harden prompt-learning against poisoned examples. Wrap distillation input in untrusted-data delimiters. Strip control chars. Store provenance + allow rollback of the last distillation.
6. **E2E-07 + E2E-08** — Bound, validated, observable cron scans. Pending-work index. Concurrency env clamp + log.
7. **E2E-09–E2E-12** — Cross-brain semantics + embedding integrity. Move clears flags; share overlays decide on per-context enrichment; persona extractor loads personal context first; batch embeddings validate dim.
8. **S-04 + S-06 + E2E-16** — Centralize audit-log writes; add DB-backed admin check; instrument admin debug endpoints.
9. UI / debug / test / docs (U-* + E2E-15 + E2E-21 + E2E-22) after backend contract is stable.

---

## Cross-cutting findings (overlap map)

A handful of root causes manifest in multiple categories. Fix once, retire many entries.

| Root cause | Security | Stability | Architecture | UX |
|---|---|---|---|---|
| MCP `create_entry` skips enrichInline | — | T-05 | A-01 | U-01 |
| Service-role bypasses RLS | S-02 | — | A-03 | — |
| Audit log missing on v1 + MCP | S-06 | — | A-02 | U-19 |
| Calendar/Gmail silent-fail on token expiry | S-09 | T-13, T-14 | — | U-02, U-03 |
| Cron secret long-lived bearer | S-10 | — | — | — |
| Embedding dim never validated | — | T-03 | — | U-12 |
| Quota fail-OPEN | — | T-02 | — | U-17 (paywall surface) |
| `entries.ts` megafile | — | — | A-06 | — |
| No queue → awaited enrichment | — | T-01, T-06 | A-04, A-07 | U-06 |
| Pattern weights hardcoded, no decay | — | T-15 | A-09 | U-08, U-25 |
| Distillation prompt unfiltered | S-05 | T-11 | — | — |
| Distillation overwrites wholesale | — | T-11 | — | — |

---

## Launch-readiness recommendation

**Hard P0 set (must fix before public launch)**
- S-01 (Gemini key in URL) — 1 day, low risk, large impact.
- S-02 / A-03 (service-role / RLS) — 2 weeks at full scope; minimum viable: convert `/api/transfer`, `entries DELETE`, `mcp delete_entry` to user-JWT path.
- S-04 (admin DB-check) — half day.
- S-05 (distillation prompt INJECTION DEFENSE) — half day.
- T-01 (timeouts) — 1 day systemwide.
- T-02 (quota fail-CLOSED) — 1 hour.
- T-03 (embedding dim validation) — 2 hours.
- T-04 (handleAudit JSON parse) — 30 min.
- A-01 / T-05 / U-01 (MCP enrichInline await) — 30 min for the bare minimum; align tests later.
- A-02 / S-06 (audit-log on v1 + MCP) — 1 day.
- U-02 / U-03 (calendar + Gmail Reconnect surface) — 1 day.

**Total launch-blocker P0 effort**: ~3 weeks of focused work, parallelizable across two engineers.

**Strong post-launch architectural bet**: A-04 (Vercel Queues migration) collapses A-01, T-01, T-06, U-06, A-07, A-12 into a single re-architecture. Plan for week 2 of post-launch sprint per `EML/Roadmap/`.

**Surfaces in good shape (no launch-blocker findings)**: prompts.ts injection defence; vault per-brain RLS; OAuth state HMAC; AES-256-GCM token encryption; persona-fact privacy boundary; CSP / HSTS / CORS headers; concept-graph vault exclusion; brain-share recursion-free policies; service-role linter.

The pipeline's bones are sound. The brittle parts are at the seams between surfaces (per-surface inconsistency in audit-log, enrich-trigger, validation depth) and at the boundary between sync and async (no queue, no timeouts, no DLQ). Both classes are addressable; neither is structural.
