# Production Audit — 2026-05-06

Three-dimension audit ahead of public launch. Three specialised passes ran in parallel, each focused on a different threat surface. This file is the executive synthesis. Detailed findings live in the section files.

| Section | File | Findings |
|---|---|---|
| Security | [audit-security-2026-05-06.md](audit-security-2026-05-06.md) | 3 critical / 5 high / 4 medium / 8 informational |
| Stability & scale | [audit-stability-2026-05-06.md](audit-stability-2026-05-06.md) | 4 critical / 5 high / 5 medium / 8 informational |
| Code quality & architecture | [audit-architecture-2026-05-06.md](audit-architecture-2026-05-06.md) | 5 high / 9 medium / 9 informational |

**Verdict:** **Not yet ready for public launch.** Solid foundations — middleware chain, rate limiter, idempotency, vault crypto are above the typical bar. But the security pass found three exploitable issues that bypass authorization (any authed user can mutate any entry by UUID, enumerate other users' wrapped DEKs, and retype entries to vault state to hide them). The stability pass found that Gmail-scan + enrichment fan-out will saturate Vercel timeouts the moment 5+ active users overlap a cron window. The architecture pass found a 1700-line dispatcher and security-critical code (`isAdminUser`) duplicated across files with no shared source.

Counts roll up to **7 critical** and **15 high-priority** findings to clear before opening the gates beyond beta.

---

## Top 10 cross-cutting issues (ranked by exploitability × blast radius)

### 1. Mutating PATCHs scope only on `id` after ownership pre-check — service-role bypasses RLS
**Severity:** Critical (security)
**Files:** `api/mcp.ts:497,388`, `api/v1.ts:278,312`
A read query confirms ownership, then the write hits `entries?id=eq.<id>` with no `brain_id` / `user_id` filter. Service-role bypasses RLS, so the write has no second safety net. A bug in brain resolution or a TOCTOU race lets the PATCH land on someone else's entry. **Fix:** scope every mutating PATCH to both `id` AND `user_id` (and ideally `brain_id`) — defense-in-depth for service-role calls.

### 2. `brain_vault_grants` GET leaks every user's wrapped DEK for any known brain UUID
**Severity:** Critical (security)
**File:** `api/user-data.ts:1665–1675`
With `?brain_id=X` the scope filter drops `user_id=eq.<caller>`. Any authed user enumerates wrapped DEKs for any brain whose UUID they know. **Fix:** always AND the filter with `user_id=eq.<caller>`, or gate the brain-scoped variant to brain owners only.

### 3. `/v1/update` allows retyping an entry to `type=secret` with no guard
**Severity:** Critical (security)
**File:** `api/v1.ts:260`
MCP guards this; v1 doesn't. A caller can retype any owned entry to `secret`, hiding it from search and putting unencrypted content into vault-item state. **Fix:** mirror the MCP guard — reject `type=secret` on update.

### 4. Gmail scan fans out unbounded `Promise.all` over all users — 300s timeout at >5 users
**Severity:** Critical (stability)
**File:** `api/_lib/gmailScan.ts:2309`
Daily cron triggers N parallel `scanGmailForUser` calls. Each scan does Gemini classification + per-attachment PDF extraction. At 20 users this exceeds the 300s Vercel ceiling and silently leaves users half-scanned with `last_scanned_at` already updated. **Fix:** swap `Promise.all` for `mapWithConcurrency(integrations, 4, ...)` and add a per-user 45s `AbortController`.

### 5. Auto-accept enrichment IIFEs are killed by Vercel before completing
**Severity:** Critical (stability)
**File:** `api/_lib/gmailScan.ts:1466`, `1821`
`(async () => { ... })()` after the response is sent — Vercel freezes the process the moment `res.end()` lands. Auto-accepted Gmail entries are stuck with red P/I/C/E chips until the hourly cron sweeps (up to 60 min). **Fix:** await enrichment inline, or batch IDs and await `enrichBrain` once at the end of the scan.

### 6. `enrichAllBrains` full-table scans `brains` with no `limit` — silent truncation past 1000
**Severity:** Critical (stability)
**File:** `api/_lib/enrich.ts:1855`
PostgREST default `max_rows=1000`. Beyond 1000 brains, additional brains are simply never enriched. **Fix:** add `&limit=1000&order=id` and cursor-paginate, or filter to brains with pending entries only.

### 7. `isAdminUser()` copy-pasted across `entries.ts` and `user-data.ts` — silent security drift
**Severity:** High (architecture)
**Files:** `api/entries.ts:1038`, `api/user-data.ts:3225`
Identical 3-line check gating the admin CRM endpoints (tier mutation, PII lookup) duplicated with no shared source. Hardening one site and forgetting the other silently weakens half the admin surface. **Fix:** extract to `api/_lib/adminAuth.ts`, import in both.

### 8. `handleDelete` & `handlePatch` resolve `brain_id` without a `user_id` filter — brain members can delete others' entries
**Severity:** High (security)
**Files:** `api/entries.ts:215`, `api/entries.ts:341`
The pre-check fetch uses `entries?id=eq.<id>&select=brain_id` — no owner filter. `requireBrainAccess` then passes if the caller is a member/viewer of *any* brain the entry is in. A brain member can enumerate entry UUIDs from the shared overlay and soft-delete entries they don't own. **Fix:** add `user_id=eq.<caller>` to the resolution fetch.

### 9. Shared-entry overlay in `handleGet` includes vault entries — encrypted ciphertext leaks via standard list
**Severity:** High (security)
**File:** `api/entries.ts:175`
`or=(brain_id.eq.X, id.in.(sharedIds))` — the `type=neq.secret` guard only applies to the brain arm, not the shared-id arm. A vault entry shared into a brain returns its (encrypted) ciphertext via the standard entries list. **Fix:** strip secrets from `sharedIds` before assembling the OR, or block `type=secret` from `entry_shares` at the DB layer.

### 10. `api/entries.ts` is a 1700-line single-file dispatcher with 20+ action handlers
**Severity:** High (architecture)
**File:** `api/entries.ts`
Cyclomatic complexity ceiling has been hit. Inconsistent action naming (kebab vs underscore). `merge_into` skips the LLM/audit/undo path entirely (silent semantic divergence from `merge`). Adding the next feature reliably creates a missed-branch bug. **Fix:** split into `_lib/handlers/entryMerge.ts`, `entryPersona.ts`, `entryGmail.ts`, `entryAdmin.ts`, `entryCRUD.ts`. The `_lib/mergeEntries.ts` pattern proves this works.

---

## Critical-path checklist before public launch

These are **blocking** for the public-launch gate. None are large lifts individually — most are 1-line filter additions or `mapWithConcurrency` swaps.

- [ ] **Lock down mutating PATCHs** — add `user_id` filter to every PATCH/DELETE on `entries` (`api/mcp.ts:497,388`, `api/v1.ts:278,312`, `api/entries.ts:215,341`).
- [ ] **Fix brain_vault_grants leak** — always AND `user_id=eq.<caller>` (`api/user-data.ts:1665`).
- [ ] **Block type=secret on /v1/update** (`api/v1.ts:260`).
- [ ] **Strip vault entries from shared-entry overlay** (`api/entries.ts:175`).
- [ ] **Bound Gmail scan concurrency** to 4 with `mapWithConcurrency` (`api/_lib/gmailScan.ts:2309`).
- [ ] **Await auto-accept enrichment** instead of fire-and-forget IIFEs (`api/_lib/gmailScan.ts:1466,1821`).
- [ ] **Paginate `enrichAllBrains`** with `&limit=1000&order=id` cursor (`api/_lib/enrich.ts:1855`).
- [ ] **Bound `persistMatches` Gemini fan-out** to 3 with `mapWithConcurrency` (`api/_lib/gmailScan.ts:1281`).
- [ ] **Extract `isAdminUser`** to a single shared module.
- [ ] **Reduce JWT cache TTL** from 30s to 5–10s (`api/_lib/verifyAuth.ts:7`).
- [ ] **Fix Anthropic-fallback paths** in `gmailScan.ts:906` and `gmail.ts:53` — route through `callAI` so Gemini-managed users get the deep-extract path.
- [ ] **Fix open-redirect risk** in lemon-checkout `successUrl` — use allowlisted origin, not request `host` (`api/user-data.ts:2939`).

## High-priority hardening (fix during the next 2–4 weeks)

- [ ] Key `withApiKey` rate limit on `userId:path`, not `ip:path` (NAT collisions, multi-key bypass).
- [ ] Stop echoing the raw `em_*` API key as the OAuth `access_token` — issue a short-lived JWT (`api/mcp.ts:557`).
- [ ] Replace `_cache` in `search.ts` with a sized LRU mirroring `verifyAuth.ts` eviction.
- [ ] Bound `handleEmptyTrash` and `handleBulkPatch` with chunked deletes + AbortController.
- [ ] Fix `upsertGmailContact` race (cache misses on concurrent same-sender scans).
- [ ] Audit-log writes for `merge_into` action — currently bypassed, breaks merge-undo invariant.
- [ ] `runGeminiBatch` in `handleAudit` to use `callAI()` retry path, respect BYOK.
- [ ] Centralise all `SB_HDR` / `hdrs()` factories into the existing `sbHeaders.ts` (5+ duplicates).
- [ ] Remove `OAUTH_STATE_SECRET` fallback to service-role key.
- [ ] Strip unused providers from CSP `connect-src` (openrouter, groq if unused).
- [ ] Replace `console.log` audit lines with structured `log.info` so they show in log queries.

## Strategic refactors (3–6 month payoff)

- **Split `api/entries.ts`** into per-concern handler modules. Single biggest leverage point for future-feature velocity. The `mergeEntries.ts` shared-core / thin-wrapper pattern is the model.
- **Type the request body as `unknown` + Zod parse-at-boundary**. Removes ~20 hand-rolled validator pairs and gives runtime + compile-time enforcement.
- **Move `verifyAuth` JWT cache to Upstash Redis**. Per-process cache provides no protection in cold-boot serverless. Pair with TTL drop to 5s.
- **Push `checkBrainAccess` into a single Postgres RPC** (UNION owner + member check, cacheable). Halves auth latency for shared-brain members on every entry write.
- **Enable RLS as a DB-layer second safety net** even when service-role bypasses it — currently every authorization bug in API code is a one-liner away from being exploitable.
- **API integration tests** for billing webhooks, vault round-trip, and merge+undo — three highest-risk surfaces with zero coverage today.

## Things working well (don't break these)

The audit isn't all bleeding. Several patterns are above the bar for an early-stage codebase:

- `api/_lib/withAuth.ts` middleware chain — clean, composable, full concern surface in one place.
- `api/_lib/rateLimit.ts` circuit breaker (fail-closed, 3-failure threshold, 5-minute reset) is production-grade.
- `api/_lib/mergeEntries.ts` shared-core pattern (one impl, four surfaces consume it). This is the model for the `entries.ts` split.
- `enrichInline` per-step flag idempotency — partial failures auto-retry without re-running completed steps.
- `signOAuthState` HMAC + nonce + state binding — correct OAuth state design.
- Vault entries' client-side WebCrypto encryption — server never sees plaintext, threat model is coherent.
- Webhook signature verification with constant-time compare (no timing leaks).
- `verifyAuth` AbortController timeout (5s) on the Supabase auth call — hung-Supabase scenarios won't take down Vercel functions.

These patterns should be the template for fixing the rest.
