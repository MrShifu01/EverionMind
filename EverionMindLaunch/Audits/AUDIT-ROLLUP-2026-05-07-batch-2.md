# Audit Rollup — Batch 2 (2026-05-07)

> Findings from the second-batch audits — security, capture-pipeline, retrieval, mcp-server, email-deliverability, rate-limiter. Pending merge into `TODO-AUDIT-FIXES.md` after batch-1 closes.
>
> **Status legend:** [ ] open · [x] done · [~] in progress · [-] deferred (post-launch).
> **Source link:** `{audit}` → `EML/Audits/{audit}-audit-2026-05-07.md`

---

## Roll-up by audit

| Audit | Verdict | HIGH | MED | LOW | INFO | File |
|---|---|---:|---:|---:|---:|---|
| security | PASS w/ conditions | 1 | 4 | 3 | — | `security-audit-2026-05-07.md` |
| capture-pipeline | PASS w/ edge gaps | 2 | 2 | 3 | — | `capture-pipeline-audit-2026-05-07.md` |
| retrieval | architecture sound | 3 | 3 | 2 | — | `retrieval-audit-2026-05-07.md` |
| mcp-server | mostly right | 3 | 2 | 5 | 2 | `mcp-server-audit-2026-05-07.md` |
| email-deliverability | NOT launch-ready | 2 | 2 | 1 | — | `email-deliverability-audit-2026-05-07.md` |
| rate-limiter | mechanism right | 3 | 3 | 4 | — | `rate-limiter-audit-2026-05-07.md` |
| **Totals** | — | **14** | **16** | **18** | **2** | 50 findings |

---

## Phase B0 — Fix today (one-line, all HIGH) · ~1 hour

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| B0.1 | HIGH | [ ] `_getIp` — return leftmost `x-forwarded-for` entry, not Vercel edge IP. Carried since 2026-05-06 | `api/_lib/rateLimit.ts` (`_getIp`) | rate-limiter F1 |
| B0.2 | HIGH | [ ] `resolveApiKey` brain lookup — add `&is_personal=eq.true` so MCP writes land in personal brain when caller omits `brain_id` (matches `personalBrain.ts:30-31`, `gmailScan.ts:1057`) | `api/_lib/resolveApiKey.ts:28-31` | mcp-server F3 |
| B0.3 | HIGH | [ ] DMARC TXT record at registrar — `_dmarc.smashburgerbar.co.za` → `v=DMARC1; p=none; rua=mailto:postmaster@smashburgerbar.co.za` | DNS only | email F1 |
| B0.4 | HIGH | [ ] `api/mcp.ts:897` — replace undefined `plan` with `tier`. Quota-exceeded path currently throws `ReferenceError` masked as generic `-32603` | `api/mcp.ts:897` | mcp-server F1 |

---

## Phase B1 — Pre-launch HIGH blockers

### B1A — auth + secrets

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| B1A.1 | HIGH | [ ] `mcpTokenSecret()` — drop the `SUPABASE_SERVICE_ROLE_KEY` fallback. Require `MCP_ACCESS_TOKEN_SECRET` set; fail closed at boot if absent. Same anti-pattern as `oauthState.ts` F13 (May-6) | `api/mcp.ts:40-42` | mcp-server F2 |

### B1B — webhooks + rate-limit

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| B1B.1 | HIGH | [ ] LemonSqueezy + RevenueCat webhook receivers — add `rateLimit({ id:'webhook:lemon' / 'webhook:rc' })` (~10 lines). Defence-in-depth even with signature verify + idempotency | `api/user-data.ts` (LS + RC handlers) | rate-limiter F3 |
| B1B.2 | HIGH | [ ] `api/mcp.ts` rate-limit key — suffix with `mcp:<api_key_id>` for API-key requests, `user:<userId>` for JWT. Today same IP collides MCP traffic with browser JWT | `api/mcp.ts` | rate-limiter F2 |

### B1C — supply-chain + browser

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| B1C.1 | HIGH | [ ] CSP `connect-src` — strip `api.anthropic.com`, `api.openai.com`, `openrouter.ai`, `api.groq.com`, `api.resend.com`, `generativelanguage.googleapis.com`. Server-side only; presence is XSS-exfil surface | `vercel.json:81` | security F1 |

### B1D — capture audit-log gaps

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| B1D.1 | HIGH | [ ] Write `audit_log` row on idempotency-replay branch (`capture.ts:127-130`) and dedup-merge branch (`:268-271`). Same pattern at `v1.ts:368-370` and `mcp.ts:903-910`. Today retried successful captures land zero audit rows | `api/capture.ts:127, :268` · `api/v1.ts:368` · `api/mcp.ts:903` | capture F1 |
| B1D.2 | HIGH | [ ] Sibling entry-creation doors (`v1.ts ingest`, `mcp.ts create_entry`, `llm.ts chat-tool create_entry`, `transfer.ts import`) write zero `audit_log`. Only `capture.ts` does → coverage 25%. Extract shared `writeCaptureAudit(user, entry, source, req_id)` and call from each | `api/v1.ts` · `api/mcp.ts` · `api/llm.ts` · `api/transfer.ts` | capture F2 |

