# Service-Role Usage Audit — 2026-05-07

> Maps every service-role-key call site, classifies the RLS-bypass surface, and flags paths where user-JWT auth would be safer. The service-role key bypasses every RLS policy — every line that uses it is a one-bug-away-from-cross-user-leak surface.

## Verdict

**Centralisation pass landed in migration 053-era; lint enforces it.** All service-role headers go through `api/_lib/sbHeaders.ts`. `scripts/check-service-role-headers.mjs` blocks any `process.env.SUPABASE_SERVICE_ROLE_KEY` read outside the two allowed files (`sbHeaders.ts`, `oauthState.ts`).

**The remaining surface is the API code itself.** Every `fetch(${SB_URL}/rest/v1/…)` that uses `sbHeaders()` runs as service-role and bypasses RLS. We have ~30 files doing this.

The risk shape: F1/F2/F3 from the May 6 security audit (mutating PATCHs without `user_id`/`brain_id` scope) were closed. **One residual class remains** — handlers that fetch a row by `id` only, then enforce ownership *after* the fetch via `requireBrainRole`. The fetch leaks data into the application layer; if the post-fetch check is ever weakened or skipped, RLS isn't there to catch it.

---

## What's solid

- **Single choke-point**: `api/_lib/sbHeaders.ts` is the only place `process.env.SUPABASE_SERVICE_ROLE_KEY` is read in the codebase. Confirmed by `scripts/check-service-role-headers.mjs` running in `npm run lint`.
- **Allowed exceptions documented**: `_lib/oauthState.ts` reads the env var only as a fallback HMAC secret (separate audit finding; documented).
- **F1–F3 closed**: MCP `delete_entry` / `update_entry` PATCHs scope `id+brain_id`; `/v1/update` blocks `type=secret`; `brain_vault_grants` GET enforces `checkBrainAccess`.
- **withAuth + withApiKey share `startRoute` / `handleRouteError`** — every entry path runs through one boundary.

## Inventory of service-role call sites

29 files import / call `sbHeaders()` or `sbHeadersNoContent()` or use the legacy `hdrs()` factory:

```
api/calendar.ts            api/_lib/billing.ts           api/_lib/handlers/entryDelete.ts
api/capture.ts             api/_lib/buildProfilePreamble api/_lib/idempotency.ts
api/entries.ts             api/_lib/checkBrainAccess.ts  api/_lib/mergeDetect.ts
api/feedback.ts            api/_lib/distillGmail.ts      api/_lib/mergeEntries.ts
api/gmail.ts               api/_lib/distillRejected.ts   api/_lib/personaHygiene.ts
api/llm.ts                 api/_lib/enrich.ts            api/_lib/personalBrain.ts
api/mcp.ts                 api/_lib/enrichQuota.ts       api/_lib/extractPersonaFacts.ts
api/memory-api.ts          api/_lib/feedback.ts          api/_lib/getUpcoming.ts
api/search.ts              api/_lib/gmailPatternScore.ts api/_lib/gmailScan.ts
api/transfer.ts            api/user-data.ts              api/v1.ts
```

## Findings

### F1 — pre-fetch by `id` only, ownership enforced post-fetch (carried)
**Severity: MEDIUM**

`api/entries.ts:281-290` (`handlePatch`) fetches the entry by `id` only:

```ts
fetch(`${SB_URL}/rest/v1/entries?id=eq.${id}&select=brain_id,...`, { headers: sbHeadersNoContent() })
…
await requireBrainRole(user.id, entry.brain_id, ["owner","member"]);
```

The fetch itself bypasses RLS — anyone could read the row with the right `id`. The check is correct *if* `requireBrainRole` is called every time. **Defence-in-depth fix**: add `&user_id=eq.${user.id}` (for owner-only) or `&brain_id=eq.<known>` to the fetch URL so RLS isn't the only safety net.

Same pattern in `api/_lib/handlers/entryDelete.ts:21-22`.

### F2 — cron-style functions iterate ALL users with service-role
**Severity: MEDIUM**

`api/_lib/enrich.ts::enrichAllBrains` and `api/_lib/gmailScan.ts::runGmailScanAllUsers` are cron-only — they enumerate every user via service-role and write to every user's brain. Correct by design (cron has to act as system), but every line inside is a fan-out blast radius.

Mitigations in place:
- `mapWithConcurrency(integrations, GMAIL_CRON_SCAN_CONCURRENCY, …)` bounds fan-out.
- Each per-user call is wrapped in try/catch; one user's failure can't poison the batch.

