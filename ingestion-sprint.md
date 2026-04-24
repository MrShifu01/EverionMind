# EverionMind — Ingestion Pipeline Sprint Tracker

> Run through this periodically and update status marks.
> **Legend:** ✅ FIXED · ❌ UNFIXED · ⚠️ PARTIAL · ❓ CLARIFY NEEDED
>
> Last audit: 2026-04-25 · Last review: 2026-04-25 · Week 1+2 implemented: 2026-04-25 · Week 3 implemented: 2026-04-25

---

## P0 — Ship-stoppers (12 blockers)

| # | Status | Issue | Location | Fix |
|---|--------|-------|----------|-----|
| 1 | ❓ | **IDOR on entry_brains POST/DELETE** — source entry access checked but target `brain_id` ownership not validated | `api/entries.ts:479–521` | `entry_brains` was dropped in migration 025. Dead code still exists and still calls the dropped table. Decide: fully delete the handler, or revive the table with `requireBrainAccess(user.id, brain_id)` on the *target* before every write. |
| 2 | ⚠️ | **Service-role key bypasses RLS on every write** — missed call-site = silent cross-tenant write | `api/capture.ts:151`, `api/v1.ts:128`, `api/transfer.ts:70`, `api/mcp.ts`, `api/llm.ts`, `api/gmail.ts` | (a) Single `insertEntry()` helper that enforces `requireBrainAccess + user_id === authedUser`; (b) DB trigger `entries_brain_owner_match` that rejects mismatches; (c) defence-in-depth RLS. |
| 3 | ✅ | **Quota check fails open** — RPC error → `{ allowed: true, remaining: Infinity }` | `api/_lib/usage.ts:40–43` | Fail closed: on any quota-check error return 503 + `Retry-After`, not success. |
| 4 | ✅ | **Rate limiter is a no-op without Upstash** — in-memory fallback is per-instance, evicted on cold start | `api/_lib/rateLimit.ts:11–13, 62–70` | On missing `UPSTASH_REDIS_REST_URL`, fail closed (return 503). Require env var in prod. |
| 5 | ✅ | **Cron auth uses plaintext bearer; `verifyCronHmac()` exists but is never called** | `api/user-data.ts:536`, `api/_lib/cronAuth.ts:3–10` | Replace plaintext compare with `verifyCronHmac(auth, CRON_SECRET)`. Rotate `CRON_SECRET`. |
| 6 | ✅ | **Prompt injection in INSIGHT / CONCEPTS** — user `title`/`content` interpolated verbatim; `CAPTURE` prompt has injection defence, the other two do not | `api/_lib/enrichBatch.ts:100,111`, `api/_lib/prompts.ts:11–12` | Move user text into a separate user-turn boundary. Add injection-defence paragraph to `INSIGHT` and `ENTRY_CONCEPTS` prompts matching the one in `CAPTURE`. Reject responses that don't match a tight schema. |
| 7 | ✅ | **Gmail raw body → LLM classifier with weak HTML stripping** — attacker emails a prompt-injection payload | `api/_lib/gmailScan.ts:463–521` | Sanitise subject/body (strip control chars, JSON-escape), bound length per-section, run classifier in structured-output / tool-call mode. |
| 8 | ✅ | **No idempotency keys** — double-submit / lost-response retry creates duplicate entries | `api/capture.ts`, `api/llm.ts:193`, `api/mcp.ts:276`, `api/v1.ts:126` | Accept `Idempotency-Key` header; store `(user_id, idempotency_key) → entry_id` in `idempotency_keys` table with 24 h TTL. Return original entry on replay. |
| 9 | ✅ | **Race on capture URL-dedup** — fetch-then-check-then-insert with no lock; concurrent same-URL requests both insert | `api/capture.ts:111–135` | Add `UNIQUE INDEX entries_user_source_url ON entries (user_id, (metadata->>'source_url')) WHERE metadata ? 'source_url' AND deleted_at IS NULL`; swap to `INSERT … ON CONFLICT` upsert. *(URL dedup now capped at 500 rows — better, but race remains.)* |
| 10 | ✅ | **Quota enforced after insert** — 429 returned but row already existed | `api/capture.ts:92–109` | Fixed: quota check now runs at line 100, insert at line 151. |
| 11 | ⚠️ | **Embedding dimension hardcoded to `vector(768)`** — switching provider silently stores incomparable vectors | `supabase/migrations/008_pgvector.sql`, `api/_lib/generateEmbedding.ts` | Add `embedding_model TEXT` column. Consider `entry_embeddings(entry_id, model, dim, vector)` table for multi-provider. |
| 12 | ✅ | **Enrichment is fire-and-forget with no retry queue / dead-letter** — Anthropic down = entries stuck forever | All ingestion paths `.catch(() => {})` | All paths now call `runEnrichEntry` / `runEnrichBatchForUser` (wired in commits 40634ff, a32fd92). But failures are still just logged; there is no persistent job table. Add `entry_enrichment_jobs(entry_id, attempt, next_run_at, error, status)` + cron drain with exponential backoff. |

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
| ❌ | `source_url` not validated (potential SSRF if ever fetched server-side) | Add URL allowlist / scheme validation before any server-side fetch |
| ❌ | No HTML/XSS sanitisation on title/content | Sanitise on read in frontend; server-side strip on ingest |
| ❌ | Embed awaited in-band (+200–800 ms latency) | Fire-and-forget embed; set `embedded_at` async |

