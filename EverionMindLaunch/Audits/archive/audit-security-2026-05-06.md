# Security Audit — 2026-05-06

## Executive Summary

Overall posture is solid for a pre-launch indie app: service-role key stays server-side, rate limiting is fail-closed with circuit-breaker semantics, webhook signatures use constant-time comparison, OAuth state is HMAC-signed, and vault entries are client-side-encrypted. Three exploitable issues exist today. First, the MCP `delete_entry` and `update_entry` functions verify ownership only via `brain_id` (no `user_id` column filter on the final mutating PATCH), meaning after the ownership check passes the PATCH fires against the bare entry `id` — if PostgREST RLS is absent or misconfigured those mutations can affect any entry with that UUID. Second, the `/v1/update` handler does not enforce a vault (`type=secret`) guard, so an authenticated API-key holder can update any non-secret field on their own entry to `type=secret`, bypassing the normal vault flow and making the entry invisible in search. Third, the `handleBrainVaultGrants` GET endpoint with `?brain_id=X` scoping returns all grants for a brain without verifying the caller is the owner or a member of that brain — any authenticated user can enumerate wrapped DEKs for any brain they know the UUID of.

---

## Critical Findings (exploitable now)

### F1: MCP delete_entry / update_entry — final PATCH has no user_id/brain_id guard on the write path
- **Confidence**: high
- **File**: `api/mcp.ts:497` (`deleteEntry`), `api/mcp.ts:388` (`updateEntry`)
- **Risk**: The ownership check (lines 488–493 / 351–356) fetches the entry filtered by both `id` AND `brain_id`, confirming the entry belongs to the caller's brain. But the subsequent mutating PATCH is scoped only to `id=eq.<id>` — no `brain_id` or `user_id` filter. If Supabase RLS on `entries` does not cover service-role requests (service-role bypasses RLS by default), a race window or a logic error in the brain resolution path could allow the PATCH to land on an entry that passed the read check but whose brain changed between the read and the write. More critically, the final delete PATCH at line 497 (`entries?id=eq.<id>`) uses the service-role key with zero row-scope — if any future refactor passes a wrong `brainId` the check silently passes and the write has no second safety net.
- **Reproduction**: Construct an MCP `delete_entry` call. The ownership check at line 488 queries `entries?id=eq.X&brain_id=eq.Y`. The soft-delete PATCH at line 497 queries `entries?id=eq.X` — no brain/user scope. Any entry in the database matching that UUID is modified regardless of whether it belongs to the caller, because the service-role key bypasses RLS.
- **Fix**: Scope the mutating PATCHs to both `id` and `brain_id` (and ideally `user_id`):
  ```ts
  // deleteEntry line 497
  `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}`
  // updateEntry line 388
  `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}`
  ```
  Same pattern applies to `api/v1.ts:278` (`handleUpdate` final PATCH) and `api/v1.ts:312` (`handleDelete` final PATCH) which have the identical gap.

### F2: brain_vault_grants GET — no access check when ?brain_id= is supplied
- **Confidence**: high
- **File**: `api/user-data.ts:1665–1675`
- **Risk**: The `handleBrainVaultGrants` GET path builds its scope filter as either `user_id=eq.<caller>` (default) or `brain_id=eq.<X>` (when `?brain_id=X` is in the query). When the caller passes `?brain_id=X` the filter does **not** include `user_id=eq.<caller>` — it returns every `brain_vault_grants` row for that brain, including wrapped DEKs belonging to other users. An attacker who knows (or enumerates) any brain UUID can retrieve all wrapped DEKs for that brain.
- **Reproduction**: Authenticate as user A. Call `GET /api/brain-vault-grants?brain_id=<UUID of user B's brain>`. The response contains all `(user_id, wrapped_dek)` rows for that brain without any ownership or membership check.
- **Fix**:
  ```ts
  // Replace the conditional scope logic at line 1667 with:
  const userScope =
    typeof brainId === "string" && brainId
      ? `brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(user.id)}`
      : `user_id=eq.${encodeURIComponent(user.id)}`;
  ```
  If the intent is for the owner to see all grants for their brain, add an ownership check before using the brain-scoped query.

