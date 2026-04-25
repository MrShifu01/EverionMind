# EverionMind — Ingestion Pipeline Sprint Tracker

> Run through this periodically and update status marks.
> **Legend:** ✅ FIXED · ❌ UNFIXED · ⚠️ PARTIAL · ❓ CLARIFY NEEDED
>
> Last audit: 2026-04-25 · Last review: 2026-04-25 · Week 1+2 implemented: 2026-04-25 · Week 3 implemented: 2026-04-25 · Week 4 implemented: 2026-04-25 · Session 5 implemented: 2026-04-25 · Session 6 implemented: 2026-04-25 · Audit follow-up: 2026-04-25

---

## P0 — Ship-stoppers (12 blockers)

| # | Status | Issue | Location | Fix |
|---|--------|-------|----------|-----|
| 1 | ✅ | **IDOR on entry_brains POST/DELETE** — source entry access checked but target `brain_id` ownership not validated | `api/entries.ts:479–521` | Dead code purged: no `entry_brains` references remain in active `api/` files. (Worktree branches still contain references.) |
| 2 | ✅ | **Service-role key bypasses RLS on every write** — missed call-site = silent cross-tenant write | `api/capture.ts:151`, `api/v1.ts:128`, `api/transfer.ts:70`, `api/mcp.ts`, `api/llm.ts`, `api/gmail.ts` | DB trigger `entries_brain_owner_match` (migration 043) enforces `entries.user_id = brains.owner_id` for every INSERT/UPDATE — any future missed `requireBrainAccess` callsite is now blocked at the database. The `insertEntry()` helper consolidation remains a code-hygiene win but is no longer security-critical. |
| 3 | ✅ | **Quota check fails open** — RPC error → `{ allowed: true, remaining: Infinity }` | `api/_lib/usage.ts:40–43` | Fail closed: on any quota-check error return 503 + `Retry-After`, not success. |
| 4 | ✅ | **Rate limiter is a no-op without Upstash** — in-memory fallback is per-instance, evicted on cold start | `api/_lib/rateLimit.ts:11–13, 62–70` | On missing `UPSTASH_REDIS_REST_URL`, fail closed (return 503). Require env var in prod. |
| 5 | ✅ | **Cron auth uses plaintext bearer; `verifyCronHmac()` exists but is never called** | `api/user-data.ts:536`, `api/_lib/cronAuth.ts:3–10` | Replace plaintext compare with `verifyCronHmac(auth, CRON_SECRET)`. Rotate `CRON_SECRET`. |
| 6 | ✅ | **Prompt injection in INSIGHT / CONCEPTS** — user `title`/`content` interpolated verbatim; `CAPTURE` prompt has injection defence, the other two do not | `api/_lib/enrichBatch.ts:100,111`, `api/_lib/prompts.ts:11–12` | Move user text into a separate user-turn boundary. Add injection-defence paragraph to `INSIGHT` and `ENTRY_CONCEPTS` prompts matching the one in `CAPTURE`. Reject responses that don't match a tight schema. |
| 7 | ✅ | **Gmail raw body → LLM classifier with weak HTML stripping** — attacker emails a prompt-injection payload | `api/_lib/gmailScan.ts:463–521` | Sanitise subject/body (strip control chars, JSON-escape), bound length per-section, run classifier in structured-output / tool-call mode. |
| 8 | ✅ | **No idempotency keys** — double-submit / lost-response retry creates duplicate entries | `api/capture.ts`, `api/llm.ts:193`, `api/mcp.ts:276`, `api/v1.ts:126` | Atomic `reserveIdempotency` flow: INSERT idempotency_keys with entry_id=NULL first, only the PK winner proceeds with the entry insert; loser replays. Length-validated header. Probabilistic cleanup. Closes the prior check-then-act race. |
| 9 | ✅ | **Race on capture URL-dedup** — fetch-then-check-then-insert with no lock; concurrent same-URL requests both insert | `api/capture.ts:111–135` | UNIQUE INDEX `entries_user_source_url` is the safety net. Audit follow-up: dedup pre-check rewritten as a direct point query against the index (was an O(n) scan capped at 500 rows that silently missed for users with many entries) and the 409 fallback now correctly looks up the conflicting row by source_url instead of returning a random entry. |
| 10 | ✅ | **Quota enforced after insert** — 429 returned but row already existed | `api/capture.ts:92–109` | Fixed: quota check now runs at line 100, insert at line 151. |
| 11 | ✅ | **Embedding dimension hardcoded to `vector(768)`** — switching provider silently stores incomparable vectors | `supabase/migrations/008_pgvector.sql`, `api/_lib/generateEmbedding.ts` | `embedding_model TEXT` column added in migration 039; `embedding_model: "gemini-embedding-001"` now written on every embed PATCH in `capture.ts`. |
| 12 | ✅ | **Enrichment is fire-and-forget with no retry queue / dead-letter** — Anthropic down = entries stuck forever | All ingestion paths `.catch(() => {})` | `entry_enrichment_jobs` table created (migration 039) + `scheduleEnrichJob`/`drainEnrichmentJobs` with exponential backoff implemented in `enrichBatch.ts`. |