### 2.3 Gmail (`/api/gmail` + `_lib/gmailScan.ts`)

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | Dedup on `ThreadId + MessageId + (from + normSubject)` | Solid — keep as-is |
| ❌ | PII extracted into plaintext metadata — `id_number`, `cellphone`, `landline`, `address` (`gmailScan.ts:607–662`) | Redact or encrypt at rest (pgcrypto column-level / Supabase Vault) |
| ❓ | OAuth tokens — are they encrypted at rest in `gmail_integrations`? | Verify column storage; if plaintext, apply `pgcrypto` column-level encryption |
| ❌ | HTML stripping is a naive regex (`gmailScan.ts:11–18`) — misses entities, malformed tags, CSS-hidden text | Use a real HTML parser (e.g. `node-html-parser` + `sanitize-html`) |
| ❌ | Attachments ≤10 MB go to Gemini raw — PDFs with medical/legal data leave the perimeter | Add content-type allow-list; warn user; offer opt-out |
| ❌ | Manual / deep scan (200/100 msgs) has no endpoint-level rate limit — DoS via repeat triggering | Add per-user rate limit on scan endpoints; staged entries bypass quota counter |
| ❌ | Token-refresh failure indistinguishable from empty inbox to the user | Surface distinct error states in UI |

### 2.4 Google Keep Import

| Status | Issue | Fix |
|--------|-------|-----|
| ❌ | No idempotency — re-importing same zip after 502 duplicates all notes | Hash zip content or individual note IDs; upsert on conflict |
| ❌ | Binary success/failure — user sees 0 or 2000 succeed; no partial-success reporting | Return `{ succeeded, failed, errors[] }` |
| ❌ | No target-brain selector — always lands in default brain | Add `brain_id` param to import endpoint |
| ❌ | No server-side note content size limit | Cap per-note content at 50 kB before INSERT |

### 2.5 Todo (`TodoQuickAdd.tsx` → `/api/capture`)

| Status | Issue | Fix |
|--------|-------|-----|
| ❌ | No client-side dedup — browser back / double-tap re-submits | Disable button on submit; re-enable on response |
| ❌ | No offline queue (unlike CaptureSheet) | Hook into `useBackgroundCapture` |
| ❌ | `due_date` / `repeat` stored free-form in metadata — no CHECK constraint | Add DB CHECK or Zod parse; normalise to ISO date |

### 2.6 MCP (`/api/mcp`)

| Status | Issue | Fix |
|--------|-------|-----|
| ❌ | No quota check — third-party clients can write unbounded entries free of charge | Apply `checkAndIncrement` in MCP handler before every `create_entry` |
| ❌ | `gmail_sync` shares the 30/min global limit with `create_entry` — 30 Gmail scans/min possible | Separate per-tool rate-limit keys |
| ❌ | `resolveApiKey()` uses first brain implicitly (`_lib/resolveApiKey.ts:32–41`) | Store `brain_id` explicitly on the API key record |
| ❌ | No structured tool-call audit log | Log `{ key_id, tool, args_summary, user_id, ts }` per call |