### B1E — email deliverability

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| B1E.1 | HIGH | [ ] Supabase Dashboard → Auth → SMTP Settings → switch from default sender to Resend SMTP relay. Default sender is `noreply@mail.app.supabase.co` — heavy rate-limit (4/hr/project), domain mismatch, DMARC alignment fails | Supabase dashboard, no code | email F2 |

### B1F — retrieval cost + perf

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| B1F.1 | HIGH | [ ] Add embedding cache — dedupe by `sha256(query)` with 5-min TTL. Today every retrieval re-embeds via Gemini. ~100ms median per call + paid Gemini tokens | `api/_lib/generateEmbedding.ts` (cache wrapper) | retrieval F1 |
| B1F.2 | HIGH | [ ] Drop the 4th PostgREST round-trip in `retrieveEntries` (metadata-hydrate). Add `metadata` column to keyword/tag selects (already returned by vector RPC) | `api/_lib/retrievalCore.ts` | retrieval F2 |
| B1F.3 | HIGH | [ ] Migration 086 — `CREATE EXTENSION pg_trgm; CREATE INDEX entries_content_trgm_idx ON entries USING gin (content gin_trgm_ops);` Today keyword/tag expand uses `ILIKE '%kw%'` — full table scan once entries grow past a few thousand | new migration | retrieval F3 |

---

## Phase B2 — Pre-launch MEDIUM hardening