### F3: v1 /update — no vault-type guard, attacker can retype own entry to 'secret'
- **Confidence**: high
- **File**: `api/v1.ts:260`
- **Risk**: `handleUpdate` in the public REST API allows setting `type` to any string, including `"secret"`. The MCP path explicitly blocks this (`mcp.ts:364`), but the `/v1/update` handler at line 260 does `patch.type = String(type).trim().slice(0, 50).toLowerCase()` with no guard against `"secret"`. A caller can retype any of their own entries to `secret`, making it invisible in all standard search/list queries (which filter `type=neq.secret`) and causing the entry to behave as a vault item (locked in the UI) while its content remains unencrypted at rest.
- **Reproduction**: `POST /v1/update` with `{ id: "<any owned entry>", type: "secret" }`. The entry is now treated as a vault entry server-side but its content is plaintext — inconsistent state that the vault decryption path cannot handle.
- **Fix**: Add the same guard present in `mcp.ts`:
  ```ts
  if (type !== undefined) {
    const newType = String(type).trim().slice(0, 50).toLowerCase();
    if (newType === "secret") throw { status: 400, message: "Cannot retype to 'secret' via API — use the in-app Vault flow" };
    patch.type = newType;
  }
  ```

---

## High-Priority Findings (fix before public launch)

### F4: Rate limiting is IP-only — authenticated API-key paths share same IP bucket
- **Confidence**: high
- **File**: `api/_lib/withAuth.ts:175`, `api/mcp.ts:533`, `api/v1.ts:342`
- **Risk**: `withApiKey` calls `rateLimit(req, limit)` which keys on `<ip>:<path>`. Multiple users behind the same NAT/proxy (corporate office, university, shared egress) share one counter. A single user at 10.0.0.1 calling `/api/mcp` at 29 req/min starves every other user on the same IP. Conversely, a single attacker can distribute 30 req/min across 30 authenticated API keys from the same IP — the per-IP window never fills for them.
- **Fix**: For `withApiKey` paths, key the rate-limit bucket on `userId:path` (authenticated identity) rather than `ip:path`. The `rateLimit` function already accepts a `suffix` param; pass `auth.userId` as the suffix.

### F5: MCP OAuth token endpoint echoes the raw API key back as the access_token
- **Confidence**: high
- **File**: `api/mcp.ts:557`
- **Risk**: The OAuth token endpoint at `?_oauth=token` validates the `em_*` key, then returns `{ access_token: key }` — the full raw key in the response body. MCP clients that cache or log `access_token` values (Claude Desktop, cursor, etc.) will store the raw key in plaintext in their settings/logs. If those logs are captured, the raw key grants full MCP tool access. The token endpoint should instead issue a short-lived opaque token, or at minimum not re-echo a long-lived credential.
- **Fix**: The cleanest fix within the current architecture: generate a short-lived signed JWT (using `signOAuthState`) containing the `userId`+`keyId`, return that as `access_token`, and validate it in the main handler alongside (or instead of) the raw key lookup. This keeps the raw `em_*` key confined to the original issuance and the Supabase hash.

### F6: JWT verification cache does not invalidate on Supabase token revocation within 30s window
- **Confidence**: high
- **File**: `api/_lib/verifyAuth.ts:7` (CACHE_TTL_MS = 30_000)
- **Risk**: Comment at line 22 acknowledges this: "a token revoked in the last 30s could still be honored." For a security-critical app with vault entries and biometric data, a 30-second revocation lag is material. Account takeover response (user revokes all sessions via Supabase dashboard) leaves a 30s window for the attacker to keep operating. This TTL also applies to the service-role-level `/auth/v1/user` check — the cache is shared across all in-flight requests on the same cold instance.
- **Fix**: Reduce `CACHE_TTL_MS` to 5–10s for production. The stated reason for 30s (Supabase 504/522 storms) is better handled by graceful degradation logic, not by extending the revocation window. Alternatively, cache per-token but honor a `Cache-Control: no-cache` override on sensitive endpoints like vault access.

### F7: `handleDelete` in entries.ts fetches entry without user_id filter before requireBrainAccess
- **Confidence**: high
- **File**: `api/entries.ts:215–223`
- **Risk**: `handleDelete` fetches `entries?id=eq.<id>&select=brain_id` with no `user_id` filter. This returns *any* entry matching that UUID, regardless of owner. `requireBrainAccess` then checks whether the authenticated user has access to that entry's brain — which will succeed if they're a member/viewer. A brain member can enumerate other users' entry UUIDs (e.g., from the shared overlay in handleGet) and soft-delete entries they don't own by calling DELETE with those IDs. The `user_id` guard is missing from the initial fetch that resolves `brain_id`.
- **Fix**:
  ```ts
  `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&select=brain_id`
  ```
  Same gap exists in `handlePatch` at line 341 (also missing `user_id` in the pre-check fetch) and in `handleMoveEntry` (not read but likely same pattern).