---

## §2 — Subsystem Findings

### 2.1 Chat (`/api/llm?action=chat`)

| Status | Issue | Fix |
|--------|-------|-----|
| ❌ | One chat turn = N entries at no extra quota cost — `action:"chats"` increments once regardless of tool-call count (`llm.ts:490–501`) | Per-tool-call counter + per-turn cap |
| ❌ | Rate limit (40/min) shared across chat/split/complete; no per-tool cap | Separate rate-limit keys per tool action |
| ❌ | No audit trail on which tools ran or with what args | Add structured log line per tool call |
| ❌ | LLM-generated tool input `metadata` can contain HTML/XSS-like content; must not be rendered raw on frontend | Sanitise on render in `EntryCard` / detail view |

### 2.2 Capture (`/api/capture`)

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | `completeness_score` accepted from client | Now server-computed via `computeCompletenessScore()` at `capture.ts:138` |
| ✅ | `source_url` not validated (potential SSRF if ever fetched server-side) | URL scheme validation added in `capture.ts` — rejects non-http/https with 400. |
| ❌ | No HTML/XSS sanitisation on title/content | Sanitise on read in frontend; server-side strip on ingest |
| ✅ | Embed awaited in-band (+200–800 ms latency) | Fire-and-forget IIFE in `capture.ts`; enrichment job retries on `embedded_at IS NULL`. |

### 2.3 Gmail (`/api/gmail` + `_lib/gmailScan.ts`)

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | Dedup on `ThreadId + MessageId + (from + normSubject)` | Solid — keep as-is |
| ❌ | PII extracted into plaintext metadata — `id_number`, `cellphone`, `landline`, `address` (`gmailScan.ts:607–662`) | Redact or encrypt at rest (pgcrypto column-level / Supabase Vault) |
| ❓ | OAuth tokens — are they encrypted at rest in `gmail_integrations`? | Verify column storage; if plaintext, apply `pgcrypto` column-level encryption |
| ✅ | HTML stripping is a naive regex (`gmailScan.ts:11–18`) — misses entities, malformed tags, CSS-hidden text | `node-html-parser` installed; `stripHtml` replaced with DOM-based parser that removes hidden elements and decodes entities. |
| ❌ | Attachments ≤10 MB go to Gemini raw — PDFs with medical/legal data leave the perimeter | Add content-type allow-list; warn user; offer opt-out |
| ✅ | Manual / deep scan (200/100 msgs) has no endpoint-level rate limit — DoS via repeat triggering | 5/min for scan, 3/min for deep-scan per user via `rateLimit()` in `gmail.ts`. |
| ✅ | Token-refresh failure indistinguishable from empty inbox to the user | `data.debug.tokenRefreshFailed` check in `GmailSyncTab.handleScanNow` shows actionable reconnect message. |
| ✅ | scan/deep-scan accepted client-supplied `brain_id` without ownership check (audit-follow-up IDOR) | `requireBrainAccess(user.id, brainId)` enforced before scan and deep-scan in `api/gmail.ts`. |
| ✅ | `delete-entries` accepted unbounded, untyped IDs (audit follow-up) | UUID validation + 200-id cap in `api/gmail.ts`. |
| ✅ | `upsertGmailContact` SELECT-then-INSERT race produced duplicate contacts under concurrent scans (audit follow-up) | Partial unique index `entries_contact_email_uniq` (migration 043) + INSERT-then-PATCH-on-conflict flow in `gmailScan.ts`. |
| ✅ | `fetchImportedIdentifiers` loaded every gmail entry into memory on every scan (audit follow-up) | Bounded to most-recent 10 000 rows ordered by `created_at` desc. |
| ✅ | `deepExtractEntry` Anthropic prompt had no injection-defence paragraph and accepted untyped LLM output into entry metadata (audit follow-up) | Defence paragraph added; subject/body/attachment fields routed through `sanitizeEmailField`; LLM output coerced to string-or-null with per-field length caps before persistence. |