### 2.7 REST v1 (`/api/v1/ingest`)

| Status | Issue | Fix |
|--------|-------|-----|
| ❌ | No body size limit — 50 MB JSON parsed before `typeof` rejection (parser-DoS) | Add `Content-Length` check or `bodyParser` limit before JSON.parse |
| ❌ | No quota check | Apply `checkAndIncrement` |
| ❌ | Every update triggers `rebuildConceptGraph()` — full-brain LLM sweep on every call (`v1.ts:139,182`) | Debounce / queue concept-graph rebuild; run at most once per N minutes per brain |

### 2.8 AI Memory (`/api/memory-api`)

| Status | Issue | Fix |
|--------|-------|-----|
| ❌ | `retrieve_memory` reachable as LLM tool in chat — `generateEmbedding()` not gated by `checkAndIncrement`, burns embed quota silently | Count retrieval embedding calls against user quota |

---

## §3 — Enrichment Pipeline

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | `concepts_extracted` now only set on success — failed extractions retry on next batch run | Fixed in a32fd92 |
| ✅ | `patchMeta` re-reads current metadata before patching — concurrent runs no longer overwrite each other | Fixed in a32fd92 |
| ✅ | Anthropic HTTP errors logged (not silently swallowed) | Fixed in a32fd92 |
| ✅ | Auto-merge threshold raised 90 → 97 | Fixed in a32fd92 (`mergeDetect.ts:145`) |
| ✅ | Candidate cap at 50 rows (was 200) | Fixed in a32fd92 |
| ❌ | `parseAIJSON` silently drops all but first concept when model returns an array (`enrichBatch.ts:32`) | Return whole array; store all concepts |
| ❌ | Content truncated silently at 400 chars (insight) / 600 chars (concepts) | Chunk + summarise longer content |
| ❌ | Manual brace-balancing JSON repair accepts partially-formed responses as valid | Validate against Zod schema; reject-and-retry on mismatch |
| ❌ | Embeddings have no fallback — Gemini down = `embedded_at: null` entries that never appear in search | Mark `embedding_status = 'failed'`; expose to UI; enqueue retry |
| ❌ | No persistent enrichment job table — `runEnrichEntry` / `runEnrichBatchForUser` called everywhere but failures silently lost | `entry_enrichment_jobs(entry_id, attempt, next_run_at, error, status)` + cron drain |
| ❌ | No completeness-based prioritisation — oldest-first, weakest entries enriched last | Sort unenriched batch by `completeness_score ASC` |
| ⚠️ | Cron runs once daily at 18:00 UTC — real-time feel depends on per-write `runEnrichEntry` call | Per-write wiring now in place (40634ff). Still need cron for catch-up + the persistent job table for failures. |

---

## §4 — Database / RLS

