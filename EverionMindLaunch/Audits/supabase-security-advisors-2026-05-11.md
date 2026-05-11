# Supabase Security Advisors — 2026-05-11

Snapshot pulled via the Supabase MCP `get_advisors` (type=security) immediately after applying migrations 084 / 085 / 086 against `wfvoqpdfzkqnenzjxhui` (Everion Mind, production). All findings are **pre-existing** — none were introduced by 084/085/086. None are flagged as critical (`ERROR`); all are `WARN` level. They are not launch blockers but several should be addressed before going public.

---

## Summary

| Category | Count | Severity |
|---|---|---|
| `rls_policy_always_true` | 1 | WARN |
| `anon_security_definer_function_executable` | 12 | WARN |
| `authenticated_security_definer_function_executable` | 14 | WARN |
| `auth_leaked_password_protection` (disabled) | 1 | WARN |
| **Total** | **28** | |

---

## Finding 1 — RLS policy with always-true WITH CHECK

**Table**: `public.marketing_leads`
**Policy**: `marketing_leads_anon_insert`
**Roles**: `anon`, `authenticated`
**Operation**: `INSERT`
**Issue**: `WITH CHECK (true)` — any anon caller can insert any row shape into the marketing_leads table.

Likely intentional (lead-capture form posts from unauthenticated marketing pages need to write). But the always-true check means a bot could:
- Spam the table with garbage rows
- Insert rows attributing leads to other users (if `user_id` column exists)
- DoS via volume

**Remediation options:**
1. Keep `WITH CHECK (true)` but rate-limit anon inserts via a trigger that checks recent insert frequency
2. Tighten WITH CHECK to enforce shape (e.g. `email IS NOT NULL AND email ~ '^[^@]+@[^@]+\.[^@]+$' AND length(content) < 10000`)
3. Route lead-capture through `/api/*` instead of direct PostgREST — auth handled in the function, table becomes service-role only

**Reference**: https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

---

## Finding 2 — SECURITY DEFINER functions callable by anon (12 functions)

These functions run with the privileges of their owner (likely `postgres` / `supabase_admin`) but can be invoked by anonymous PostgREST callers via `/rest/v1/rpc/<name>`. If the function body doesn't filter on `auth.uid()`, anon callers can read or write data that RLS would otherwise block.

| Function | Risk if exposed to anon |
|---|---|
| `public.capture(...)` | **HIGH** — write path for entries. Anon could create entries on someone else's behalf if internal logic trusts caller-provided user_id |
| `public.quick_capture(...)` | **HIGH** — same as capture, simpler signature |
| `public.save_links(p_links jsonb)` | **HIGH** — bulk insert path |
| `public.search_entries(...)` | **MEDIUM** — read path; severity depends on whether it filters by current user |
| `public.match_entries_for_user(query_embedding, p_user_id, ...)` | **HIGH** — accepts p_user_id as input; if not validated against auth.uid() anon can dump any user's entries |
| `public.get_entries_for_brain(p_brain_id)` | **MEDIUM/HIGH** — depends on internal access check |
| `public.get_related_entries(entry_uuid)` | **MEDIUM** |
| `public.get_user_public_key(target_user_id)` | **LOW** — public keys are by definition public, but exposes existence |
| `public.is_brain_member(bid, uid)` | **LOW** — boolean predicate; leaks membership existence |
| `public.is_brain_member_with_role(...)` | **LOW** |
| `public.is_brain_owner(...)` | **LOW** |
| `public.is_entry_shared_to_user(...)` | **LOW** |

**Triage rule:** any function that takes a user_id parameter AND uses SECURITY DEFINER MUST validate `p_user_id = auth.uid()` (or service-role caller) at the top of its body. Without that check the auth gate is gone.

**Remediation (per function):**
- **Best**: switch to `SECURITY INVOKER` so the function runs under the caller's RLS context. Use this where possible.
- **Or**: `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon;` and add `auth.uid()` checks inside the body.
- **Or** (if intentional public read): document why in the function comment and move on.