### 2.4 Google Keep Import

| Status | Issue | Fix |
|--------|-------|-----|
| ❌ | No idempotency — re-importing same zip after 502 duplicates all notes | Hash zip content or individual note IDs; upsert on conflict |
| ✅ | Binary success/failure — user sees 0 or 2000 succeed; no partial-success reporting | `transfer.ts` now inserts in chunks of 100 and returns `{ imported, failed, errors[] }`. UI shows partial counts. |
| ✅ | No target-brain selector — always lands in default brain | `brainId` already passed from `GoogleKeepImportPanel` props to `/api/import` body. |
| ✅ | No server-side note content size limit | `String(e.content).slice(0, 50000)` in `transfer.ts`. |

### 2.5 Todo (`TodoQuickAdd.tsx` → `/api/capture`)

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | No client-side dedup — browser back / double-tap re-submits | Enter-key guard + `busy` flag prevents double-submit in `TodoQuickAdd.tsx`. |
| ✅ | No offline queue (unlike CaptureSheet) | `TodoQuickAdd` now enqueues to `offlineQueue` on network failure; `useOfflineSync` drain loop replays it. |
| ❌ | `due_date` / `repeat` stored free-form in metadata — no CHECK constraint | Add DB CHECK or Zod parse; normalise to ISO date |

### 2.6 MCP (`/api/mcp`)

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | No quota check — third-party clients can write unbounded entries free of charge | `checkAndIncrement` applied in MCP `create_entry` handler. |
| ❌ | `gmail_sync` shares the 30/min global limit with `create_entry` — 30 Gmail scans/min possible | Separate per-tool rate-limit keys |
| ❌ | `resolveApiKey()` uses first brain implicitly (`_lib/resolveApiKey.ts:32–41`) | Store `brain_id` explicitly on the API key record |
| ❌ | No structured tool-call audit log | Log `{ key_id, tool, args_summary, user_id, ts }` per call |

### 2.7 REST v1 (`/api/v1/ingest`)

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | No body size limit — 50 MB JSON parsed before `typeof` rejection (parser-DoS) | `export const config = { api: { bodyParser: { sizeLimit: "1mb" } } }` in `v1.ts`. |
| ✅ | No quota check | `checkAndIncrement` applied in `handleIngest`. |
| ✅ | Every update triggers `rebuildConceptGraph()` — full-brain LLM sweep on every call (`v1.ts:139,182`) | Removed `rebuildConceptGraph()` call from `handleUpdate`; cron handles rebuild. |

### 2.8 AI Memory (`/api/memory-api`)

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | `retrieve_memory` reachable as LLM tool in chat — `generateEmbedding()` not gated by `checkAndIncrement`, burns embed quota silently | `checkAndIncrement("chats")` added to `memory-api.ts` `handleRetrieve` before embedding call. |