| # | Severity | Fix | File / Line | Source |
|---|---|---|---|---|
| B2.1 | MEDIUM | [ ] JWT cache TTL `5_000 → 2_000` ms. Force-revalidate on delete-account, admin-tier, api-key revoke | `api/_lib/verifyAuth.ts:8` | security F2 |
| B2.2 | MEDIUM | [ ] `withAuth` rate-limit key — when `user.id` resolved, key by `user:<id>` not IP. Mirrors `withApiKey` two-tier pattern; closes NAT lockout | `api/_lib/withAuth.ts` | security F3, rate-limiter F5 |
| B2.3 | MEDIUM | [ ] CSP — add `frame-ancestors 'none'` and `base-uri 'none'`. Closes click-jacking + base-tag injection | `vercel.json:81` | security F4 |
| B2.4 | MEDIUM | [ ] Idempotency-key namespace — flat per-user collides on legit double-fire. Prefix with `<route>:` (e.g. `capture:<hash>`, `mcp_create:<hash>`) | `api/_lib/idempotency.ts` + every callsite | capture F3 |
| B2.5 | MEDIUM | [ ] `bodyParser.sizeLimit` — drop `10mb → 512kb` on `api/capture.ts`. Largest legit body sums to ~265 KB; current 10 MB is 38× DoS bandwidth/CPU waste | `api/capture.ts:23` | capture F4 |
| B2.6 | MEDIUM | [ ] `match_count` in `match_entries` RPC — read caller `limit` instead of hard-coded 20 | `api/_lib/retrievalCore.ts` | retrieval F4 |
| B2.7 | MEDIUM | [ ] Embedding circuit breaker — when Gemini is down, fall back to BM25-only with `aiAllowed:false` flag in response | `api/_lib/generateEmbedding.ts` + `retrievalCore.ts` | retrieval F5 |
| B2.8 | MEDIUM | [ ] Concurrent-embed dedup — when same query embedded twice in 100ms, dedup via in-flight promise map | `api/_lib/generateEmbedding.ts` | retrieval F6 |
| B2.9 | MEDIUM | [ ] 7 of 8 mutating MCP tools write nothing to `audit_log`. Add `writeAuditLog(...)` to `update_entry`, `delete_entry`, `merge_entries`, `gmail_ignore_pattern`, `update_user`, etc. | `api/mcp.ts` | mcp-server F4 |
| B2.10 | MEDIUM | [ ] MCP tool result size guard — truncate to 32 KB or paginate. Today an attacker calling a tool returning huge data blows context window and racks up provider cost | `api/mcp.ts` (result builder) | mcp-server F5 |
| B2.11 | MEDIUM | [ ] Resend sends — add `List-Unsubscribe: <mailto:unsubscribe@everion.smashburgerbar.co.za>, <https://everion.smashburgerbar.co.za/unsubscribe?u={uid}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers. Required by Gmail/Yahoo Feb-2024 bulk-sender rules | `api/_lib/sendInviteEmail.ts:58` · `api/_lib/weekly-roll-up.ts:277-282` | email F3 |
| B2.12 | MEDIUM | [ ] `RESEND_FROM` fallback — change from `everionmind.com` (unowned) to `noreply@everion.smashburgerbar.co.za` | `api/_lib/sendInviteEmail.ts` (default) + Vercel env | email F4 |
| B2.13 | MEDIUM | [ ] `memory-api.ts`, `calendar.ts`, `mcp.ts` — re-key rate-limit by `user.id` post-auth, not IP only | three files | rate-limiter F4 |

---

## Phase B3 — LOW + nits (post-launch acceptable)

| # | Severity | Fix | Source |
|---|---|---|---|
| B3.1 | LOW | [ ] `vercel.json` CSP — add `'strict-dynamic'` to `script-src` for stronger CSP-3 score | security F7 |
| B3.2 | LOW | [ ] CSP `connect-src` — drop static PostHog `Authorization` header reference (no auth header needed) | security F8 |
| B3.3 | LOW | [ ] `handleAuth` — wrap redirect path in try/catch; today an error after redirect issuance silently 200s | security F6 |
| B3.4 | LOW | [ ] `updateStreak` — add `.catch(log.warn)` so admin endpoint errors don't bubble | capture F5 |
| B3.5 | LOW | [ ] Gmail attachment late-extract is fire-and-forget at scan time. Move into enrichment queue (overlap with enrichment-audit) | capture F6 |
| B3.6 | LOW | [ ] Free-tier `?action=embed` does NOT check `aiAllowed`. Gate with same flag as enrichment | capture F7 |
| B3.7 | LOW | [ ] Tag-sibling expand can spider into noise — cap at top-5 sibling tags by usage | retrieval F7 |
| B3.8 | LOW | [ ] `applyGraphBoost` only fires for `retrieveEntries`, not `retrieveEntriesForUser`. Document or unify | retrieval F8 |
| B3.9 | LOW | [ ] `gmail_sync` MCP tool — `brain_id` arg documented but silently ignored; either honour or remove from schema | mcp-server F6 |
| B3.10 | LOW | [ ] `merge_entries` MCP tool definition omits `brain_id` parameter; add it for consistency | mcp-server F7 |
| B3.11 | LOW | [ ] `resolveTargetBrain` accepts non-string `brain_id` then ignores it. Validate type, return 400 | mcp-server F8 |
| B3.12 | LOW | [ ] MCP token verification has no `iss`/`aud`/`sub` claims. Add for auditability | mcp-server F9 |
| B3.13 | LOW | [ ] OAuth `client_credentials` accepts any valid `em_` key as `client_secret`. Tighten to require dedicated MCP client registration | mcp-server F10 |
| B3.14 | LOW | [ ] `merge_entries` rate limit is global per-IP; switch to per-key | mcp-server F11 |
| B3.15 | LOW | [ ] `gmail_ignore_pattern` writes user-controlled string into `preferences.custom` with no length cap. Cap at 256 chars | mcp-server F12 |
| B3.16 | LOW | [ ] Weekly roll-up email — add text/plain alternative (currently HTML-only) | email F5 |
| B3.17 | LOW | [ ] `health` route opts out of rate-limit; OK by design but document | rate-limiter F7 |
| B3.18 | LOW | [ ] Pre-auth gate in `withApiKey` doesn't trip on user identity. Design note | rate-limiter F8 |
| B3.19 | LOW | [ ] In-memory dev fallback masks rate-limit bugs. Make Upstash mandatory in `NODE_ENV=production` | rate-limiter F9 |
| B3.20 | LOW | [ ] Add 3-second timeout on Upstash REST `fetch` — today an Upstash hang slows every request | rate-limiter F10 |
| B3.21 | NIT | [ ] `req.url` includes query string before split — bound is on the wrong slice | rate-limiter F11 |
| B3.22 | INFO | (mcp-server F-info × 2) — recorded in source audit only | mcp-server INFO |

---

## Limitations carried into batch 2

| Audit | Blocked signal | Re-run trigger |
|---|---|---|
| security | Supabase MCP not authenticated → RLS coverage F5 unverified | Re-run F5 once MCP OAuth done |
| capture | Supabase MCP not authenticated → no live p95 / 24h 5xx scan | Re-run probe in observability cycle |
| retrieval | Supabase MCP not authenticated → no `EXPLAIN ANALYZE` / advisor lints | Defer to `vector-index-audit` 2026-06-14 |
| email | Cannot run mail-tester.com without WebFetch | Manual run pre-launch |
| rate-limiter | Upstash credentials not readable; no live x-forwarded-for chain measurement | Re-run with prod env access |

---

## Merge plan

When batch-1 (`TODO-AUDIT-FIXES.md`) closes:

1. Renumber Phase B0–B3 → continue from existing Phase X numbering.
2. Fold Phase B0 into Phase 0 (one-line fixes).
3. Fold Phase B1 into Phase 1 (pre-launch blockers) by sub-area (auth/webhooks/CSP/capture/email/retrieval).
4. Fold Phase B2 into Phase 2.
5. Fold Phase B3 into Phase 3.
6. Update header: "across all 11 reports" → "across all 17 reports".
7. Delete this file once merge complete; preserve in git history.

---

**File created**: 2026-05-07 by audit batch-2 rollup.
**Maintenance**: keep `[ ]` checkboxes synced with the source audit files. When a row closes, also add a `## Resolution — YYYY-MM-DD` section to the source audit per the EML address-and-archive workflow before archiving.
