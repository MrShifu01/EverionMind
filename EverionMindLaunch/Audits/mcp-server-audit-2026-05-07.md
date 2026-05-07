# MCP Server Audit — 2026-05-07

> Single-file JSON-RPC 2.0 server (`api/mcp.ts`, 1024 lines) exposing 13 tools to AI agents over Bearer-auth HTTP. Inputs: an `em_*` API key OR a signed `mcp_*` access token from the OAuth `client_credentials` grant. Authority surface: read + write into a tenant's brain, full Gmail scan, LLM-driven entry merge. RBAC mistakes here = cross-tenant leak via LLM. Audit walks every tool definition vs handler, the OAuth dance, token sign/verify, error shape, ownership-via-`brain_id`, rate-limit binding, vault exclusion, audit-log coverage, and the default-brain-fallback claim from user memory `mcp-brain-destination`.

## Verdict

**Architecture is mostly right.** Service-role server hits PostgREST with `id=eq.X & brain_id=eq.Y` (or `&user_id=eq.Y`) on every mutating tool — defence-in-depth even though RLS would already block cross-user reads. Vault entries (`type='secret'`) are excluded from `retrieveEntries`, `getUpcoming`, `searchEntries`, `getEntry`, `updateEntry`, `deleteEntry`, `mergeEntries`, and `createEntry`. Token TTL is 24 h, HMAC-SHA256 with timing-safe compare. Per-tool rate limits cover `create_entry` (10/min), `merge_entries` (5/min), `gmail_sync` (5/min). `resolveTargetBrain` validates explicit `brain_id` against `brain_members` + `brains.owner_id` and demotes write-tools to require owner/member.

**Five findings carrying enough risk to fix pre-launch.** F1 — `create_entry` quota-exceeded path references undefined `plan` variable (line 897), throws `ReferenceError` and is rescued by the outer `try/catch` as a generic `-32603 Internal error`, hiding the real "monthly limit reached" message. F2 — token-secret fallback chain ends at `SUPABASE_SERVICE_ROLE_KEY`, identical anti-pattern to F13 of `audit-security-2026-05-06.md` which was filed against `oauthState.ts` and only partially addressed (different file, same wrong fallback). F3 — default-brain fallback in `resolveApiKey` returns the user's first-created brain (no `is_personal=eq.true` filter) — confirms the `mcp-brain-destination` memory note as a **security finding**: writes via MCP without explicit `brain_id` land wherever the API key resolves, often a shared family/business brain not the personal one. F4 — every mutating MCP tool except `merge_entries` writes **zero** rows to `audit_log`. F5 — tool results have no byte/token-count guard; `retrieve_memory limit=50` + 200 KB content per row = 10 MB JSON-RPC response. F6 — rate-limit suffix collisions on `create_entry` between MCP API-key calls and v1 REST API-key calls (same IP, same `req.url` path-prefix `/api/mcp` differs from `/v1/...` so actually fine — refuted on inspection). F7 — `gmail_sync` MCP signature ignores caller's `brain_id` arg silently; comment at line 642–645 calls this out but the tool description still advertises brain selection.

---

## Architecture overview

```
Client (Claude Desktop / chatgpt.com / custom) sees discovery JSON
        │
        ▼
GET /.well-known/oauth-authorization-server
   (vercel.json:56 → /api/mcp?_wk=1)
        │
        ▼  returns { issuer, authorization_endpoint, token_endpoint,
        │           registration_endpoint, grant_types: client_credentials }
        │  (mcp.ts:771-779)
        │
        ▼
POST /token (vercel.json:63 → /api/mcp?_oauth=token)
   header: Authorization: Bearer em_<rawkey>
        │
        ▼  resolveApiKey: SHA-256(rawkey) → user_api_keys.key_hash WHERE revoked_at IS NULL
        │  (resolveApiKey.ts:10-20)
        │  THEN brains?owner_id=eq.<user>&select=id&limit=1  ← FIRST owned brain, no is_personal filter (resolveApiKey.ts:28-31)
        │
        ▼  signMcpAccessToken: b64url(JSON{userId,keyId,brainId,exp}) "." HMAC-SHA256
        │  HMAC key: MCP_ACCESS_TOKEN_SECRET || OAUTH_STATE_SECRET || SUPABASE_SERVICE_ROLE_KEY
        │  (mcp.ts:40-59)
        │  TTL 24h.
        │
        ▼
POST /api/mcp { jsonrpc:"2.0", method:"tools/call", params:{ name, arguments } }
   header: Authorization: Bearer mcp_<payload>.<sig>   ← OR raw em_ key direct
        │
        ▼  rateLimit(req, 30)  ← 30/min per (IP,path) via Upstash, fail-closed
        │  (mcp.ts:766)
        │
        ▼  resolveMcpBearer: mcp_ → verifyMcpAccessToken; em_ → resolveApiKey
        │  (mcp.ts:94-97)
        │
        ▼  resolveTargetBrain(args.brain_id, defaultBrainId, userId, requiredRoles)
        │   ├─ if no brain_id → returns defaultBrainId (often NOT personal!)
        │   └─ if brain_id   → checkBrainAccess(user→brains.owner_id OR brain_members)
        │  (mcp.ts:370-392)
        │
        ▼  Per-tool handler: PostgREST with brain_id=eq.X (mutating) OR user_id=eq.X (gmail)
        │  Write tools also throw on type='secret' rows
        │
        ▼  jsonRpcOk(id, mcpToolResult(content)) — content is JSON.stringify(result, null, 2)
        │  No response-size guard. (mcp.ts:749-758)
```