---

## §3 — Enrichment Pipeline

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | `concepts_extracted` now only set on success — failed extractions retry on next batch run | Fixed in a32fd92 |
| ✅ | `patchMeta` re-reads current metadata before patching — concurrent runs no longer overwrite each other | Fixed in a32fd92 |
| ✅ | Anthropic HTTP errors logged (not silently swallowed) | Fixed in a32fd92 |
| ✅ | Auto-merge threshold raised 90 → 97 | Fixed in a32fd92 (`mergeDetect.ts:145`) |
| ✅ | Candidate cap at 50 rows (was 200) | Fixed in a32fd92 |
| ✅ | `parseAIJSON` silently drops all but first concept when model returns an array (`enrichBatch.ts:32`) | Array of concept-like objects now wrapped as `{ concepts: p, relationships: [] }`; capture splits still use `p[0]`. |
| ✅ | Content truncated silently at 400 chars (insight) / 600 chars (concepts) | Limits raised to 1500 (insight) and 2000 (concepts) in `enrichBatch.ts`. |
| ✅ | Manual brace-balancing JSON repair accepts partially-formed responses as valid | Zod schemas (`CaptureResultSchema`, `ConceptResultSchema`) now validate the parsed AI output before merging into entry metadata in `enrichBatch.ts`. Schema mismatch falls through to the heuristic completeness path; no half-formed metadata is written. |
| ✅ | Embeddings have no fallback — Gemini down = `embedded_at: null` entries that never appear in search | `embedding_status` column added (migration 042); set to `'done'` on success, `'failed'` on catch in `capture.ts`/`gmailScan.ts`; ⚠ badge shown in `EntryList` for failed entries. |
| ✅ | No persistent enrichment job table — `runEnrichEntry` / `runEnrichBatchForUser` called everywhere but failures silently lost | `entry_enrichment_jobs` table (migration 039) + `drainEnrichmentJobs` with exponential backoff in `enrichBatch.ts`. |
| ✅ | No completeness-based prioritisation — oldest-first, weakest entries enriched last | `unenriched.sort()` by `computeCompletenessScore` ASC in `runEnrichBatchForUser`. |
| ⚠️ | Cron runs once daily at 18:00 UTC — real-time feel depends on per-write `runEnrichEntry` call | Per-write wiring now in place (40634ff). Still need cron for catch-up + the persistent job table for failures. |

---

