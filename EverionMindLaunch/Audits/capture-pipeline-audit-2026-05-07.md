# Capture Pipeline Audit — 2026-05-07

> Scope: `POST /api/capture` end-to-end — body parsing, idempotency, vault gate, free-tier branching, INSERT, audit_log write, awaited enrichInline, embed step, merge detect, streak. Cross-checks parity across other entry-creation doors (`v1.ts`, `mcp.ts`, `llm.ts` create_entry, `transfer.ts` import). Out of scope: capture-sheet UI (pending), enrichment-step internals (covered by enrichment-audit), retrieval (covered by retrieval-audit) — overlaps flagged inline.

## Verdict

**Capture core is solid.** Idempotency reserve/finalize/release closes the double-insert race, INSERT happens before any LLM step, free-tier path defers enrichment without bumping `attempts` (won't lock entries out of cron sweeps), 30 s `maxDuration` covers awaited `enrichInline`, source-URL dedup is point-query against the unique index, body-parser caps at 10 MB. Capture writes `audit_log` on success.

**The cracks are around the edges, not the core.** Five findings:

- **F1 (HIGH)**: `audit_log` write is fire-and-forget AND placed BEFORE awaited enrichInline — but it's gated by `response.ok` only, not by an idempotency-replay branch. **Replay path skips audit entirely**, so a retried successful capture never logs.
- **F2 (HIGH)**: Three sibling entry-creation doors (`v1.ts ingest`, `mcp.ts create_entry`, `llm.ts chat-tool create_entry`) write **zero** `audit_log` rows. Only `capture.ts` does. Audit coverage is incomplete by 75 %. `transfer.ts` import path also writes none. Carried theme from billing-audit F6 / production audit "audit_log coverage."
- **F3 (MED)**: Idempotency-key namespace is **flat per user** — no `capture:` / `vault-setup:` / `webhook:` prefix. A client that reuses the same Idempotency-Key header across `/api/capture` and `/v1/ingest` collides on the same `(user_id, idempotency_key)` row. `mcp.ts` and `v1.ts` use the same `idempotency_keys` table without namespacing.
- **F4 (MED)**: Body parser is `10mb` — fine for text — but the `p_content` cap is `200_000` chars (200 KB) and `p_metadata` is rejected at 64 KB. A 9.9 MB request body that's all-padding under those keys gets parsed in full before validation. No early `Content-Length` short-circuit. Bandwidth and parser-CPU waste.
- **F5 (LOW)**: `updateStreak` calls `auth/v1/admin/users/{id}` (PUT user_metadata) **fire-and-forget** with no audit row, no rate cap, no error path. A streak-write failure during a Supabase blip is silently dropped — user sees a successful capture but their streak counter doesn't move.

Several lower-tier findings on PII-in-error-message exposure, gmail attachment extraction race, and free-tier embed semantics covered below.

---

## Architecture overview

```
POST /api/capture                     (api/capture.ts:36-44)
    │   bodyParser sizeLimit 10mb     (api/capture.ts:23)
    │   maxDuration 30s               (vercel.json:7)
    ▼
withAuth                              (api/_lib/withAuth.ts:124-155)
    │   verifyAuth(req) → user.id     (Supabase JWT)
    │   rateLimit 30/min (capture)    (api/capture.ts:29-33)
    ▼
handleCapture(ctx)                    (api/capture.ts:72)
    │   bodyObject(req.body)          → 400 if not JSON object
    │   p_title required, max 500
    │   p_content max 200_000 chars   (api/capture.ts:92)
    │   p_extra_brain_ids ≤ 5 UUIDs   (api/capture.ts:80-88)
    │   requireBrainAccess(...)       (api/capture.ts:107-114)
    ▼
normalizeIdempotencyKey               (api/_lib/idempotency.ts:26)
    │   ASCII printable, ≤ 200 chars
    ▼
reserveIdempotency                    (api/_lib/idempotency.ts:52)
    │   atomic INSERT … ON CONFLICT
    │   reserved → proceed
    │   replay → return prior id 200
    │   in_flight → 409
    ▼
runCapture()                          (api/capture.ts:156)
    │   GEMINI_API_KEY present:
    │     loadUserAiContext(user.id)
    │     hasKey = anthropic|openai|gemini BYOK
    │     if tier=='free' && !hasKey:
    │       aiAllowed=false  ← row saves, no LLM
    │     else:
    │       checkAndIncrement('captures', tier, hasKey)
    │       429 if !allowed
    │   source_url scheme guard  http(s) only       (api/capture.ts:188-198)
    │   source_url dedup point-query  unique index  (api/capture.ts:202-225)
    │     match → PATCH metadata.sources[]; 200 merged
    │   metadata size ≤ 64 KB                       (api/capture.ts:228-230)
    │   completeness score                          (api/capture.ts:233-240)
    ▼
INSERT /rest/v1/entries                              (api/capture.ts:252)
    │   service-role headers
    │   409 → re-resolve via metadata.source_url
    ▼
finalizeIdempotency  fire-forget                    (api/capture.ts:283)
audit_log fire-forget  action='entry_capture'       (api/capture.ts:290-300)
    │   resource_id=data.id, request_id=req_id
    │   timestamp set client-side
    ▼
if (aiAllowed) await enrichInline(data.id, user.id) (api/capture.ts:312-315)
    │   parse  → insight  → concepts  → persona  → embed
    │   each step PATCHes entry.metadata.enrichment.{flag}
    │   stepEmbed PATCHes embedding column          (enrich.ts:487-530)
    │   recomputeEnrichmentState                    (enrich.ts:1073)
if (aiAllowed) detectAndStoreMerge fire-forget      (api/capture.ts:323-327)
updateStreak  fire-forget  PUT auth/v1/admin/users  (api/capture.ts:46-69)
    ▼
res.status(response.status).json(data)
```

`maxDuration: 30` (`vercel.json:7`) is the wall-clock budget. enrichInline averages 4–10 s on Gemini good days, 15–25 s on slow days. Embedding is the longest tail.

---

## What's solid

- **Idempotency reservation pattern** — atomic `INSERT ON CONFLICT` (`Prefer: resolution=ignore-duplicates,return=representation`) at `api/_lib/idempotency.ts:57-65`. If insert returns a row, we won the slot. If empty, we read the existing row to determine `replay` vs `in_flight`. Closes the SELECT-then-INSERT race that older code paths had.
- **enrichInline awaited, never fire-and-forget** — `api/capture.ts:313` does `await enrichInline(...).catch(...)`. Vercel kills the function the instant the response goes out, so a fire-and-forget Promise would die mid-step. Confirmed pattern at `v1.ts:226`, `v1.ts:291`, `mcp.ts:929`, `mcp.ts:963`, `llm.ts:343`. All four entry-creation doors await.
- **Free-tier path, post 1c3c340** (`api/capture.ts:154-184`) — `aiAllowed=false` when `tier === 'free' && !hasKey`. Row INSERTs cleanly; `enrichInline` is skipped (`api/capture.ts:312`); `enrichment_state` defaults to `'pending'`. After upgrade or BYOK, the daily cron's `claim_pending_enrichments` RPC (referenced in `architecture/capture.md:340`) catches up. `enrichInline` itself has a second guard at `enrich.ts:884-888` — when `resolveProviderForUser` returns null, it does `setEnrichmentState(entryId, 'pending')` and returns WITHOUT bumping the attempts counter. Critical: a 5-attempt cap would lock the row out of future sweeps. This is the right shape.
- **Vault gate at every door** — `api/capture.ts` doesn't reject `safeType === 'secret'` from clients but `enrichInline` short-circuits secrets at `enrich.ts:854-859` with `setEnrichmentState(entryId, 'done')` so secrets bypass every LLM step. Other doors block creation outright (`mcp.ts:516-519`, `v1.ts:254-258`, `llm.ts:303-306`). Capture path leaves the door open for the in-app vault to write secrets directly — but every read path in `entries.ts`, `llm.ts`, `mcp.ts`, `v1.ts` filters `type === 'secret'` before returning content (see surface map).
- **source_url dedup is O(1)** — point query against `entries_user_source_url` unique index (`api/capture.ts:202-225`), with the unique-violation 409 also handled (`api/capture.ts:260-275`) by re-resolving the existing id from `metadata->>source_url` rather than picking a random user entry.
- **JWT-resolved user.id, never client-supplied** — `withAuth` calls `verifyAuth(req)` and the resolved `user.id` is what lands in `safeBody.p_user_id` (`api/capture.ts:102`) and `audit_log.user_id` (`api/capture.ts:294`). Client `p_user_id` cannot override.
- **Metadata size cap before INSERT** — `api/capture.ts:228-230` rejects `JSON.stringify(safeBody.p_metadata).length > 64_000`. Stops bloat from pathological clients before it reaches `entries.metadata` JSONB.
- **enrichInline has a quota gate** (`enrich.ts:895-912`) so a runaway script can't drain LLM credits. `fail-OPEN` semantics on Supabase blips (`enrich.ts:899-905`) — entry left at `pending` rather than `failed`, recoverable on next sweep.
- **Embedding shape guard** (`enrich.ts:466-468`, `481-483`) — every embedding return must be exactly 768 dims; a length mismatch throws **before** the PATCH so we don't silently land a `vector(768)` PostgREST 400 that leaves `embedding_status='pending'` forever.
- **Embed PATCH error surface** — `enrich.ts:516-521` no longer swallows PostgREST 400 on the embed write. A failed PATCH throws and the catch at `523-528` stamps `embedding_status='failed'` so the cron skips it.

---

## Findings

### F1 — `audit_log` skipped on idempotency replay branch — HIGH

**Severity: HIGH** — audit-coverage gap

`api/capture.ts:127-130`:

```ts
if (reserve.kind === "replay") {
  return void res.status(200).json({ id: reserve.entryId, idempotent_replay: true });
}
```

A retried capture (same Idempotency-Key) hits this short-circuit and returns 200 **without writing an `audit_log` row**. The original capture's audit row is whatever happened on first try — fire-and-forget at line 290 with no error path. If the client retries twice, audit history shows zero or one rows for two successful capture API calls.

Same shape on `v1.ts:368-370` and `mcp.ts:903-910`.

The 409 dedup-merge path at `api/capture.ts:268-271` also returns merged without an audit row — semantically a "second capture from the same source URL" that updated metadata silently.

**Why HIGH**: production audit and billing audit F6 already flagged audit_log coverage as a launch-blocker. With `audit_log` migration 057 live (LAUNCH_CHECKLIST.md:705), retroactively reconstructing capture history for incident response REQUIRES the rows to actually land.

**Fix shape**:
```ts
// On replay
fetch(`${SB_URL}/rest/v1/audit_log`, {
  method: "POST",
  headers: sbHeaders({ Prefer: "return=minimal" }),
  body: JSON.stringify({
    user_id: user.id,
    action: "entry_capture_replay",
    resource_id: reserve.entryId,
    request_id: req_id,
    timestamp: new Date().toISOString(),
  }),
}).catch(() => {});
return void res.status(200).json({ id: reserve.entryId, idempotent_replay: true });
```

Same pattern for the dedup-merge path at line 220 → emit `entry_capture_merged` with the existing id and the new source_url in metadata.

Also: the audit insert at line 290 is fire-and-forget. A Supabase blip drops the row silently. The `.catch(...)` only logs. Consider a small in-process retry (3 attempts, 100/300/700 ms) for `audit_log` writes — this is the security-critical sink, NOT user-facing latency.

---

### F2 — Sibling entry-creation doors write no `audit_log` — HIGH

**Severity: HIGH** — enterprise audit gap

Grep `audit_log` writes against the four entry-creation doors:

| Door | File | INSERTs entries? | audit_log row on create? |
|---|---|---|---|
| `POST /api/capture` (web/PWA) | `api/capture.ts:252` | yes | yes (line 290) — see F1 caveat |
| `POST /v1/ingest` (em_ API key) | `api/v1.ts:213` | yes | **no** |
| MCP `create_entry` tool | `api/mcp.ts:534` | yes | **no** (only `auditToolCalls` for chat tools at `llm.ts:472-494` — different flow) |
| LLM chat tool `create_entry` | `api/llm.ts:317` | yes | **no** |
| `POST /api/import` (transfer) | `api/transfer.ts:121` | yes (bulk) | **no** |

`audit_log` is the security-critical sink. The audit-only catches captures from the web/PWA. **Three out of four doors are dark to compliance** and the import path could land thousands of rows without a single audit entry.

`v1.ts:226` and `mcp.ts:929` await enrichInline — they know how to extend the post-INSERT block. They just don't.

**Why HIGH**: launch-grade product. Audit log is the primary forensic tool for incident response. A user reports "I never created this entry" — you need an audit_log row with `request_id`, `user_id`, `key_id` (for em_ tokens), action, resource_id, timestamp.

**Fix shape** — extract `auditEntryCapture(userId, entryId, reqId, opts)` to `api/_lib/auditCapture.ts` (3-line helper that wraps the existing `fetch /rest/v1/audit_log POST`). Call from all four create-entry sites with the appropriate action: `entry_capture`, `entry_capture_v1`, `entry_capture_mcp`, `entry_capture_llm`, `entry_import`. For `transfer.ts` import: write one `audit_log` row per chunk (not per row) with `metadata: { count, brain_id, source_format }`.

---

### F3 — Idempotency-key namespace is flat per user — MEDIUM

**Severity: MEDIUM** — cross-endpoint key collision

`api/_lib/idempotency.ts:60` insert:

```ts
body: JSON.stringify({ user_id: userId, idempotency_key: key, entry_id: null }),
```

The unique key in `idempotency_keys` is `(user_id, idempotency_key)`. **No namespace prefix**. A client that uses a UUID generator and reuses it across `/api/capture`, `/v1/ingest`, `/api/mcp` (create_entry), AND `/api/vault?action=setup` (which uses `reserveActionIdempotency` per `idempotency.ts:127`) collides. The second endpoint sees the slot as `replay` or `in_flight` and either:

- Returns the wrong `entry_id` (capture for a v1.ingest replay) — wrong-data leak across endpoints
- Returns 409 in_flight when the user genuinely has fresh work — UX lockout

`reserveActionIdempotency` at `idempotency.ts:127` is documented to require a namespaced key like `vault-setup:<client-key>` (per the docstring at lines 113-117), but `reserveIdempotency` (the entry-creation path at `idempotency.ts:52`) takes the raw header value with no enforced prefix. A vault-setup call that writes `vault-setup:abc123` and a capture call that writes `vault-setup:abc123` (because the client copy-pasted) both land in the same row.

**Mitigation in place**: SDK-generated keys are usually random UUIDs, collisions in practice are vanishingly rare. The TTL is 24 h.

**Why MEDIUM not LOW**: a buggy client (especially the MCP tool — which exposes `Idempotency-Key` to LLM-driven clients per `mcp.ts:899`) can produce semantically wrong responses. A future audit caller asking "give me the entry for idempotency-key foo" gets a vault setup row.

**Fix shape**:
```ts
// In normalizeIdempotencyKey, optionally accept a `prefix` param.
// In reserveIdempotency, prepend an endpoint-scoped prefix:
const namespacedKey = `capture:${rawKey}`;
// v1: `v1-ingest:${key}`, mcp: `mcp-create:${key}`, vault-setup: `vault-setup:${key}`
```

Migration: backfill is unnecessary (24 h TTL means existing rows roll off in a day).

---

### F4 — 10 MB body parser, validation deep — MEDIUM

**Severity: MEDIUM** — DoS bandwidth/CPU waste

`api/capture.ts:23`:

```ts
export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
```

But the explicit field caps in `runCapture` are:

- `p_title` ≤ 500 chars (`api/capture.ts:91`)
- `p_content` ≤ 200_000 chars / 200 KB (`api/capture.ts:92`)
- `p_metadata` rejected if `JSON.stringify(...).length > 64_000` / 64 KB (`api/capture.ts:228-230`)
- `p_tags` ≤ 50 strings (`api/capture.ts:99-101`)
- `p_extra_brain_ids` ≤ 5 UUIDs (`api/capture.ts:83`)

Sum of legit caps: ~265 KB total. **The parser accepts ~38× that.** A malicious client posts 10 MB of `{ p_metadata: "<huge>" }` — Vercel parses 10 MB into a JS object, capture validates, throws `metadata too large — max 64 KB`. The bandwidth was burned, the JSON parse CPU was burned, the rate-limiter let it through (rate is 30/min on the capture path — 30 × 10 MB = 300 MB/min/user can be cycled).

**Why not HIGH**: rate limit caps the floor at 30/min. Vercel's outer ingress is unmetered for the user. Real DoS budget is the origin function-time + bandwidth bills.

**Fix shape**:
1. Lower `sizeLimit` to `512kb` for `/api/capture`. The biggest legit body is title (500) + content (200_000) + metadata (64_000) + tags (50 × ~50) + brains (5 × 36) ≈ 265 KB raw → ~340 KB encoded. 512 KB gives 50 % headroom.
2. The link-save path (`action=links`) and embed-batch path also share the same 10 MB cap — review whether links + embed need it. Embed batch operates on stored entry IDs (~25 entries × UUID = small), so 512 KB covers it.
3. If file-attachment captures land in `/api/capture` later (currently they go through `/api/llm?action=extract-file` — `api/llm.ts:36` has `25mb`), keep that on a separate file path.

This is the **same shape** as the v1 path — `v1.ts:15` sets `1mb` already, which is correct for an API token endpoint where p_content is cap-bounded. Capture should match.

---

### F5 — `updateStreak` uses admin endpoint with no error path — LOW

**Severity: LOW** — silent UX degradation

`api/capture.ts:46-69`:

```ts
async function updateStreak(userId: string): Promise<void> {
  ...
  await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: { ...authHdr, "Content-Type": "application/json" },
    body: JSON.stringify({ user_metadata: { ...meta, current_streak, longest_streak, last_capture_date: today } }),
  });
}
```

Called fire-and-forget at `api/capture.ts:329`:

```ts
updateStreak(user.id).catch((err) => console.error("[capture] streak update failed", err));
```

Issues:
1. **No audit_log on streak mutation.** Streak counter is product-visible behaviour; an attacker with stolen service-role key (already a critical compromise but) bumping random users' streaks would leave no trace.
2. **Read-modify-write race.** Two concurrent captures from the same user — both read `last_capture_date != today`, both compute `current_streak = current+1`, last writer wins. Streak doesn't double-count today (because the date check holds), but two captures in different timezones near midnight could mis-set `last_capture_date`. Unlikely in practice (sub-second concurrent captures from one user).
3. **No retry, no audit, no metric.** A single Supabase 5xx and the streak just doesn't update. User sees their entry land, opens the streak chip, sees yesterday's number. They contact support.

**Mitigation in place**: streak is loosely consistent by design — yesterday/today/longest are computed from the timestamp delta on next capture. Recovery is automatic on next successful capture.

**Fix shape**: low priority. If touching: move streak read-modify-write into a `bump_streak(p_user_id)` plpgsql RPC that does the update atomically inside one transaction with the timestamp check. Adds 0 ms latency and removes the race.

---

### F6 — `enrichInline` Gmail-attachment late-extract is fire-and-forget'd at scan time — LOW (overlap with enrichment-audit)

**Severity: LOW** — covered by enrichment-audit; flagging for traceability

`api/_lib/enrich.ts:925-947` runs `extractGmailAttachmentsForEntry` inline INSIDE enrichInline as a belt-and-braces — but the upstream Gmail scan path at `gmailScan.ts:1842` calls `extractGmailAttachmentsForEntry(entryId, userId)` fire-and-forget on classify+accept. If that fire-and-forget call is killed, `attachment_text` is missing when the subsequent capture-path enrichInline runs. The inline-late-extract here saves them. Belt-and-braces is correct, but it means enrichment-step parse/insight/concepts run on `attachment_text=""` when extraction fails twice.

Out of scope for capture-pipeline (root cause lives in gmailScan + enrichment.ts). Cross-reference enrichment-audit when produced.

---

### F7 — Free-tier `embed` action via `?action=embed` does NOT check `aiAllowed` — LOW

**Severity: LOW** — inconsistent free-tier semantics

`api/capture.ts:405-538` — the `handleEmbed` action runs `checkAndIncrement(...)` for `batch && brain_id` (lines 458-472) but the **single-entry path (entry_id, no batch)** at lines 411-447 does **not** check tier or BYOK. A free-tier user with no key hits `handleEmbed` for a single entry → the `if (!apiKey) throw new ApiError(500, ...)` at line 407 fires only when `GEMINI_API_KEY` env is unset. With it set (as is the case in prod per the `GEMINI_API_KEY` constant at line 26), the free-tier user with no BYOK can call /api/embed for a single entry and consume managed-AI quota with **zero billing tracking**.

The capture-default path at `api/capture.ts:160-184` correctly gates this — a free user with no key has `aiAllowed=false`. The `?action=embed` route does not.

**Fix shape** — at top of single-entry `handleEmbed` block, add the same `loadUserAiContext + checkAndIncrement` gate that the batch path already has at lines 456-472. Or short-circuit if `tier === 'free' && !hasKey` with 402.

---

## Surface map — every entry-creation door

| Door | File:line | Auth | Awaits enrichInline | Writes audit_log | Idempotency-key prefix |
|---|---|---|---|---|---|
| `POST /api/capture` | `capture.ts:36` | JWT (Supabase user) | yes (`:313`) | yes (`:290`) — fire-forget — see F1 | none — F3 |
| `POST /v1/ingest` | `v1.ts:349` (action=ingest) | em_ API key | yes (`:226`) | **no** — F2 | none — F3 |
| MCP `create_entry` | `mcp.ts:873` | em_ API key (SSE/JSON-RPC) | yes (`:929`) | **no** — F2 | none — F3 |
| LLM chat-tool `create_entry` | `llm.ts:294` | JWT | yes (`:343`) | **no** — F2 (chat-tool audit at `:472-494` audits the *call*, not the *entry creation*) | n/a (no idempotency support on LLM chat path) |
| `POST /api/import` (transfer) | `transfer.ts:121` | JWT | enrichBrain background batch | **no** — F2 | n/a (single import is implicitly idempotent via `import_hash` dedup at `:171`) |

**Surface inconsistency** — capture+v1 use the same `reserveIdempotency` flow (good), but mcp uses a sibling-but-separate replica of the pattern (`mcp.ts:899-911`) without the in_flight handling that capture/v1 have. Subtle: mcp returns the prior `entryId` on replay (correct) but on `in_flight` returns a JSON-RPC error code -32000 with text — which downstream MCP clients may not retry on. Whereas capture returns HTTP 409 which most HTTP clients DO retry on. Different door, different retry semantics for the same race.

---

## Findings to specifically prove or refute

| Question | Answer | Evidence |
|---|---|---|
| Does every capture path call `enrichInline` synchronously? | **Yes** — capture, v1.ingest, v1.update, mcp.create_entry, mcp.update_entry, llm.create_entry, llm.update_entry all `await enrichInline(...).catch(...)` | `capture.ts:313`, `v1.ts:226`, `v1.ts:291`, `mcp.ts:929`, `mcp.ts:963`, `llm.ts:343` |
| Does the audit_log write happen BEFORE or AFTER enrichInline? | **BEFORE** — line 290 fires before line 313's `await enrichInline`. So an enrich crash leaves audit_log intact (correct ordering). | `capture.ts:290` vs `:313` |
| Body-size guard before parsing? | **No early Content-Length guard.** Vercel's `bodyParser.sizeLimit: "10mb"` is the only ceiling. Field-level caps validate AFTER parse. F4. | `capture.ts:23` |
| Idempotency-key replayed correctly under concurrent retries? | **Yes for the main race** — atomic INSERT-ON-CONFLICT at `idempotency.ts:57` is the canonical reservation. Replay returns prior id; in_flight returns 409. Verified release path on error at `capture.ts:140-143`. **F3 caveat**: namespace flat per user. | `idempotency.ts:52-80` |
| Does free-tier path skip embedding correctly per 1c3c340? | **Yes for capture default path.** `aiAllowed=false` gates both `enrichInline` (line 312) AND `detectAndStoreMerge` (line 323). Row inserts cleanly with `enrichment_state='pending'` (column default). enrichInline's own no-provider gate at `enrich.ts:884-888` does NOT bump `attempts`, so cron-eligibility is preserved. **F7 caveat**: `?action=embed` single-entry path does not enforce the same gate. | `capture.ts:154-184`, `enrich.ts:884-888` |
| Does enrichInline crash silently swallow errors? | **No** — per-step errors land in `stepErrors[]` and stamp `metadata.enrichment.{last_error, attempts, last_attempt_at}`. Silent skips (callAI returned `""`) land in `last_skip_reason`. Successful runs clear `last_error`. | `enrich.ts:963-1049` |
| Does enrichInline skip embedding on `embedding_status='failed'`? | **Yes** — `enrich.ts:1056` `if (!opts.skipEmbed && !flags.embedded && flags.embedding_status !== "failed")`. Stops thrashing on permanently-bad rows. | `enrich.ts:1056` |
| Does the secret type bypass enrichment? | **Yes** — `enrich.ts:854-859` short-circuits with `setEnrichmentState(entryId, 'done')`. Persona extractor also skips secrets at `extractPersonaFacts.ts:325`. Merge sources flag the type at `mergeEntries.ts:215`. | `enrich.ts:854-859` |

---

## Time-to-enriched / 5xx telemetry — Limitations

The `mcp__claude_ai_Supabase__execute_sql` and `mcp__claude_ai_Supabase__get_logs` tools requested in the audit prompt are **not exposed** in this thread (the deferred-tool list contains chrome-devtools, gmail, notion, vercel, but no Supabase MCP — `plugin_supabase_supabase__authenticate` requires OAuth re-pairing not yet completed). Cannot run:

- `select count(*) from entries where created_at > now() - interval '7 days'`
- `select percentile_cont(0.95) within group (order by extract(epoch from (now() - created_at))) as p95_age_secs from entries where (metadata->'enrichment') is not null and created_at > now() - interval '24 hours'`
- `mcp__claude_ai_Supabase__get_logs service:'api'` for capture-route 5xx in 24 h

**Defer to**: the consolidated Supabase live-data check is owned by the production-audit; this audit covers code-path correctness. Once Supabase MCP re-paired, run the two queries above and append a `## Telemetry — YYYY-MM-DD` block to this file.

---

## Recommendations (priority)

1. **[HIGH] F1** — emit `audit_log` on the idempotency-replay AND merge-dedup branches. Capture-route. ~10 lines.
2. **[HIGH] F2** — extract `auditEntryCapture` helper and wire it into `v1.ts:230`, `mcp.ts:937`, `llm.ts:347`, `transfer.ts:142`. ~30 lines + 1 file.
3. **[MED] F3** — namespace idempotency keys: `capture:`, `v1-ingest:`, `mcp-create:`. Apply at the call site (no migration — 24 h TTL). ~6 lines.
4. **[MED] F4** — drop capture's `bodyParser.sizeLimit` from `10mb` to `512kb`. One line in `capture.ts:23`. Verify links and embed paths still fit.
5. **[LOW] F5** — replace `updateStreak` JS function with a `bump_streak(p_user_id)` RPC for atomicity. Out of launch scope.
6. **[LOW] F6** — track in enrichment-audit follow-up.
7. **[LOW] F7** — gate `?action=embed` single-entry path with the same `loadUserAiContext + checkAndIncrement` flow the batch path already uses (lines 456-472). ~15 lines.

---

## Method

- Read `api/capture.ts` 1–538 end-to-end. Mapped every code path: text capture, dedup-merge, INSERT, 409 race, idempotency reserve/finalize/release, free-tier branch, source_url validation, audit_log, enrichInline await, mergeDetect fire-forget, streak fire-forget, save-links action, embed single + batch.
- Read `api/_lib/idempotency.ts` 1–153 — namespace, reservation atomicity, TTL 24 h, lazy 1 % cleanup, action-style variant.
- Read `api/_lib/enrich.ts` 1–230, 350–530, 808–1077 — enrichInline shape, no-provider early bail, quota gate fail-OPEN, Gmail late-extract belt-and-braces, runStep error breadcrumbs, recomputeEnrichmentState convergence, embed dim guard.
- Read `api/_lib/sbHeaders.ts` — service-role usage confirmed, single source of truth.
- Read `api/_lib/withAuth.ts` lines 100–252 — JWT-based `verifyAuth` resolves `user.id`; api-key variant resolves `auth.userId` via `resolveApiKey`. Both feed audit_log when present.
- Read `api/_lib/requestBody.ts` — body validation helpers; no streaming, no early Content-Length guard.
- Read `vercel.json` — capture is `maxDuration: 30`, function-count budget `12` already at limit.
- Read `EverionMindLaunch/architecture/capture.md` 230–360 to align findings with documented expectations.
- Cross-checked four entry-creation doors: `api/capture.ts`, `api/v1.ts`, `api/mcp.ts`, `api/llm.ts` (chat-tool create_entry), `api/transfer.ts` (import).
- Grepped `audit_log` writes across `api/` to verify which actions trace.
- Grepped `bodyParser` sizeLimit across `api/` to compare cap policies.
- Grepped `type === "secret"` to verify vault-bypass coverage.
- Did not exercise live capture flow against staging — code-path audit only.
- Supabase MCP queries deferred — see Limitations.

**Audit kicked off by**: senior-staff-engineer pre-launch capture-pipeline audit, 2026-05-07.