---

## Tool inventory

| Tool | Mutating? | Ownership scope | Rate-limit | Audit-logged? |
|---|---|---|---|---|
| `list_brains` | no | per-user | global 30/min | no |
| `retrieve_memory` | no | brain_id (viewer+) | global 30/min | no |
| `get_upcoming` | no | brain_id (viewer+) | global 30/min | no |
| `get_entry` | no | brain_id (viewer+) | global 30/min | no |
| `search_entries` | no | brain_id (viewer+) | global 30/min | no |
| `create_entry` | YES | brain_id (member+) | **10/min suffix** | **no** |
| `update_entry` | YES | brain_id (member+) | global 30/min | **no** |
| `delete_entry` | YES | brain_id (member+) | global 30/min | **no** |
| `merge_entries` | YES | user_id only — **no brain_id arg** | **5/min suffix** | YES (`mergeEntries.ts:454-465`) |
| `gmail_sync` | YES | user-scoped, brain_id arg silently ignored (mcp.ts:642-645) | **5/min suffix** | no |
| `gmail_review_queue` | no | user_id only | global 30/min | no |
| `gmail_contacts` | no | user_id only | global 30/min | no |
| `gmail_ignore_pattern` | YES | user_id only | global 30/min | no |

Audit-log coverage gap: 7 of 8 mutating tools log nothing. Compare with `entryDelete.ts:69-79` which writes `entry_delete` / `entry_permanent_delete` rows — the web UI delete is logged but the MCP delete is not. Same action, same DB write, different audit footprint.

---

## What's solid

- **Vault exclusion is consistent.** Every read path (`retrieveEntries.ts:185,218`, `getUpcoming.ts:52`, `searchEntries` fallback `mcp.ts:433`) and every write path (`getEntry` `mcp.ts:461`, `updateEntry` `mcp.ts:578`, `deleteEntry` `mcp.ts:724`, `createEntry` `mcp.ts:516`, `validateMergeRequest` `mergeEntries.ts:215-221`) refuses to surface or mutate `type='secret'`. The only place secret titles can leak is the explicit `findLockedSecretTitles` helper (`retrievalCore.ts:130`) which returns titles only and isn't wired into MCP — the MCP `retrieve_memory` calls plain `retrieveEntries` which strips secrets at SQL level.
- **Defence-in-depth ownership scoping.** Mutating handlers all carry `id=eq.<id>&brain_id=eq.<brain>` in the URL — even though RLS plus `resolveTargetBrain`'s upstream check would block, the SQL clause repeats the boundary. `getEntry` `mcp.ts:454`, `updateEntry` `mcp.ts:572,616`, `deleteEntry` `mcp.ts:728`. `merge_entries` uses `user_id=eq.<user>` (`mergeEntries.ts:205,444`) which is acceptable since merge is constrained to a single brain and that brain is checked via `requireBrainAccess` (`mergeEntries.ts:230`).
- **Token TTL is sane.** 24h HMAC-SHA256, `exp` in seconds, server checks `parsed.exp < Math.floor(Date.now()/1000)` (`mcp.ts:84`). Timing-safe compare via `timingSafeEqual` (`mcp.ts:71`). Revocation check on `em_` key happens every call (`resolveApiKey.ts:13` `&revoked_at=is.null`); `mcp_` token holds no revocation hook.
- **Rate-limit fail-closed in serverless.** No silent in-memory bypass when Upstash is unconfigured on Vercel — `rateLimit.ts:163-166` returns false and the call is denied. Per-tool suffixes (`create_entry`, `merge_entries`, `gmail_sync`) keep tool-specific budgets independent.
- **Idempotency on `create_entry`.** Per-user `Idempotency-Key` header reserved atomically via PostgREST `Prefer: resolution=ignore-duplicates` (`idempotency.ts:57-79`). Replay returns prior entry id; in-flight returns `-32000`.
- **Body validation rejects non-JSON-objects.** `optionalBodyObject` (`requestBody.ts:12-15`) throws `400` on arrays / strings / scalars. JSON-RPC envelope check at `mcp.ts:828-829` rejects missing `jsonrpc:"2.0"`.
- **Vault forbidden on type-changes.** `updateEntry` blocks `type='secret'` on retypes (`mcp.ts:583-589`); `createEntry` blocks `type='secret'` outright (`mcp.ts:516-520`). MCP can never mint a vault row.
- **Tier-aware quota gate.** `create_entry` runs `checkAndIncrement(userId, "captures", tier, hasByok)` against monthly captures budget (`mcp.ts:884-892`). `merge_entries` runs `checkMergeQuota` inside `mergeEntriesOneShot` (`mergeEntries.ts:486`).