What to verify:
- Confirm the cron handler has `CRON_SECRET` HMAC validation at the top (it does — `?resource=cron-daily` / `cron-hourly` in user-data.ts).
- Confirm there's a kill switch (env var `GMAIL_CRON_DISABLE=1`) for emergency stop. **Not present today** — would be useful pre-launch.

### F3 — `enrichAllBrains` PostgREST `max_rows=1000` cap (carried from May 6 audit)
**Severity: HIGH** (carried — still unresolved per `EML/LAUNCH_CHECKLIST.md`)

`api/_lib/enrich.ts:1855` does a full-table `brains` scan with no `&limit=1000&order=id`. Past 1000 brains, additional brains never get enriched. Service-role doesn't help here — PostgREST silently truncates.

Already documented in May 6 production audit. Listed under "Critical-path checklist before public launch."

### F4 — bare audit-log writes use service-role with `user_id` from the request body
**Severity: LOW** — defense-in-depth concern

Audit-log inserts in `api/entries.ts`, `api/capture.ts`, `api/llm.ts`, `api/_lib/mergeEntries.ts`, `api/_lib/handlers/entryDelete.ts` all write `user_id: user.id` from the resolved JWT — correct. But the inserts go via service-role, so a logic bug that swaps in `req.body.user_id` would log fraudulent rows.

**Fix**: extract a typed helper `writeAuditLog(user.id, action, resource_id, req_id)` so the user_id parameter can never be confused. Half-implemented in `api/_lib/handlers/entryDelete.ts:69-79` — adopt the same shape elsewhere.

---

## Service-role surface map

| File | Surface | RLS-bypass risk |
|---|---|---|
| `api/_lib/sbHeaders.ts` | sole env reader | n/a (factory only) |
| `api/_lib/oauthState.ts` | HMAC secret fallback | low — used only for state token signing |
| `api/_lib/checkBrainAccess.ts` | reads `brains` + `brain_members` to build the role cache | **load-bearing** — every RLS policy that calls `is_brain_*` depends on this; verify no return-true bug |
| `api/_lib/idempotency.ts` | reads/writes `idempotency_keys` | low — table is just a shared mutex |
| `api/_lib/webhookIdempotency.ts` | reads/writes via service-role | low — webhook events are public-facing anyway |
| `api/_lib/enrich.ts` | iterates entries cross-brain (cron) | **HIGH** — see F3 |
| `api/_lib/gmailScan.ts` | iterates gmail_integrations cross-user (cron) | **HIGH** — see F2; mitigated by concurrency bound |
| `api/_lib/extractPersonaFacts.ts` | writes persona facts to `personal_brain` for any user | medium — must verify `userId` parameter is from JWT, not body |
| `api/entries.ts`, `api/capture.ts`, `api/v1.ts`, `api/mcp.ts` | per-user mutations after JWT resolve | low if F1 fixed; otherwise medium |
| Other `api/*.ts` handlers | per-user reads / writes | low — JWT-scoped |

## Recommendations

1. **[MEDIUM] F1 fix** — add `&user_id=eq.${user.id}` (or compound brain scope) to pre-fetch URLs in `api/entries.ts:281,313`, `api/_lib/handlers/entryDelete.ts:21`. ~10 min for the pair.
2. **[MEDIUM] F2 mitigation** — add a `GMAIL_CRON_DISABLE` env-var kill switch to `runGmailScanAllUsers`. Same for `enrichAllBrains`. 5 min each.
3. **[HIGH] F3** — paginate `enrichAllBrains` (`?limit=1000&order=id`) — already on the LAUNCH_CHECKLIST. Confirm scheduled.
4. **[LOW] F4** — extract `writeAuditLog()` helper. Consolidates ~9 ad-hoc write sites into one typed surface. ~30 min.
5. **[INFO]** Add a short `SERVICE-ROLE.md` doc next to `_lib/sbHeaders.ts` explaining the rule: "every `fetch(${SB_URL}/rest/v1/…)` call must AND-filter on user_id or brain_id (after a `checkBrainAccess` call). RLS is a backstop, not a gate."

## Method

- 29 files enumerated via `grep -rln "sbHeaders\|hdrs()" api/`.
- `scripts/check-service-role-headers.mjs` confirmed as the canonical lint guard.
- Cross-referenced with `EML/Audits/archive/audit-security-2026-05-06.md` (F1–F3 carried-forward audit).
- Sample fetches walked manually to confirm post-fetch ownership checks present.

**Audit kicked off by**: user request "do all those highest-leverage audits" on 2026-05-07.