## §4 — Database / RLS

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | `entries` base `CREATE TABLE` not in any migration — schema unauditable, can't rebuild from migrations | `000_init.sql` generated from live Supabase schema (all 29 tables, indexes, RLS policies). Snapshot taken at migration 042. |
| ✅ | `audit_log` referenced in code (`capture.ts:170–179`, `entries.ts:110,137,254`) but table never created — DELETE/PATCH/merge have no audit trail | Table created in migration 039 with RLS + indexes. |
| ❓ | `entry_brains` dropped in migration 025 but still actively queried in `api/entries.ts:52,470–515` and `api/capture.ts:124,187` | Decide: fully delete dead handler + all call-sites, or revive the table |
| ✅ | `user_usage` 406 on `.single()` for new billing periods | Fixed: all call-sites use `.maybeSingle()` (confirmed in CLAUDE.md) |
| ✅ | Missing FK indexes (links, messaging tables) | Added in migration 033 |
| ✅ | RLS policies scoped to `authenticated`; user API keys open-access fixed | Fixed in migration 032 |
| ✅ | Missing hot-path index `entries (user_id, created_at DESC) WHERE deleted_at IS NULL` | `entries_user_created_at_idx` added in migration 039. |
| ✅ | `brain_id` FK on entries — no explicit `ON DELETE` clause | `ON DELETE CASCADE` chosen; migration 041 drops old FK and re-adds with CASCADE. |
| ❌ | RLS on entries is `user_id = auth.uid()` only — brain-member isolation dropped in migration 032 | If/when shared brains ship, restore a brain-member RLS policy |
| ✅ | DB does not reject entries with `user_id ≠ brains.owner_id` — service-role miss = silent cross-tenant write (audit follow-up) | Trigger `entries_brain_owner_match` (migration 043) raises an exception on INSERT/UPDATE when `entries.user_id` does not match the row's `brains.owner_id`. |
| ✅ | `idempotency_keys.entry_id` was `ON DELETE SET NULL` — orphan rows replayed as `{ id: null }` after hard-delete (audit follow-up) | FK swapped to `ON DELETE CASCADE` in migration 043. |
| ❌ | `IVFFlat lists=100` adequate to ~100k rows; plan HNSW reindex beyond that | Reindex to HNSW once `entries` exceeds 100k rows |
| ❌ | `vector(768)` hardcoded — switch to any other provider silently breaks semantic search (see P0 #11) | See P0 #11 fix |

---

## §5 — Frontend Reliability

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | Per-entry failure tracking in multi-entry save loop — failed entries surface via toast | Fixed in a32fd92 (`useCaptureSheetParse`) |
| ✅ | `useBackgroundCapture` retries failed saves up to 3× with backoff (not on 4xx) | Fixed in a32fd92 |
| ✅ | Ctrl+Enter bypasses `canSave` disabled guard → double-submit | `CaptureEntryBody` onKeyDown now guards with `canSave && !loading`. |
| ✅ | Delete errors silently swallowed in `useEntryActions` — row reappears on refresh | `commitPendingDelete` catches errors, shows toast, restores entry. |
| ✅ | Optimistic edit with no rollback in `useEntryActions:129` — PATCH failure leaves state diverged | `handleUpdate` snapshots previous state and rolls back on PATCH failure. |
| ✅ | No mid-request token refresh — 401 mid-flow becomes generic error | `authFetch` refreshes session on 401 and retries once before surfacing error. |
| ❌ | Enrichment status polled every 90 s (`useEnrichmentOrchestrator.ts:112`) | Subscribe via Supabase Realtime on the `entries` row instead |
| ❌ | Offline ops dropped silently after 7 days — user believes writes are queued | Surface warning + "replay" button when offline queue has expired items |
| ✅ | Double-scan Gmail possible — scan gate in component state; modal close/reopen resets it | Module-level `_scanInProgress` boolean in `GmailSyncTab.tsx` persists across remounts. |
| ✅ | Clipboard copy of newly-minted API key has no fallback (`ClaudeCodeTab.tsx:90`) — never shown again | Key shown in masked input with Show/Hide toggle; `execCommand` fallback added to `copyKey`. |
| ✅ | No `AbortController` / timeout on any `fetch()` — slow provider → spinning UI forever | 30 s `AbortController` timeout added to `TodoQuickAdd.tsx` fetch. |

---

## §6 — Cost & Abuse Vectors

| Status | Issue | Path | Worst case |
|--------|-------|------|-----------|
| ❌ | `/api/capture` spammed — no token budget on enrichment | Per-user | ~120 LLM calls/min unmetered |
| ✅ | `/api/capture?action=embed&batch=true` had no quota check — managed Gemini key burnable indefinitely (audit follow-up) | `checkAndIncrement("captures")` enforced before batch embed runs. |
| ❌ | `/api/v1/ingest` triggers brain-wide concept-graph LLM sweep on every call | Per-write | O(N) LLM calls/write |
| ❌ | `/api/entries?action=audit` — 500 entries × 4k tokens × batches of 50 | Per-run | 200k+ tokens unmetered |
| ❌ | `retrieve_memory` tool in chat — free embed call per invocation | Per chat turn | Burns Gemini quota unmetered |
| ❌ | MCP `gmail_sync` — 30/min/key, no quota | Per key | 30 Gmail scans/min |
| ❌ | `/api/transfer` — 5/min × 2000 entries, all ingestion-triggered | Per-user | 10k entries/min |
| ✅ | Huge metadata JSONB — no size check | Per-row | 64 KB cap enforced in `capture.ts` before INSERT; rejects with 400. |
| — | **Mitigation:** per-request LLM token budget (estimate tokens, deduct from `user_usage` before call, refund on provider error) | Covers most vectors above | — |

---

## §7 — Observability Gaps

| Status | Gap | Fix |
|--------|-----|-----|
| ✅ | No structured logging — `console.error` only, no `user_id`/`request_id`/`entry_id`/`step` | `createLogger`/`getReqId` threaded into `withAuth` + `withApiKey`; `req_id` echoed in `x-request-id` response header; JSON lines to stdout — Vercel log drain can pipe to Axiom/BetterStack unchanged. |
| ❌ | No metrics — no counters for enrichment success rate, LLM latency p95, provider 429s, dedup hits | 4 dashboard panels minimum |
| ❌ | No tracing — can't correlate "user says capture is broken" to a failing row | Attach `req_id` at API boundary; log at each enrichment step |
| ❌ | No admin re-run — single-entry re-enrich requires an authenticated POST the user doesn't know exists | Add admin UI: re-enrich / re-embed / failed-job inspector |
| ❌ | No alerting on token-refresh failure, quota-RPC failure, or Anthropic 5xx rate | Axiom/BetterStack alert rules on error log patterns |

---

## Fix Sequence (Week-by-Week)

### Week 1 — Stop the bleeding (P0)
1. Auth guard helper + entry_brains dead-code decision (P0 #1, #2)
2. Fail-closed quota + rate limit (P0 #3, #4)
3. HMAC cron auth (P0 #5)
4. Prompt injection in INSIGHT + CONCEPTS prompts (P0 #6)
5. Gmail body sanitisation (P0 #7)
6. Idempotency table + header across all ingestion (P0 #8)
7. URL-dedup unique index + upsert (P0 #9)

### Week 2 — Correctness
8. Persistent enrichment job table with retry + DLQ (P0 #12)
9. Embedding model columns + provider tracking (P0 #11)
10. `v1.ts` body-size cap + quota check + debounced concept-graph rebuild
11. Schema migration: `000_init.sql`, `audit_log`, drop `entry_brains` dead code, hot-path indexes

### Week 3 — Hardening
12. Gmail PII redaction + OAuth token encryption at rest
13. Per-tool rate limits (MCP, chat tools, v1)
14. Server-side Zod on every API body
15. Realtime subscription for enrichment status
16. Optimistic-edit rollback; delete failure toast; 401 → refresh-and-retry
17. Structured logging + request IDs + dashboards + alerting

### Week 4 — Long-tail
18. HNSW pgvector reindex plan once entries > 100k
19. Admin panel: re-enrich, re-embed, failed-job inspector
20. Token budget enforced in `usage.ts` (not just action count)
21. Partial-success reporting for bulk imports (Keep / Gmail / Transfer)
22. Chaos tests: kill Anthropic mid-enrichment, kill Gemini mid-embed, kill Supabase mid-capture

---

## Clarifications Needed

| # | Question |
|---|----------|
| C1 | Is `entry_brains` permanently retired? If yes, delete all dead call-sites (`api/entries.ts:52,470–521`, `api/capture.ts:124,187`). If no, revive the table and fix the IDOR. |
| C2 | Are Gmail OAuth tokens stored encrypted at rest in `gmail_integrations`? If not, this is GDPR/POPIA risk. |
| C3 | `brain_id` FK on entries — `ON DELETE SET NULL` or `ON DELETE CASCADE`? Needs a product decision before next migration. |
| C4 | Auto-merge at score ≥ 97 — is this still too aggressive? The original audit flagged that common names + shared email can reach this score by coincidence. Consider raising to 99 or requiring manual confirmation above a soft threshold. |
| C5 | MCP API key scope — should `brain_id` be set explicitly per-key (more granular) or remain first-brain-implicit (simpler for single-brain users)? |