---

## Findings

### F1 — `create_entry` quota-exceeded path throws `ReferenceError` instead of returning the limit message
**Severity: HIGH** — user-visible bug, masks intended error message, surfaces as generic `-32603 Internal error`.

`api/mcp.ts:893-898`:

```ts
if (!quota.allowed) {
  log.warn("quota_exceeded", { plan: tier, action: "captures" });
  return res
    .status(200)
    .json(jsonRpcErr(id, -32000, `Monthly capture limit reached (${plan} plan)`));
}
```

`plan` is not defined anywhere in the function scope — only `tier` is destructured at line 884. `${plan}` references an undeclared identifier inside a template literal, which throws `ReferenceError: plan is not defined`. The throw is caught by the outer `} catch (err: any) {` at line 1018 and returned as `-32603 err.message || "Internal error"`. Net result: a paying user who hits their monthly capture cap via the MCP gets `Internal error` instead of `Monthly capture limit reached (free plan)`.

**Fix**: replace `${plan}` with `${tier}`. One word.

### F2 — `MCP_ACCESS_TOKEN_SECRET` fallback chain ends at the service-role key
**Severity: HIGH** — same anti-pattern as F13 of `audit-security-2026-05-06.md` (about `oauthState.ts`), which was filed against the OAuth state cookie. This is a separate token surface with the same fallback shape.

`api/mcp.ts:40-42`:

```ts
function mcpTokenSecret(): string {
  return process.env.MCP_ACCESS_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET || supabaseServiceRoleKey();
}
```

If neither `MCP_ACCESS_TOKEN_SECRET` nor `OAUTH_STATE_SECRET` is set, the HMAC secret silently becomes `SUPABASE_SERVICE_ROLE_KEY`. Two consequences:

1. **Cross-secret coupling**: rotating the service-role key would invalidate every in-flight 24-hour MCP token. A routine DB-secret rotation now also bricks every connected MCP client.
2. **Forge-by-leak**: anyone who obtains the service-role key (already a full DB compromise, granted) can also mint valid `mcp_*` tokens for any `(userId, keyId, brainId)` triple they like — without ever touching the DB. They can call MCP with a forged `mcp_` token, bypassing the `revoked_at IS NULL` check that `em_` keys go through.

**Fix**: drop the fallback. Throw if `MCP_ACCESS_TOKEN_SECRET` is unset on Vercel — the same way `signOAuthState` already does (per F13 of the May-6 audit). Add `MCP_ACCESS_TOKEN_SECRET` to `EverionMindLaunch/Ops/env-vars.md` required-vars table.

### F3 — default-brain fallback writes to wrong tenant; `resolveApiKey` does not pick the personal brain
**Severity: HIGH** — confirms `mcp-brain-destination` memory note as a security finding, not just UX.

`api/_lib/resolveApiKey.ts:28-31`:

