# Code Quality & Architecture Audit — 2026-05-06

## Executive summary

The codebase is remarkably well-commented and defensively written for a solo/small-team product. The middleware chain (`withAuth`, `rateLimit`, `verifyAuth`) is solid, the sbHeaders centralisation works, and the enrichment pipeline's flag-based idempotency is a good pattern. The primary architectural rot comes from three sources: (1) `api/entries.ts` has grown to ~1700 lines with 20+ action-routed handlers that can no longer be reasoned about as a unit — it is the single biggest future-feature blocker; (2) `isAdminUser()` is copy-pasted verbatim into two separate files with no shared source, creating a silent drift risk on a security-critical check; (3) `api/_lib/enrich.ts` and `api/user-data.ts` each define their own local `SB_HDR`/`SB_KEY`/`SB_URL` constants instead of using the canonical `sbHeaders()` from `_lib/sbHeaders.ts`, contradicting the "single source of truth" comment in that file. Type safety is superficially thin — `any[]` destructuring of DB rows throughout means a schema change produces silent runtime errors, not TypeScript errors. Test coverage of the enrichment pipeline, vault, and billing webhooks is zero.

---

## High-priority findings (block confident future work)

### F1: `isAdminUser()` duplicated across security boundary — silent drift risk

- **Confidence**: high
- **Files**: `api/entries.ts:1038–1043`, `api/user-data.ts:3225–3227`
- **Smell**: Identical 3-line function gating 10+ admin endpoints copy-pasted into two files. Any future change to the admin-check logic (e.g. adding role granularity, adding a second flag, or supporting a `roles` array) must be applied in two places. Miss one and half the admin surface is unprotected with no compiler or linter signal.
- **Impact**: Direct security regression risk. If the check is hardened in `entries.ts` and forgotten in `user-data.ts`, the admin CRM endpoints (`admin_users`, `admin_user_overview`, `admin_set_tier`) lose the hardening silently. These endpoints expose full user tier mutation and PII lookup.
- **Fix**: Extract to `api/_lib/adminAuth.ts` — export `isAdminUser(user: AuthedUser): boolean`. Import in both files. One change location forever.

### F2: `api/entries.ts` is a 1700-line single-file dispatcher — cyclomatic complexity ceiling hit

- **Confidence**: high
- **File**: `api/entries.ts:1–1700+`
- **Smell**: 20+ distinct action handlers (`handleMerge`, `handleMergeUndo`, `handleMergeInto`, `handleMoveEntry`, `handleShareEntry`, `handleUnshareEntry`, `handleListShares`, `handleAudit`, `handleEnrichBatch`, `handleBackfillPersona`, `handleRevertPersonaBackfill`, `handleWipePersonaExtracted`, `handleAuditPersona`, `handlePersonaPrompt`, `handleDistillRejected`, `handleDistillGmail`, `handleGmailDecision`, `handleGmailPrompt`, `handleClearBackfill`, `handleRetryFailed`, `handleEmptyTrash`, `handleBulkPatch`, `handleGet`, `handleDelete`, `handlePatch`, `handleGraph`) all live in one file. The dispatch block at lines 62–111 is 50 lines of `if` chains with inconsistent naming conventions (`merge_into` uses underscore, `merge-undo` uses hyphen, `backfill-persona` uses hyphen — no rule).
- **Impact**: Every new feature that touches entries (multi-brain merging, team entry permissions, collaborative editing) requires navigating 1700 lines. The dispatch table is the only index; there is no `routes/` or `handlers/` grouping. Adding a 21st action reliably creates a missed-branch bug because no one can hold the whole file in working memory.
- **Fix**: Split into sub-modules: `api/_lib/handlers/entryMerge.ts`, `api/_lib/handlers/entryPersona.ts`, `api/_lib/handlers/entryGmail.ts`, `api/_lib/handlers/entryAdmin.ts`. The top-level `entries.ts` becomes a thin dispatcher under 150 lines. The `_lib/mergeEntries.ts` pattern (shared core, thin handler wrapper) already demonstrates this — apply it uniformly. Also standardise action naming to kebab-case throughout.