### F8: `handleGet` shares overlay includes shared entries' vault-type filtering is absent
- **Confidence**: high
- **File**: `api/entries.ts:175–182`
- **Risk**: When fetching entries for a `brain_id`, the code builds an `or=(brain_id.eq.X,id.in.(...shared_ids))` filter. The `shared_ids` list comes from `entry_shares` and is not filtered by `type != secret`. A vault entry (`type=secret`) that was shared into a brain via `entry_shares` would appear in the response (with encrypted ciphertext) because the `type=neq.secret` guard only applies to the main query's brain scope, not to the shared-id arm of the OR clause. The ENTRY_FIELDS select at line 33 includes `content`.
- **Fix**: After collecting `sharedIds`, filter out any that are vault entries:
  ```ts
  // After fetching sharedIds, strip secrets:
  const nonSecretShared = await filterOutSecretEntries(sharedIds); // service-role select type
  ```
  Or add `&type=neq.secret` to the `entry_shares` overlay fetch so vault entries can never be shared at the DB layer.

---

## Medium-Priority Findings

### F9: `successUrl` in lemon-checkout constructed from untrusted `host` header — open redirect risk
- **Confidence**: high
- **File**: `api/user-data.ts:2939`
- **Risk**: `const host = (req.headers["host"] as string) || "everion.app"`. On Vercel, the `host` header is controlled by Vercel's edge and can't be spoofed for production domains. However, on preview deployments or if traffic reaches the function directly, an attacker can set `Host: evil.com` and the LemonSqueezy checkout `redirect_url` becomes `https://evil.com/settings?tab=billing&billing=success`. LemonSqueezy redirects the user there post-purchase.
- **Fix**: Use an allowlisted origin rather than the request `host` header:
  ```ts
  const origin = process.env.APP_ORIGIN ?? "https://everion.smashburgerbar.co.za";
  const successUrl = `${origin}/settings?tab=billing&billing=success`;
  ```

### F10: `handlePublicStatus` exposes whether AI key is configured — unauthenticated
- **Confidence**: medium
- **File**: `api/user-data.ts:1175–1188`
- **Risk**: `GET /api/status` is public and unauthenticated. It returns `{ db: true/false, ai: true/false }`. The `db` field confirms Supabase reachability; combined with the 15s edge cache, an attacker can poll this to detect maintenance windows or outages before attempting auth bypass. Low severity individually, but useful for timing attacks.
- **Fix**: Remove the `db` and `ai` fields from the public response. Return only `{ ok: bool, ts: ISO }`. Move the detailed breakdown to the auth-gated `/api/health` endpoint.

### F11: `enumerateUsers` in cron pulls all `user_id` values from `entries` table — no pagination on service-role query
- **Confidence**: medium
- **File**: `api/user-data.ts:2198–2230`
- **Risk**: `enumerateUsers` paginates `entries?select=user_id&order=user_id.asc&limit=1000&offset=N` using the service-role key. With thousands of users and millions of entries, this is a full-table scan on every cron run. Not a security issue per se, but at scale this burns Supabase compute, can cause cron timeouts, and a malicious user flooding the entries table could make the cron silently skip users (if timeouts cause early breaks in the while-loop).
- **Fix**: Use a dedicated `user_profiles` or `auth.users` table for user enumeration rather than deriving from `entries`. `SELECT DISTINCT user_id` on a million-row table is an index scan at best.

### F12: `handleDelete` in `api/entries.ts` — permanent delete (`?permanent=true`) has no additional confirmation mechanism
- **Confidence**: medium
- **File**: `api/entries.ts:213`
- **Risk**: Any authenticated user with brain access can hard-delete any entry (their own, or in a shared brain they can access) by passing `?permanent=true`. There is no secondary confirmation token, TOTP, or elevated-auth requirement. CSRF is mitigated by requiring a JSON body and Supabase JWT, but a CSRF attack via a trusted origin (e.g., a compromised extension, XSS on a different app using same-site cookies) could trigger permanent deletion with no undo path.
- **Fix**: Require a short-lived signed deletion token for permanent deletes, or limit `?permanent=true` to owner role only (not members/viewers).

### F13: `oauthState.ts` falls back to `SUPABASE_SERVICE_ROLE_KEY` for OAUTH_STATE_SECRET
- **Confidence**: medium
- **File**: `api/_lib/oauthState.ts:24`
- **Risk**: If `OAUTH_STATE_SECRET` is not set, the fallback is `SUPABASE_SERVICE_ROLE_KEY`. Using the service-role key as the OAuth state HMAC secret means: (a) if the service-role key is ever rotated, all in-flight OAuth flows break; (b) anyone who obtains the service-role key (already a full compromise) can forge OAuth state tokens. The fallback also means misconfigured environments silently have a weaker-than-intended secret boundary.
- **Fix**: Remove the fallback. If `OAUTH_STATE_SECRET` is absent, `signOAuthState` already throws — that's the correct behavior. Add `OAUTH_STATE_SECRET` to the required env var list and the ops runbook.