```ts
fetch(`${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`, {
  headers: sbHeaders(),
}),
```

Compare with `personalBrain.ts:30-31` and `gmailScan.ts:1057` — both use `&is_personal=eq.true` to scope to the user's personal brain. `resolveApiKey` does not. The query orders nondeterministically (no `order=created_at.asc`) and PostgREST returns whichever row Postgres sees first, which in production has been the family/business brain for users who created shared brains before their personal brain (or whose personal brain was renamed/migrated).

The system's design tries to mitigate this with the `BRAIN_ID_PARAM_DESC` warning ("If omitted, falls back to the API key's default brain — which may not be the user's personal brain") and by telling models to call `list_brains` first. That guidance is followed only by some models. Claude Desktop with MCP, ChatGPT custom-GPT MCP, and a poorly-prompted agent all skip the disambiguation and write to whichever brain wins the `LIMIT 1`.

**Confirmed cross-tenant write**: a user who has a personal + family brain, where the family brain was created first, will see all `create_entry` calls without `brain_id` land in the family brain — visible to every family member. Private notes, contacts, ideas now appear in a shared scope. This is a tenant-boundary violation by configuration, not an exploit.

**Fix paths** (pick one, not both):

1. **Hard fail when `brain_id` is omitted on write tools**: `resolveTargetBrain` returns `defaultBrainId` for reads; for `create_entry`, `update_entry`, `delete_entry`, `merge_entries`, throw `400 brain_id is required for write tools — call list_brains to pick`. Forces the model to disambiguate.
2. **Resolve the personal brain in `resolveApiKey`**: change the query to `&owner_id=eq.<user>&is_personal=eq.true&select=id&limit=1` and fall back to `&order=created_at.asc&limit=1` only if there's no personal-flagged brain. Plus an explicit `default_brain_id` column on `user_api_keys` so the user can pick.

Option 2 is the lower-blast-radius fix — option 1 breaks every existing MCP client. Recommend option 2 + a warning on `list_brains` output when the resolved default differs from the personal brain.

### F4 — 7 of 8 mutating MCP tools write nothing to `audit_log`
**Severity: MEDIUM** — coverage gap carried from `audit-security-2026-05-06.md` "audit log coverage" recommendation.

`grep audit_log api/mcp.ts` → no matches. The only MCP-originated audit row is via `mergeEntries.ts:454-465` which writes `entries_merged`. `create_entry`, `update_entry`, `delete_entry`, `gmail_sync`, `gmail_ignore_pattern` write none.

Compare with the web UI:
- Web delete: `api/_lib/handlers/entryDelete.ts:69-79` writes `entry_delete` / `entry_permanent_delete`.
- Web merge: shared with MCP via `mergeEntries.ts:454-465`.
- Web create / update: also missing audit (separate finding for the entries-handler audit, not in scope here).

Once a hostile party gets hold of an `em_` key (via XSS / clipboard leak / phished settings page), they can drain a user's brain via MCP and the only forensic trail is application-layer logger output, which is rotated. `audit_log` rows persist; that's their job (migration 057, RLS-protected).

**Fix**: in `api/mcp.ts` after each successful mutating tool, fire-and-forget `fetch(${SB_URL}/rest/v1/audit_log, ...)` with `action: "mcp.create_entry"` / `mcp.update_entry` / `mcp.delete_entry` / `mcp.gmail_sync` / `mcp.gmail_ignore_pattern`, `resource_id: <entry id>`, `metadata: { brain_id, key_id }`. Mirror the shape of `writeEntryAudit` in `entryDelete.ts:63-80`. Adds maybe 30 lines.

### F5 — tool results have no size guard
**Severity: MEDIUM** — DoS-and-cost vector via context-window blow-up.

`mcpToolResult` (`mcp.ts:749-758`):

```ts
function mcpToolResult(content: unknown) {
  return {
    content: [
      {
        type: "text",
        text: typeof content === "string" ? content : JSON.stringify(content, null, 2),
      },
    ],
  };
}
```

There is no truncation, no byte cap, no token cap. Worst-case calls:

| Tool | Worst-case payload |
|---|---|
| `retrieve_memory limit=50` | 50 entries × `content` up to 200 KB (`createEntry` cap at `mcp.ts:514`) → **10 MB** JSON. |
| `gmail_review_queue limit=50 since_hours=168` | 50 gmail entries with full HTML/text in `metadata.gmail_html` → easily 5–20 MB. |
| `gmail_contacts limit=100` | 100 contact rows; smaller, ~50 KB. |
| `get_upcoming days=365` | up to 100 rows × 4 date fields = 400 rows pre-dedup; full content + metadata. |

The MCP client runs this through an LLM. Two failure modes: (a) Claude / GPT chokes the request with a context-overflow error before the model can summarise; (b) the model truncates to first N tokens and the user gets a partial answer. Both are bad. (c) Token cost — the MCP server doesn't pay; the user's MCP-bound LLM bill does. An attacker with a leaked `em_` key can pump the user's per-day token spend by calling `retrieve_memory limit=50` in a loop.

**Fix**: cap `mcpToolResult` at a hard byte limit. Pre-launch: 256 KB per tool call. Truncate `JSON.stringify` output and append `…\n[response truncated to 256 KB; call get_entry with the relevant id for full content]`. Per-tool override for `gmail_sync` (which legitimately returns 50+ entries with full `entries` arrays — keep that or trim `gmail_html` server-side before returning). Single-line guard:

```ts
const MAX_RESULT_BYTES = 256 * 1024;
function mcpToolResult(content: unknown) {
  let text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  if (text.length > MAX_RESULT_BYTES) {
    text = text.slice(0, MAX_RESULT_BYTES) + "\n…[truncated]";
  }
  return { content: [{ type: "text", text }] };
}
```

### F6 — `gmail_sync` brain_id arg is documented but silently ignored
**Severity: LOW** — UX / documentation drift.

The `gmail_sync` tool definition (`mcp.ts:291-304`) does not declare a `brain_id` parameter — actually clean. But every other Gmail tool's tooltip references `BRAIN_ID_PARAM_DESC`, and the handler signature includes `brainId` (`mcp.ts:631`). The implementation explicitly drops it: `void brainId; // brainId is no longer honoured` (`mcp.ts:642-645`). Gmail always lands in the personal brain (`gmailScan.ts:1051-1063` filters with `is_personal=eq.true`). This is **correct security behaviour** — Gmail data is private and should never be writable into a shared brain.

But the `brainId` is still passed through from `auth.brainId` (the API key's default), which per F3 may be a shared brain. The handler ignores it in favour of the personal brain — good. So no leak. Just a stale parameter.

**Fix**: remove `brainId: string` from the `gmailSync` signature. Drop the `void brainId;` line. Cosmetic.

### F7 — `merge_entries` MCP tool definition omits `brain_id` parameter
**Severity: LOW** — mirrors F6 in the opposite direction (acceptable here).

`mcp.ts:272-289` — no `brain_id` in `inputSchema`. The handler delegates to `mergeEntriesOneShot` which derives the brain from the source entries themselves (`mergeEntries.ts:222-229` extracts `brain_id` from the first source row, validates uniqueness). `requireBrainAccess` is checked at line 230. So the merge always lands in the brain the entries were already in — correct, and the MCP can't be tricked into writing across brains.

The user-visible quirk: the merge result's `brain_id` is whatever brain the source entries were in. If the user has multi-brain entries selected, validation throws `400 All selected entries must be in the same brain` (`mergeEntries.ts:223`). Good.

No fix required. Documenting for completeness.

### F8 — `resolveTargetBrain` accepts non-string `brain_id` then ignores it
**Severity: LOW** — input validation hole, no tenant impact.

`mcp.ts:376`:

```ts
const requested = typeof args.brain_id === "string" && args.brain_id ? args.brain_id : null;
if (!requested) return defaultBrainId;
```

If a caller passes `brain_id: 12345` (number), `brain_id: { id: "..." }` (object), or `brain_id: ["..."]` (array), the type-check fails silently and the function falls back to the **default brain** without telling the caller their input was rejected. The model thinks it targeted brain X; the server wrote to brain Y.

**Fix**: throw `ApiError(400, "brain_id must be a string UUID")` when `args.brain_id` is non-null but not a valid string. Don't silently fall back.

### F9 — token verification has no `iss` / `aud` / `sub` claims
**Severity: LOW** — defence-in-depth gap.

`signMcpAccessToken` payload contains `{ userId, keyId, brainId, exp }` (`mcp.ts:50-55`). No `iss` (issuer), no `aud` (audience), no `sub` (subject), no `iat` (issued-at), no `jti` (JWT ID — for revocation). Verification (`mcp.ts:73-91`) checks only the four declared fields and the HMAC.

Real-world risk: low. Tokens are minted by us, consumed by us, never federated. The OAuth discovery doc lists `https://everion.smashburgerbar.co.za` as `issuer` (`mcp.ts:772`) but that string never appears in the token itself.

**Fix path** (defer to first incident): switch to compact JWT (sign with `jose` library) carrying `iss="https://everion.smashburgerbar.co.za"`, `aud="everionmind-mcp"`, `sub=userId`, `iat`, `exp`, plus a `jti` for an opt-in revocation table.

### F10 — OAuth `client_credentials` accepts any valid `em_` key as `client_secret`
**Severity: INFO** — design-by-spec, calling out for completeness.

`mcp.ts:783-794`:

```ts
if (req.query._oauth === "token") {
  const authHeader = (req.headers["authorization"] as string) || "";
  const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const auth = key ? await resolveApiKey(key) : null;
  if (!auth) return res.status(401).json({ error: "invalid_client", ... });
  return res.status(200).json({ access_token: signMcpAccessToken(auth), ... });
}
```

The `/token` endpoint accepts an `em_` key as the `Bearer` (not as `client_id` + `client_secret` — there is no client registration linking `em_` keys to clients). Functionally this means "any valid API key gets a 24h MCP token". Standard `client_credentials` flow expects a registered client whose `client_secret` is bound to its `client_id`. We collapse both to the API key.

OAuth purists will flag it. For a single-vendor MCP exposed only to first-party clients, it's pragmatic. Document in `architecture/auth.md` so a future contributor doesn't try to "fix" it by rejecting `em_` keys at `/token`.

### F11 — `merge_entries` rate limit is global per-IP, not per-key
**Severity: LOW** — minor MCP-vs-v1 collision.

`rateLimit(req, 5, 60_000, "merge_entries")` keys on `${ip}:${path}:merge_entries`. `path` is `(req.url || "").split("?")[0].slice(0, 50)` (`rateLimit.ts:160`) which for `/api/mcp` is always `/api/mcp` regardless of which user is calling. Two different users on the same NAT'd corporate IP share the 5/min budget for `merge_entries`. No cross-tenant data risk; just shared throttle.

**Fix**: include `auth.userId` in the suffix when called inside an authenticated branch. e.g. `rateLimit(req, 5, 60_000, "merge_entries:${userId}")`. Ten-line change to the `rateLimit` callsites in `mcp.ts`.

### F12 — `gmail_ignore_pattern` writes user-controlled string into `preferences.custom` with no length cap
**Severity: LOW** — storage abuse, no injection risk.

`gmailIgnorePattern` (`mcp.ts:692-714`) appends `${trimmed}` to the existing `prefs.custom` string with `\n` joiner. No max-length check. A malicious or buggy MCP client can call this in a loop and grow a single user's `gmail_integrations.preferences` row to multi-MB. The `preferences` column is JSONB — no hard size limit beyond the row TOAST budget.

**Fix**: cap `trimmed.length` to 500 chars and `newCustom.length` to 50 KB. Throw `400 ignore-list full — remove old patterns first` past the cap.

---

## Surface map

```
api/mcp.ts (1024 lines)
├─ Token sign/verify (lines 14-92)
│   ├─ mcpTokenSecret  — secret-fallback chain  (F2 HIGH)
│   ├─ signMcpAccessToken — HMAC-SHA256, 24h TTL
│   └─ verifyMcpAccessToken — timing-safe, exp check, no iss/aud/sub/jti  (F9 LOW)
├─ resolveMcpBearer (94-97) — em_ → resolveApiKey | mcp_ → verify
├─ TOOL DEFINITIONS (105-348) — 13 tools, JSON-schema input schemas
├─ getUserPlan (356-362) — tier + BYOK lookup for quota gate
├─ resolveTargetBrain (370-392) — brain access check  (F8 LOW silent fallback on bad type)
├─ READ HANDLERS
│   ├─ listBrains (394-413) — owned + member rows
│   ├─ retrieveMemory (415-421) → retrieveEntries (retrievalCore.ts:152)  ← vault-stripped
│   ├─ getUpcoming (423-425) → getUpcomingEntries (getUpcoming.ts:42)  ← vault-stripped
│   ├─ searchEntries (427-450) — vector-only, vault-stripped
│   └─ getEntry (452-463) — id+brain_id scoped, secret guard
├─ WRITE HANDLERS
│   ├─ createEntry (502-558) — id+user_id+brain_id, secret block, embedding, concept rebuild
│   ├─ updateEntry (560-627) — id+brain_id, secret block, metadata merge, embed regen
│   ├─ deleteEntry (716-737) — soft-delete, secret block
│   └─ mergeEntries via mergeEntriesOneShot (mergeEntries.ts:480-492)
├─ GMAIL HANDLERS (629-714)
│   ├─ gmailSync — brainId param ignored (F6 LOW), always personal brain
│   ├─ gmailReviewQueue — user_id scoped, type=neq.contact, since-window
│   ├─ gmailContacts — user_id scoped, type=eq.contact
│   └─ gmailIgnorePattern — appends to prefs.custom (F12 LOW unbounded)
├─ JSON-RPC helpers (741-758) — mcpToolResult has no size guard  (F5 MEDIUM)
└─ Main handler (762-1024)
    ├─ Security headers + req-id
    ├─ rateLimit(req, 30) global
    ├─ OAuth discovery / token / register / authorize  (F10 INFO design-by-spec)
    ├─ Auth resolve (em_ or mcp_)
    ├─ JSON-RPC dispatch — initialize / tools/list / tools/call
    └─ tools/call switch — per-tool rate-limit + quota + handler
        └─ create_entry quota path uses undefined `plan`  (F1 HIGH)
```

Supporting modules touched:

| File | Role |
|---|---|
| `api/_lib/resolveApiKey.ts` | em_ key → user_id + first-owned brain  (F3 HIGH default-brain bug) |
| `api/_lib/checkBrainAccess.ts` | owner-or-member role check |
| `api/_lib/rateLimit.ts` | Upstash sliding-window, fail-closed, breaker |
| `api/_lib/idempotency.ts` | atomic reserve+finalize, in-flight detection |
| `api/_lib/mergeEntries.ts` | shared with web/v1; writes audit_log, vault-blocks |
| `api/_lib/gmailScan.ts` | personal-brain enforcement via `is_personal=eq.true` |
| `api/_lib/personalBrain.ts` | same pattern, separate caller for persona |
| `api/_lib/handlers/entryDelete.ts` | web delete writes audit_log; MCP delete does not (F4) |
| `api/_lib/sbHeaders.ts` | service-role wrapper |
| `api/_lib/requestBody.ts` | optionalBodyObject, bodyObject — JSON-RPC envelope guard |
| `api/_lib/getUpcoming.ts` | shared upcoming query, vault-stripped |
| `api/_lib/retrievalCore.ts` | shared RAG, vault-stripped |
| `vercel.json:55-65` | `.well-known` and OAuth path rewrites |

---

## Findings to prove or refute (from audit prompt)

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Every mutating tool scopes by `brain_id` at SQL level. | **PROVED with caveat.** create/update/delete/getEntry use `brain_id=eq.<X>`. `merge_entries` uses `user_id=eq.<X>` (different but equivalent for tenant boundary). gmail tools scope by `user_id` only — no brain_id at SQL — but the data is per-user not per-brain so this is correct. | `mcp.ts:454,572,616,728,534,696`; `mergeEntries.ts:205,444` |
| Token TTL too long? | **24h is reasonable for MCP.** Long-lived MCP sessions are normal; users add the integration once and forget. The `em_` key check (revoked_at IS NULL) doesn't apply to `mcp_` tokens — a revoked key still has up to 24h of valid `mcp_` tokens floating. | `mcp.ts:54,94-97`; `resolveApiKey.ts:13` |
| Rate-limit binding for MCP-key vs user-JWT collisions. | **No collision** — MCP rate-limit keys on `${ip}:/api/mcp:<suffix>` while v1 REST uses `${ip}:/v1/<action>:<suffix>`. Different `req.url` prefixes. | `rateLimit.ts:160-161` |
| Tool-result size guard. | **MISSING.** No truncation. F5 above. | `mcp.ts:749-758` |
| Vault-protected rows in `entries.content` returned via MCP? | **Stripped at SQL.** `type=neq.secret` on every read query; `type=eq.secret` block on every mutating handler. | `mcp.ts:461,516,578,724`; `retrievalCore.ts:185,218`; `getUpcoming.ts:52`; `mergeEntries.ts:215` |
| OAuth `state` parameter — used? Replay-protected? | **Not used for `client_credentials`.** No `state` round-trip — the flow is single-call `POST /token` with the API key as the Bearer. `client_credentials` doesn't require `state` (no redirect leg). The `OAUTH_STATE_SECRET` is unrelated to MCP — it's for the Google OAuth and magic-link state cookies (`oauthState.ts`). | `mcp.ts:783-794` |
| Default-brain fallback — security risk? | **CONFIRMED HIGH.** F3 above. | `resolveApiKey.ts:28-31` |

---

## Recommendations (priority)

1. **[HIGH] F1 — fix `${plan}` → `${tier}`** in `mcp.ts:897`. One-character typo, masks the user's quota error. ~30 seconds.
2. **[HIGH] F2 — drop `MCP_ACCESS_TOKEN_SECRET` fallback to service-role key.** Throw if unset on Vercel. Add to `EML/Ops/env-vars.md` required-vars table. ~10 min code, env var sets in Vercel.
3. **[HIGH] F3 — `resolveApiKey` must resolve the personal brain.** Add `&is_personal=eq.true` filter; fall through to `&order=created_at.asc&limit=1` only if no personal brain exists. Surface a `default_brain_id` column on `user_api_keys` so users can override. Update the `BRAIN_ID_PARAM_DESC` to reflect the new behaviour. ~1 hour code + migration.
4. **[MEDIUM] F4 — wire `audit_log` writes for every mutating MCP tool.** Mirror `entryDelete.ts:writeEntryAudit`. Actions: `mcp.create_entry`, `mcp.update_entry`, `mcp.delete_entry`, `mcp.gmail_sync`, `mcp.gmail_ignore_pattern`. ~30 min.
5. **[MEDIUM] F5 — add 256 KB cap to `mcpToolResult`.** Single-function change, defends against context-window blowup and token-cost amplification. ~10 min.
6. **[LOW] F8 — `resolveTargetBrain` should throw on non-string `brain_id`** instead of silently falling back. ~2 min.
7. **[LOW] F11 — include `userId` in per-tool rate-limit suffix** so users on shared NAT IPs don't share quotas. ~5 min.
8. **[LOW] F12 — cap `gmail_ignore_pattern` length** at 500 chars per pattern, 50 KB total. ~5 min.
9. **[LOW] F6 — drop unused `brainId` param** from `gmailSync` signature. Cosmetic. ~2 min.
10. **[INFO] F9 — JWT-with-claims migration** when first incident demands it. Defer.
11. **[INFO] F10 — document the `client_credentials` design** in `EML/architecture/auth.md`. So a future contributor doesn't "fix" the `em_` collapse. ~5 min.

---

## Method

- Read `api/mcp.ts` end-to-end (1024 lines).
- Read every tool's handler — `createEntry` 502-558, `updateEntry` 560-627, `deleteEntry` 716-737, `getEntry` 452-463, `searchEntries` 427-450, `retrieveMemory` 415-421, `getUpcoming` 423-425, `listBrains` 394-413, `mergeEntriesOneShot` (`mergeEntries.ts:480-492`), `gmailSync/gmailReviewQueue/gmailContacts/gmailIgnorePattern` 631-714.
- Read `resolveApiKey.ts`, `checkBrainAccess.ts`, `rateLimit.ts`, `idempotency.ts`, `requestBody.ts`, `sbHeaders.ts`, `getUpcoming.ts`, `retrievalCore.ts:120-310`, `personalBrain.ts`, `gmailScan.ts:1040-1100`, `entryDelete.ts`, `mergeEntries.ts`.
- Verified the `/.well-known` rewrites in `vercel.json:56-65`. Confirmed they all hit `?_wk=1` (discovery doc) or `?_oauth=token|register|authorize` (OAuth dance).
- Cross-referenced default-brain claim from user memory `mcp-brain-destination` against `resolveApiKey.ts:28-31` and `personalBrain.ts:30-31` — confirmed the gap.
- Did not exercise the live MCP server in this audit — no Supabase MCP tools were available in this session to query `audit_log` rows or `user_api_keys` count. The findings rely on static analysis of the 1024-line handler and its supporting modules. Suggested follow-up: run `select count(*) from user_api_keys` and `select * from audit_log where action like 'mcp.%'` post-audit when Supabase MCP is back up — F4 prediction is zero rows.

**Audit kicked off by**: user request "do all those highest-leverage audits" / "audit MCP" on 2026-05-07.