The boolean predicate helpers (`is_brain_*`) are widely used internally by RLS policies and may need to stay SECURITY DEFINER. The write paths (`capture`, `quick_capture`, `save_links`) are the urgent ones — they should not be anon-callable.

**Reference**: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

---

## Finding 3 — SECURITY DEFINER functions callable by authenticated (14 functions)

Same set as Finding 2 plus 2 extras:
- `public.bulk_apply_embeddings(rows jsonb)` — server-side embedding writer; should be service-role only
- `public.claim_pending_enrichments(p_user_id, p_brain_id, p_limit)` — server-side enrichment queue claimer; should be service-role only
- `public.consume_enrich_quota(p_user_id, p_limit)` — server-side quota decrementer; should be service-role only
- `public.recompute_enrichment_state(p_ids uuid[])` — server-side state recomputer; should be service-role only

Migration 084 attempted to `REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role;` for these — but that left `authenticated` with EXECUTE, which is exactly what this advisor flags. The intent was to lock down to server-side only; current state still allows authenticated callers.

**Recommended fix for the 4 server-side enrichment functions:**
```sql
REVOKE EXECUTE ON FUNCTION public.bulk_apply_embeddings(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bulk_apply_embeddings(jsonb) TO service_role;
-- repeat for claim_pending_enrichments, consume_enrich_quota, recompute_enrichment_state
```

Vercel function calls hit Supabase with the service-role key (per CLAUDE.md), so the API surface keeps working. Browser PostgREST callers lose access — correct, they shouldn't have it.

**Reference**: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

---

## Finding 4 — Leaked Password Protection disabled

Supabase Auth has an opt-in feature that checks new/changed passwords against HaveIBeenPwned. Currently disabled.

**Severity**: WARN. Public launch should flip this on. Cost: zero. Friction: a small subset of users picking weak/leaked passwords get rejected at signup with a clear error.

**Fix**: Supabase dashboard → Authentication → Providers → Email → "Enable password leak protection" toggle. Also enable "Minimum password length" ≥ 10.

**Reference**: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

---

## Prioritised action table

| # | Action | Why | Effort |
|---|---|---|---|
| 1 | Audit + tighten `capture` / `quick_capture` / `save_links` to reject anon callers OR validate auth.uid() internally | Anon write path — highest blast radius | 1–2h |
| 2 | `REVOKE EXECUTE ... FROM authenticated` on the 4 server-side enrichment helpers | Server-only paths; no reason for authenticated to call them | 15 min (new migration 087) |
| 3 | Enable Leaked Password Protection in Auth dashboard + raise min password length to 10 | Cheap, pre-launch hygiene | 5 min |
| 4 | Decide: keep `marketing_leads_anon_insert` permissive (+ trigger rate limit) OR move lead capture through `/api/*` | Spam protection on a public-facing endpoint | 30 min |
| 5 | Review the read-side SECURITY DEFINER helpers (`search_entries`, `match_entries_for_user`, `get_entries_for_brain`, `get_related_entries`) — confirm each filters by auth.uid() internally | If they don't, swap to SECURITY INVOKER | 1h |
| 6 | Document `is_brain_*` helpers as intentionally SECURITY DEFINER (they back RLS policies) so future audits don't keep flagging them | Suppresses noise in audits | 15 min |

---

## Methodology

- Tool: `mcp__plugin_supabase_supabase__get_advisors` (type=security)
- Project: `wfvoqpdfzkqnenzjxhui` (Everion Mind production)
- Timestamp: 2026-05-11
- Triggered by: running this immediately after applying migrations 084 / 085 / 086, per Supabase MCP guidance ("run this regularly, especially after DDL changes")
- Raw output preserved in the conversation log

None of the findings are caused by 084 / 085 / 086. They are an accumulated baseline that should be cleaned up before the launch announcement. Track in `EML/LAUNCH_CHECKLIST.md` under P1.