### F3: `handleMergeInto` skips LLM synthesis — diverges silently from `handleMerge`

- **Confidence**: high
- **File**: `api/entries.ts:1388–1443`
- **Smell**: `handleMergeInto` (action=`merge_into`) concatenates content with a raw `\n\n---\n\n` separator and merges tags with a `Set` — no LLM call, no `mergeEntries.ts` shared core, no audit-log entry for the source soft-delete (line 1432 patches deleted_at but no `audit_log` write). Contrast with `handleMerge` which calls `generateMergePreview` + `commitMerge` from `_lib/mergeEntries.ts`, writes audit rows, and re-enriches. The two handlers have the same user-facing name concept ("merge") but completely different semantics.
- **Impact**: Users hitting `merge_into` get a dumb string concat that bypasses the LLM pipeline, the audit trail, and the merge-undo metadata (`merged_from`). Because there is no `merged_from` on the source, `handleMergeUndo` cannot reverse it. The merge-undo UI path will silently fail for any entry merged via this action.
- **Fix**: Route `merge_into` through `commitMerge` with `oneShot=true`, or deprecate the action and point callers at `?action=merge`. At minimum, add the audit_log write and stamp `merged_from` on the target so undo is possible.

### F4: `SB_HDR` / `SB_KEY` / `SB_URL` re-declared as module-level constants in 5+ `_lib` files — bypasses `sbHeaders()` canonical source

- **Confidence**: high
- **Files**: `api/_lib/enrich.ts:43–49`, `api/_lib/resolveProvider.ts:26–32`, `api/_lib/enrichQuota.ts:14–20`, `api/_lib/retrievalCore.ts:8–14`, `api/_lib/checkBrainAccess.ts:1–3`
- **Smell**: `sbHeaders.ts` has a doc-comment "Single source of truth — imported by all api/* handlers." But five `_lib` files define their own `SB_HDR`/`SB_KEY` inline. `checkBrainAccess.ts` uses `hdrs()` (a local closure), `enrich.ts` uses `SB_HDR` (a module-level object), `retrievalCore.ts` uses `SB_HEADERS`. Three different names for the same credential object. The `sbHeaders()` factory reads the env var at call time (safe for rotation); the module-level constants read it at module load time (frozen on cold boot — a credential rotation without a redeploy leaves these stale).
- **Impact**: Credential rotation safety is inconsistent. If `SUPABASE_SERVICE_ROLE_KEY` is rotated and the function instance is hot, `sbHeaders()` callers get the new key; `SB_HDR` callers get the old one until cold restart. More immediately: `checkBrainAccess.ts` line 3's `hdrs()` closure captures `SB_KEY` at module load — same problem.
- **Fix**: Delete all inline credential constants from `_lib` files. Import and use `sbHeaders()` / `sbHeadersNoContent()` from `_lib/sbHeaders.ts` uniformly. The credential is then always read at call time.

### F5: `api/user-data.ts` defines its own `hdrs()` factory — third variant of the same thing

- **Confidence**: high
- **File**: `api/user-data.ts:50–55`
- **Smell**: `const hdrs = (extra) => ({ "Content-Type": "application/json", apikey: SB_KEY!, Authorization: \`Bearer ${SB_KEY}\`, ...extra })` is a fourth independent implementation of what `sbHeaders(extra)` from `_lib/sbHeaders.ts` already does, byte-for-byte identically. `SB_KEY` is declared at module scope (line 49), frozen at load time.
- **Impact**: Same credential-rotation hazard as F4. Also means `user-data.ts` is not using the canonical factory — any future change to the standard header shape (e.g. adding `X-Client-Info`) must be applied here separately.
- **Fix**: Remove `SB_KEY`, `SB_URL` module-level declarations and the local `hdrs` factory from `user-data.ts`. Replace all `hdrs()` calls with `sbHeaders()` / `sbHeadersNoContent()` from `_lib/sbHeaders.ts`.

---

## Medium-priority findings