| Status | Issue | Fix |
|--------|-------|-----|
| ❌ | `entries` base `CREATE TABLE` not in any migration — schema unauditable, can't rebuild from migrations | Capture current schema into `000_init.sql` |
| ❌ | `audit_log` referenced in code (`capture.ts:170–179`, `entries.ts:110,137,254`) but table never created — DELETE/PATCH/merge have no audit trail | Create table; make the write required (catch, don't swallow) |
| ❓ | `entry_brains` dropped in migration 025 but still actively queried in `api/entries.ts:52,470–515` and `api/capture.ts:124,187` | Decide: fully delete dead handler + all call-sites, or revive the table |
| ✅ | `user_usage` 406 on `.single()` for new billing periods | Fixed: all call-sites use `.maybeSingle()` (confirmed in CLAUDE.md) |
| ✅ | Missing FK indexes (links, messaging tables) | Added in migration 033 |
| ✅ | RLS policies scoped to `authenticated`; user API keys open-access fixed | Fixed in migration 032 |
| ❌ | Missing hot-path index `entries (user_id, created_at DESC) WHERE deleted_at IS NULL` | Add in next migration |
| ❓ | `brain_id` FK on entries — no explicit `ON DELETE` clause | Decide: `ON DELETE SET NULL` vs `ON DELETE CASCADE`, then add to next migration |
| ❌ | RLS on entries is `user_id = auth.uid()` only — brain-member isolation dropped in migration 032 | If/when shared brains ship, restore a brain-member RLS policy |
| ❌ | `IVFFlat lists=100` adequate to ~100k rows; plan HNSW reindex beyond that | Reindex to HNSW once `entries` exceeds 100k rows |
| ❌ | `vector(768)` hardcoded — switch to any other provider silently breaks semantic search (see P0 #11) | See P0 #11 fix |

---

## §5 — Frontend Reliability

| Status | Issue | Fix |
|--------|-------|-----|
| ✅ | Per-entry failure tracking in multi-entry save loop — failed entries surface via toast | Fixed in a32fd92 (`useCaptureSheetParse`) |
| ✅ | `useBackgroundCapture` retries failed saves up to 3× with backoff (not on 4xx) | Fixed in a32fd92 |
| ❌ | Ctrl+Enter bypasses `canSave` disabled guard → double-submit | Guard `handleSubmit` with an in-flight ref; disable on first fire |
| ❌ | Delete errors silently swallowed in `useEntryActions` — row reappears on refresh | Catch error, show toast, re-insert row on failure |
| ❌ | Optimistic edit with no rollback in `useEntryActions:129` — PATCH failure leaves state diverged | Snapshot state before optimistic update; restore on error |
| ❌ | No mid-request token refresh — 401 mid-flow becomes generic error | On 401: refresh token → retry once before surfacing error |
| ❌ | Enrichment status polled every 90 s (`useEnrichmentOrchestrator.ts:112`) | Subscribe via Supabase Realtime on the `entries` row instead |
| ❌ | Offline ops dropped silently after 7 days — user believes writes are queued | Surface warning + "replay" button when offline queue has expired items |
| ❌ | Double-scan Gmail possible — scan gate in component state; modal close/reopen resets it | Move gate to a ref or server-side lock |
| ❌ | Clipboard copy of newly-minted API key has no fallback (`ClaudeCodeTab.tsx:90`) — never shown again | Show key in a masked input field with copy button; confirm before closing |
| ❌ | No `AbortController` / timeout on any `fetch()` — slow provider → spinning UI forever | Add 30 s timeout via `AbortController` on all ingestion/enrichment fetches |

---

## §6 — Cost & Abuse Vectors

| Status | Issue | Path | Worst case |
|--------|-------|------|-----------|
| ❌ | `/api/capture` spammed — no token budget on enrichment | Per-user | ~120 LLM calls/min unmetered |
| ❌ | `/api/v1/ingest` triggers brain-wide concept-graph LLM sweep on every call | Per-write | O(N) LLM calls/write |
| ❌ | `/api/entries?action=audit` — 500 entries × 4k tokens × batches of 50 | Per-run | 200k+ tokens unmetered |
| ❌ | `retrieve_memory` tool in chat — free embed call per invocation | Per chat turn | Burns Gemini quota unmetered |
| ❌ | MCP `gmail_sync` — 30/min/key, no quota | Per key | 30 Gmail scans/min |
| ❌ | `/api/transfer` — 5/min × 2000 entries, all ingestion-triggered | Per-user | 10k entries/min |
| ❌ | Huge metadata JSONB — no size check | Per-row | Bloat, slow PATCHes |
| — | **Mitigation:** per-request LLM token budget (estimate tokens, deduct from `user_usage` before call, refund on provider error) | Covers most vectors above | — |

---

## §7 — Observability Gaps

| Status | Gap | Fix |
|--------|-----|-----|
| ⚠️ | No structured logging — `console.error` only, no `user_id`/`request_id`/`entry_id`/`step` | Adopt: generate `req_id` header if absent → thread through every log + `audit_log.request_id` + JSON stdout → pipe Vercel logs to Axiom/BetterStack |
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