---

## Low-Priority / Informational

- `api/entries.ts:232,267` — `console.log` for HARD_DELETE/SOFT_DELETE audit events logs `user.id` to Vercel function logs. These are not PII under GDPR (internal IDs), but the pattern diverges from the structured JSON logger used elsewhere. Migrate to `log.info("audit ...")` for consistency and so these appear in structured log queries.

- `api/_lib/rateLimit.ts:121–130` — The comment says "use LAST IP in x-forwarded-for chain." On Vercel Edge, the last hop is the Vercel edge node IP, not the client. Vercel sets `x-real-ip` to the true client IP. The current fallback order (`lastForwarded || x-real-ip`) means on Vercel the rate limit keys on the edge-node IP, making all users behind the same Vercel PoP share one bucket. Verify Vercel's actual forwarding behavior; likely `x-real-ip` should be the primary.

- `vercel.json` CSP `connect-src` includes `https://openrouter.ai` and `https://api.groq.com`. If these providers are not used in production, remove them — reduces attack surface if an XSS manages to exfiltrate data to an unintended endpoint.

- `vercel.json` CSP has no `frame-ancestors` directive. `X-Frame-Options: DENY` is set (covers older browsers) but CSP `frame-ancestors` is the modern equivalent and should be added for defense-in-depth.

- `api/_lib/verifyAuth.ts` — The JWT cache is module-level (`const cache = new Map`). On a hot Vercel instance that handles both a revoked-user's cached JWT and a new user's request, the cache persists for 30s. This is documented and accepted, but worth noting as a known trade-off in the security model.

- `api/mcp.ts:536` — The MCP OAuth discovery endpoint (`?_wk=1`) responds to both `GET` and `POST` without method check. Fine for discovery, but worth adding `GET`-only for correctness.

- `api/_lib/gmailTokenCrypto.ts` — `scryptSync` parameters: `N` defaults to 16384, `r=8`, `p=1`. These are Node crypto defaults and acceptable, but documenting the parameters explicitly (rather than relying on defaults that could change across Node versions) would harden the key derivation against silent regression.

- `handleRevenueCatWebhook` uses `Authorization: Bearer <secret>` (a static shared secret), not an HMAC of the request body. This is RevenueCat's documented scheme, not a code defect, but it means replay attacks are possible if the secret leaks. The `markWebhookEventSeen` dedup mitigates replay but doesn't prevent a fresh-payload replay using a leaked secret.

---

## Defense-in-Depth Recommendations

- **RLS as second safety net**: Enable Supabase RLS on `entries`, `vault_entries`, `brain_vault_grants`, and `important_memories` even for service-role reads, or create a separate restricted role for these tables. Currently the service-role key bypasses all RLS — every authorization bug in API code becomes exploitable with zero database-layer backstop.

- **Vault entries type guard in DB**: Add a Postgres check constraint `CHECK (type = 'secret')` on `vault_entries` so entries cannot be inserted with any other type, and a trigger on `entries` blocking `UPDATE SET type = 'secret'` unless the row originated from the vault insert path.

- **API key scope**: The `em_*` API key currently grants access to the user's first personal brain only (`resolveApiKey` picks `brains?owner_id=eq.&limit=1`). This is correct, but document it explicitly and add a `scope` column to `user_api_keys` for future per-brain scoping.

- **Admin endpoint hardening**: `isAdminUser` checks `app_metadata.is_admin === true`. Ensure this field is set via the Supabase service-role admin API only, never via client-accessible profile updates. Add a migration comment/constraint confirming `user_metadata` cannot set `is_admin` (Supabase's auth already prevents clients from writing `app_metadata`, but confirm this in a test).

- **Idempotency key namespace collision**: The idempotency key namespace uses caller-supplied strings prefixed with action names (e.g., `vault-setup:`, `apikey-revoke:<id>:`). A user who crafts an `Idempotency-Key` header as `vault-setup:anything` could collide with the vault setup namespace from another action path. Add a per-endpoint random salt to the namespace prefix.

- **File upload size limit**: `api/v1.ts` sets `bodyParser: { sizeLimit: "1mb" }`. The `/api/llm` file-extraction path should confirm a consistent size cap is enforced before passing buffers to `extractFromBuffer` / pdfjs, since pdfjs loading a maliciously crafted large PDF can exhaust memory.

- **Structured logging for all audit-relevant operations**: Several sensitive operations use bare `console.log` strings (`HARD_DELETE`, `SOFT_DELETE`, `PATCH`, `DELETE_ACCOUNT`) rather than the structured JSON logger. These should route through `createLogger` so they appear in Vercel log queries with consistent fields.