### F6: UUID regex duplicated in at least 4 handlers — no shared validator

- **Confidence**: high
- **Files**: `api/entries.ts:130`, `api/entries.ts:460`, `api/entries.ts:1321`, `api/user-data.ts:3273`
- **Smell**: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` is copy-pasted verbatim across at least 4 callsites. `handleBulkPatch` has its own `uuidRe` at line 460; `handleMergeUndo` has its own `uuidRe` at line 1321; `handleGet` inline-validates at line 130; `admin_user_overview` at user-data line 3273.
- **Impact**: Any change to UUID format handling (e.g. accepting UUIDs without dashes from some SDK) requires finding all copies. Not a current bug but accumulates tech debt with every new endpoint.
- **Fix**: Export `const UUID_RE = /^[0-9a-f]{8}-...$/i` and `function isUUID(s: unknown): s is string` from `api/_lib/types.ts` (already the types hub). Import everywhere.

### F7: `handlePatch` (PATCH /api/entries) handles action=`restore` via a nested early-return inside the main patch handler — invisible routing

- **Confidence**: high
- **File**: `api/entries.ts:284–313`
- **Smell**: `handlePatch` checks `if (action === "restore")` at line 288 and returns early. But the dispatch table at the top of the file has no `if (method === "PATCH" && action === "restore")` branch — it falls through to the catch-all `if (method === "PATCH") return handlePatch(ctx)`. So `restore` is routed silently inside the function rather than at the dispatch level. Future contributor adding a second PATCH action will either add it to the dispatch (correct) or add another `if (action === ...)` inside `handlePatch` (wrong), with no signal which is right.
- **Impact**: Architectural inconsistency. GET+action routes are all at the dispatch level; PATCH+action is partially hidden inside the handler. Makes the routing table untrustworthy as documentation.
- **Fix**: Add `if (req.method === "PATCH" && action === "restore") return handleRestore(ctx)` to the dispatch block. Extract the restore logic into `handleRestore`. Rename `handlePatch` to `handlePatchCore` for clarity.

### F8: `runGeminiBatch` in `handleAudit` calls the Gemini API directly — bypasses `callAI()` and `aiProvider.ts` retry/backoff

- **Confidence**: high
- **File**: `api/entries.ts:614–652`
- **Smell**: `runGeminiBatch` (lines 614–652) constructs a raw `fetch` to `generativelanguage.googleapis.com` with no retry, no exponential backoff, no circuit breaker, no provider abstraction. Meanwhile `callAI()` in `api/_lib/aiProvider.ts` has 3-attempt retry with 100ms→400ms→1600ms backoff specifically to handle transient 429s and 5xx. The audit endpoint calls Gemini up to 10 times in a loop (500 entries / 50 per batch) — a single 429 silently returns `[]` and drops those entries from the audit result with no indication to the user.
- **Impact**: Audit results are silently incomplete whenever Gemini rate-limits mid-run. No error surface to the caller. Also: the audit hardcodes `GEMINI_API_KEY` directly from env (line 679) and ignores BYOK — admin users with a BYOK key still burn the server key.
- **Fix**: Replace raw `fetch` in `runGeminiBatch` with `callAI(cfg, …)` from `aiProvider.ts`. Resolve provider via `resolveProviderForUser(user.id)` so BYOK is respected.

### F9: `api/_lib/types.ts` — `body: any` on `ApiRequest` means every handler operates on untyped input

- **Confidence**: high
- **File**: `api/_lib/types.ts:6`
- **Smell**: `ApiRequest.body` is typed `any`. Every handler destructures `req.body` without type narrowing — e.g. `entries.ts:315` `const { id, title, content, type, tags, metadata, brain_id, status } = req.body` produces `any`-typed locals silently. TypeScript cannot catch `id` being `undefined` or `tags` being a non-array.
- **Impact**: Schema validation is manually duplicated in each handler (length checks, typeof guards) instead of being enforced by types. When a new field is added to a handler, the type system gives no signal that the validator needs updating.
- **Fix**: Type `body` as `unknown` in `ApiRequest`. Each handler narrows with `const body = req.body as SomeShape` after manual validation, or use `zod` (already imported in `enrich.ts`) for parse-and-validate at the handler boundary.

### F10: `api/_lib/resolveProvider.ts` — stale comment contradicts live code (Anthropic BYOK still wired, comment says "not yet valid")

- **Confidence**: high
- **File**: `api/_lib/resolveProvider.ts:121–138`
- **Smell**: Comment at line 122 says "ANTHROPIC_API_KEY is not yet valid — do not assume it's configured". But lines 89–95 still route BYOK Anthropic users through the Anthropic provider unconditionally — a user who sets their own Anthropic BYOK key *does* get Anthropic enrichment. The comment only applies to the *managed* (server) Anthropic key. The comment in the code reads as "Anthropic is broken" which is wrong for BYOK users and will mislead any contributor who touches this file.
- **Impact**: Contributor confusion. If someone reads "Anthropic key is not yet valid" and removes BYOK Anthropic support assuming it's dead code, BYOK Anthropic users lose enrichment silently.
- **Fix**: Rewrite comment to: "Managed Anthropic key (`ANTHROPIC_API_KEY` env var) is not yet activated — managed enrichment routes to Gemini. BYOK Anthropic (user-supplied key in `user_ai_settings`) works normally."

### F11: `fetchPersonaDedupSet` loads up to 1000 persona entries with full `embedding` columns into memory per enrichment call

- **Confidence**: high
- **File**: `api/_lib/enrich.ts:660–678`
- **Smell**: `fetchPersonaDedupSet` fetches `select=title,embedding&limit=1000`. The `embedding` column is a `vector(768)` — 768 × 4 bytes = ~3KB per row. 1000 rows = ~3MB of vector data loaded into the Vercel function's heap on every `enrichInline` call for a user with many persona facts. This runs inside `stepPersonaExtract`, which runs inside `enrichInline`, which runs on every PATCH that changes content.
- **Impact**: Memory pressure on Vercel's 1024MB function limit. At 500+ persona facts (achievable after the backfill pass on a power user) this is ~1.5MB per enrichment just for dedup. Combined with the entry content, LLM response buffering, and concept graph state, this is a plausible OOM vector on large brains.
- **Fix**: Cap `limit` at 200 (the dedup set only needs to be dense enough to catch near-duplicates — exact recall across 1000 entries is not the goal). Alternatively, push cosine dedup into Postgres via `match_entries` with a high threshold, eliminating the in-memory scan.

### F12: `handleBulkPatch` (action=`bulk-patch`) with `metadataStatus` fires N individual PATCHes in `Promise.all` — N=200 is allowed

- **Confidence**: high
- **File**: `api/entries.ts:504–519`
- **Smell**: When `metadataStatus` is set, the handler fetches all rows then does `await Promise.all(rows.map(async (row) => fetch(…PATCH…)))`. With `ids` capped at 200, this fires up to 200 simultaneous HTTP requests to Supabase from a single Vercel function invocation. Supabase's PostgREST connection pool is typically 15–60 connections; 200 concurrent requests will queue and potentially timeout, returning partial success with no indication of which rows failed.
- **Impact**: "Bulk" operation that looks atomic to the caller may silently partially apply on large batches, leaving some entries with the old `metadata.status` and others with the new one. No rollback.
- **Fix**: Chunk the Promise.all into groups of 20–30. Or better: expose a server-side RPC `bulk_update_metadata_status(ids, status)` that does the JSONB merge in a single SQL statement.

### F13: `checkBrainAccess` makes 2 serial HTTP round-trips per authorization check

- **Confidence**: medium
- **File**: `api/_lib/checkBrainAccess.ts:17–38`
- **Smell**: The function first fetches `brains?id=eq.{brainId}&owner_id=eq.{userId}` (owner check), then — only if that returns empty — fetches `brain_members?brain_id=eq.{brainId}&user_id=eq.{userId}` (member check). These are sequential, not parallel. Every authed request that calls `requireBrainAccess` (which is every entry read/write involving a brain) pays 2 × ~50ms = 100ms minimum for non-owners.
- **Impact**: For shared-brain members, every entry PATCH (which calls `requireBrainAccess` twice — once for the entry's current brain, once for the new brain if moving) adds 200ms+ of pure auth overhead before any business logic runs. At scale this dominates PATCH latency.
- **Fix**: Combine into a single PostgREST `OR` query, or create a Postgres RPC `check_brain_role(p_user_id, p_brain_id) returns text` that checks both tables in one round-trip with a UNION. The RPC approach also opens the door to caching at the Postgres level.

### F14: `verifyAuth` cache is per-process (in-memory) — on Vercel every cold boot starts empty, 30s TTL provides no cross-instance protection

- **Confidence**: medium
- **File**: `api/_lib/verifyAuth.ts:24–27`
- **Smell**: The JWT cache (`Map<string, CacheEntry>`) is module-level. On Vercel Hobby, each serverless invocation may be a separate cold boot with an empty cache. The 30s TTL is only useful when the same instance handles multiple requests within 30s (warm instance reuse). Under load with concurrent cold boots, every request pays the full Supabase `/auth/v1/user` round-trip. The comment acknowledges the "per-process" nature but doesn't flag that it provides zero protection in a cold-boot-heavy serverless environment.
- **Impact**: Auth latency spikes under load. No security issue (conservative: no valid token is rejected), but the optimisation's effectiveness is unpredictable.
- **Fix**: Move the JWT cache to Upstash Redis (already a dependency for rate limiting) with a 25s TTL and token-hash key. Warm hit = ~5ms Redis GET instead of ~100ms Supabase HTTP.

---

## Low-priority / housekeeping

- `api/mcp.ts:33–38` defines its own `hdrs()` — yet another fourth variant of `sbHeaders()`. Same fix as F4/F5.
- `api/llm.ts:64–85` defines a local `resolveProvider()` that partially duplicates `api/_lib/resolveProvider.ts:resolveProviderForUser()`. The llm.ts version supports `forChat` + `sanitizeGeminiModel` variants not in the shared lib, but the DB query shape is identical. Opportunity to merge once the Anthropic managed-key situation is resolved.
- `src/Everion.tsx` `EverionContentProps` interface (lines 137–182) has 28 properties — prop-drilled from the root shell into `EverionContent`. `bgProcessFiles`, `bgQueueDirectSave`, `bgDismissTask`, `bgDismissAll` are background-capture concerns that belong in `BackgroundOpsContext`, not in a prop interface. When multi-brain capture lands, this will grow further.
- Feature flags `chat`, `todos`, `timeline`, `vault`, `importantMemories`, `someday`, `lists`, `contacts`, `vaultTemplates`, `vaultPinBiometric`, `appLock`, `extraThemes` are all `prodEnabled: import.meta.env.VITE_FEATURE_* === "true"`. If any `VITE_FEATURE_*` env var is missing from Vercel, the feature silently off. No startup assertion, no visibility. One accidentally-deleted env var silently disables a paid feature.
- `api/entries.ts:232` — `console.log` (not `log.info`) for hard-delete audit: `console.log("[audit] HARD_DELETE …")`. The structured logger (`createLogger`) is available in context and used elsewhere; this bypasses it and won't appear in structured log queries.
- `api/_lib/enrich.ts` — `stepParse` at line 232 has `if (entry.title)` fallback that stamps `parsed: true` even when the LLM returned unparseable output. This means "parse ran successfully" is indistinguishable from "parse was skipped with a title-only short-circuit" in the enrichment flags. A dedicated `parsed_skipped` sub-flag would make the diagnostic clearer.
- `supabase/migrations/004_push_notifications.sql` and `004_user_memory.sql` share the same prefix number `004` — ordering is ambiguous and could cause issues if migrations are ever replayed in a fresh environment or with a tool that sorts by filename.
- `api/entries.ts:884–893` — auto-distill at every 20 decisions uses a `Prefer: count=exact` COUNT query just to check `total % 20 === 0`. This adds a full-table-scan round-trip on `gmail_decisions` for every accept/reject. Use a DB trigger or sequence instead, or just always fire distill and make `distillGmailForUser` idempotent with a debounce.
- No E2E or integration tests for: vault encrypt/decrypt round-trip, merge + undo, billing webhook tier promotion, Gmail scan+accept flow, or brain sharing invite+accept. The existing tests (`DesktopSidebar.test.tsx`, `EntryList.test.tsx`, `DangerTab.test.tsx`, `AccountTab.test.tsx`, `OnboardingModal.test.tsx`) are all component-level render tests — none cover the API layer.

---

## Strategic refactors recommended

**1. Split `api/entries.ts` into handler sub-modules (3–6 month payoff)**
The 1700-line dispatcher is the highest-leverage refactor. Split by concern: `entryMerge.ts`, `entryPersona.ts`, `entryGmail.ts`, `entryAdmin.ts`, `entryCRUD.ts`. The `_lib/mergeEntries.ts` pattern already proves this works — the shared core is there, only the thin handler wrapper needs extraction. This is a prerequisite for safely adding team-workspace entry permissions without the entire team needing to reason about 1700 lines.

**2. Centralise all credential/header construction in `sbHeaders.ts` (1–2 weeks)**
Findings F4, F5, and the `mcp.ts` `hdrs()` all reduce to: every file that needs to talk to Supabase reinvents the header factory. A single `eslint` rule (`no-restricted-syntax` on `process.env.SUPABASE_SERVICE_ROLE_KEY` outside `sbHeaders.ts`) would enforce this forever.

**3. Push `checkBrainAccess` into a Postgres RPC with caching (1 month)**
As shared-brain usage grows, every write that touches two brains (move, share, unshare) makes 4 sequential Supabase HTTP calls for auth alone. A single `check_brain_role(user_id, brain_id)` RPC eliminates half of those. Pair with Upstash caching (TTL 60s) keyed on `${userId}:${brainId}` for read-heavy chat sessions.

**4. Replace `ApiRequest.body: any` with `unknown` and Zod parse-at-boundary (2–3 months)**
Zod is already imported in `enrich.ts`. Standardising on `z.parse()` at each handler's entry point gives runtime validation AND TypeScript narrowing in one shot, eliminating the current pattern of manual `typeof x === "string" && x.length > 0` checks duplicated across 20+ handlers.

**5. Introduce API integration tests for the billing/vault/merge surfaces (ongoing)**
Zero test coverage on the three highest-risk surfaces (vault crypto round-trip, billing webhook tier change, merge+undo). A single Vitest suite that mocks Supabase + Gemini responses and calls the handler functions directly would catch the `handleMergeInto` audit-log gap (F3) and the `handleBulkPatch` partial-apply risk (F12) before they reach production.

---

## Things working well

- `api/_lib/withAuth.ts` middleware chain is clean, composable, and handles the full concern surface (security headers, method check, rate limit, auth, error shaping) in one place. The `ApiError` pattern is used consistently throughout.
- `api/_lib/rateLimit.ts` circuit-breaker implementation (fail-closed on Upstash unavailability, 3-failure threshold, 5-minute reset) is production-grade. The commentary is accurate and the decision to remove the in-memory fallback in serverless was correct.
- `api/_lib/mergeEntries.ts` shared-core pattern — one implementation consumed by the web flow, MCP, chat, and v1 REST endpoint — is the right model. The `INTERNAL_META_KEYS` set preventing internal fields from leaking into the LLM prompt is a good defensive detail.
- The `enrichInline` pipeline's per-step flag idempotency (each step checks its own flag before running, stamps it on success) means partial failures are automatically retried on the next pass without manual intervention and without re-running completed steps.
- `sbHeaders.ts` as a declared single source of truth is the right architecture — the problem is incomplete adoption (F4, F5), not the pattern itself.
- `api/_lib/verifyAuth.ts` AbortController timeout (5s) on the Supabase auth call is a correct and important defensive measure that prevents hung Vercel functions under auth-service load.
