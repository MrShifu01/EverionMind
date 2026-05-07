# Admin Tab Audit — 2026-05-07

> Server-side gate review for the Settings → Admin surface. Scope: every action the admin tab can fire, including tier override, debug runners, persona/gmail learning panels, push diagnostics, and the support CRM. F4 from production-audit asked to verify the gate is server-side (not client-only) after the recent extraction of `api/_lib/adminAuth.ts`. Out of scope: RLS itself (covered by db-audit + brain-sharing-audit).

## Verdict

**Server-side gating is in place on every admin endpoint** — the F4 carry-over from the May 6 production audit is closed. `isAdminUser` is now a single-source helper at `api/_lib/adminAuth.ts:3`, imported by `api/entries.ts:40` and `api/user-data.ts:36`. Eight handlers in `entries.ts` and three in `user-data.ts` short-circuit on `!isAdminUser(user)` → 403.

**Three real findings.** F1 (HIGH): `handleTriggerTestPush` uses a different gate (`ADMIN_EMAIL` env-var equality on `user.email`) than every other admin endpoint — drift hazard. F2 (MEDIUM): `audit_log` write in `handleAdminSetTier` is fire-and-forget AFTER the PATCH — a crash between the two leaves no audit trail. F3 (MEDIUM): four `requireBrainAccess`-only handlers (`audit-persona`, `wipe-persona-extracted`, `backfill-persona`, `revert-persona-backfill`) are bound to entries the caller already owns, but two of them (`wipe`, `audit`) hard-delete or reject persona entries with no audit_log row at all.

**Plus five LOW findings** around rate-limit gaps, missing audit rows on the eight `entries.ts` admin handlers, no per-target validation that `target_user_id !== user.id` for self-elevation guards (currently moot — no self-elevation endpoint exists), the client-side admin tab leaks no admin-only data when rendered for a non-admin user (it's not even mounted — `SettingsView.tsx:358-360`), and `handleSentryIssues` / `handleHealth` are NOT admin-gated despite being shown only inside the AdminTab.

---

## Architecture overview

```
Settings → Admin tab (only mounted when app_metadata.is_admin === true)
   │
   ├─ DebugDashboardSection ─→ GET /api/user-data?resource=health           [no admin gate, public]
   │                       └→ GET /api/user-data?resource=sentry_issues    [no admin gate, withAuth only]
   │                       └→ github.com (public unauth REST)
   ├─ AdminCRMSection      ─→ GET  ?resource=admin_users                   [isAdminUser gate]
   │                       └→ GET  ?resource=admin_user_overview           [isAdminUser gate]
   │                       └→ POST ?resource=admin_set_tier                [isAdminUser gate, idem-key, audit]
   ├─ TierChanger          ─→ PATCH user_profiles via browser SDK          [DB-trigger lock, see Finding F4]
   ├─ DeveloperPreviewSection (opens preview tab — no API)
   ├─ PushTestSection      ─→ POST ?resource=trigger-test-push             [ADMIN_EMAIL gate — DRIFT]
   ├─ DailySummarySection  ─→ POST ?resource=prefs                         [withAuth, owner-self only]
   ├─ ScheduleInspectorSection (CPU only, no API)
   ├─ MockGmailReviewSection (frontend-only modal, mock data)
   ├─ AdminDisplaySection  ─→ localStorage prefs (no API)
   ├─ FeatureFlagsSection  ─→ localStorage flags (no API)
   └─ Run-all tests        ─→ /api/llm + /api/capture                      [withAuth, owner-self only]

api/entries.ts admin handlers (action-routed):
   ├─ ?action=enrich-debug             [isAdminUser + requireBrainAccess]
   ├─ ?action=enrich-clear-backfill    [isAdminUser + requireBrainAccess]
   ├─ ?action=enrich-retry-failed      [isAdminUser + requireBrainAccess]
   ├─ ?action=persona-prompt           [isAdminUser + requireBrainAccess]
   ├─ ?action=distill-rejected         [isAdminUser]
   ├─ ?action=distill-gmail            [isAdminUser]
   ├─ ?action=gmail-prompt             [isAdminUser]
   ├─ ?action=audit-persona            [requireBrainAccess only — see F3]
   ├─ ?action=wipe-persona-extracted   [requireBrainAccess only — see F3]
   ├─ ?action=backfill-persona         [requireBrainAccess only — see F3]
   └─ ?action=revert-persona-backfill  [requireBrainAccess only — see F3]
```

`isAdminUser(user)` reads `user.app_metadata.is_admin === true` only. `app_metadata` is unwritable by the browser SDK (Supabase enforces this server-side); only the service-role admin API can flip it. That's correct — the gate is unforgeable from the client.

---

## Admin-action inventory

| # | Action | Endpoint | Server gate | Audit log | Rate limit | Danger class |
|---|---|---|---|---|---|---|
| 1 | Search users by email/UUID | GET `?resource=admin_users` | `isAdminUser` (`user-data.ts:3296`) | none | 60/min | low (read) |
| 2 | View one user's profile + usage + audit | GET `?resource=admin_user_overview` | `isAdminUser` (`user-data.ts:3321`) | none | 60/min | medium (PII read) |
| 3 | Override any user's tier | POST `?resource=admin_set_tier` | `isAdminUser` (`user-data.ts:3353`) | YES — fire-and-forget AFTER PATCH (`user-data.ts:3432-3448`) | 30/min, idem-key | HIGH (mutates other user) |
| 4 | Trigger test-push GH Actions workflow | POST `?resource=trigger-test-push` | `ADMIN_EMAIL` env equality (`user-data.ts:2118-2121`) | none | 10/min | medium (external dispatch, self-only) |
| 5 | Read Sentry top issues | GET `?resource=sentry_issues` | `withAuth` only — NO admin gate (`user-data.ts:1353`) | n/a | 20/min | low (info disclosure) |
| 6 | Read backend health | GET `?resource=health` | `withAuth` only — accepts ALL methods, NO rate limit (`user-data.ts:1216-1217`) | n/a | none | low (info disclosure) |
| 7 | Persona extractor live prompt | GET `?action=persona-prompt` | `isAdminUser` + `requireBrainAccess` (`entries.ts:939`) | none | 30/min (default) | low (own-brain read) |
| 8 | Force re-render of rejected-pattern summary | POST `?action=distill-rejected` | `isAdminUser` (`entries.ts:953`) | none | 30/min | low (own-state mutation) |
| 9 | Force re-render of gmail accept/reject summary | POST `?action=distill-gmail` | `isAdminUser` (`entries.ts:962`) | none | 30/min | low (own-state mutation) |
| 10 | Gmail classifier live prompt | GET `?action=gmail-prompt` | `isAdminUser` (`entries.ts:1042`) | none | 30/min | low (own-brain read) |
| 11 | Enrichment debug dump | GET `?action=enrich-debug` | `isAdminUser` + `requireBrainAccess` (`entries.ts:1167`) | none | 30/min | low (own-brain read) |
| 12 | Clear backfill flags so re-enrichment runs | POST `?action=enrich-clear-backfill` | `isAdminUser` + `requireBrainAccess` (`entries.ts:1260`) | none | 30/min | medium (mutates own metadata in bulk) |
| 13 | Retry failed embeddings | POST `?action=enrich-retry-failed` | `isAdminUser` + `requireBrainAccess` (`entries.ts:1304`) | none | 30/min | medium (mutates own metadata in bulk) |
| 14 | Bulk-reject duplicated persona facts | POST `?action=audit-persona` | `requireBrainAccess` only (`entries.ts:925-931`) | none | 30/min | medium (rejects rows, no log) — see F3 |
| 15 | Hard-delete auto-extracted persona entries | POST `?action=wipe-persona-extracted` | `requireBrainAccess` only (`entries.ts:910-916`) | none | 30/min | HIGH (delete) — see F3 |
| 16 | Backfill persona facts from existing entries | POST `?action=backfill-persona` | `requireBrainAccess` only (`entries.ts:882-890`) | none | 30/min | medium (creates entries) — see F3 |
| 17 | Revert prior persona-backfill type-flips | POST `?action=revert-persona-backfill` | `requireBrainAccess` only (`entries.ts:897-902`) | none | 30/min | medium — see F3 |
| 18 | Self-tier change (testing) | browser SDK `update user_profiles set tier=` (`AdminTab.tsx:142-145`) | DB-layer trigger `_lock_billing_columns` (migration 057) — blocks ALL non-service-role writes | n/a — write blocked | n/a | n/a (write blocked) — see F4 |

---

## What's solid

- **Single source of truth for the gate.** `api/_lib/adminAuth.ts:3-5` is the one and only definition of `isAdminUser`. The duplication that smash-os-audit / production-audit / audit-architecture flagged (`entries.ts:987` and `user-data.ts:3267` previously) is gone. Any future change to admin semantics lands in one file. F4 from `EML/Audits/archive/production-audit-2026-05-07.md` and W2 from same are CLOSED.
- **Gate is unforgeable.** `app_metadata.is_admin` is service-role-write-only (Supabase auth enforces this). The browser SDK cannot set it. Confirmed via `adminPrefs.ts:21-33` (no API write path) and the absence of any endpoint that PATCHes `app_metadata`.
- **No self-elevation endpoint exists.** Greps for `app_metadata`, `is_admin`, `auth.admin.updateUserById` across `api/*.ts` show zero call sites that flip `is_admin`. The only path to admin is via the Supabase dashboard (service-role).
- **Tier override is the most dangerous action and it's the most-protected.**
  - Server gate: `isAdminUser` (`user-data.ts:3353`)
  - Target validation: UUID regex on `target_user_id` (`user-data.ts:3364-3366`)
  - Tier validation: explicit allowlist `free | starter | pro | max` (`user-data.ts:3367-3374`)
  - Reason required: 1-200 chars (`user-data.ts:3375-3377`)
  - Idempotency: client-supplied `Idempotency-Key` header, 24h replay window (`user-data.ts:3382-3397`)
  - Reads previous tier BEFORE the PATCH so audit can record before/after (`user-data.ts:3400-3413`)
  - Writes audit_log with `actor_id` (= `user.id` from JWT, NEVER from request body), `actor_email`, `previous_tier`, `new_tier`, `reason` (`user-data.ts:3432-3445`)
  - Rate limit 30/min — high enough for a real support shift, low enough to slow a runaway script.
- **Browser-side tier mutation is locked at the DB.** `TierChanger` in `AdminTab.tsx:132-153` calls `supabase.from("user_profiles").update({ tier })` which uses the browser anon-role JWT. Migration 057's `_lock_billing_columns` trigger BLOCKS this write at the row level — see `EML/Audits/archive/billing-audit-2026-05-07.md` line 32. The TierChanger is an admin-only "test the lock" UI that is _supposed_ to fail silently in production. Verified: no client-side path writes a tier successfully.
- **CRM PII reads use UUID regex on `id` query param.** Prevents PostgREST injection (`user-data.ts:3324`). Same pattern in `admin_set_tier` (`user-data.ts:3364`). No string concatenation into `eq.${target}` without prior UUID validation.
- **Admin-set-tier resolves `actor_user_id` from the JWT, not the body.** `metadata.actor_id: user.id` (`user-data.ts:3439`) — the request body's `target_user_id` cannot pose as the actor.
- **Client-side render gate is informational only.** `SettingsView.tsx:338-360` calls `refreshSession()` first to pull fresh `app_metadata`, then renders the Admin tab nav button conditionally. Even if a non-admin force-mounts AdminTab via DevTools, every endpoint server-rejects with 403. The render gate is purely UX. Confirmed: no admin-only data exists in component state until an endpoint returns it, and every endpoint is gated.
- **AdminCRMSection's tier change uses `crypto.randomUUID()` as idempotency key.** `AdminCRMSection.tsx:440` — protects against double-click. Server replays return `{ ok: true, replay: true }` (`user-data.ts:3395`).
- **Audit timeline is shown to the admin.** `AdminCRMSection.tsx:698-747` renders the last 50 audit_log rows for the selected user. Anyone in support can see "who changed what" without SQL access.

---

## Findings

### F1 — `handleTriggerTestPush` uses a different admin gate than every other endpoint
**Severity: HIGH** — security drift, the exact failure mode F4 was opened to prevent.

`api/user-data.ts:2115-2121`:

```ts
const handleTriggerTestPush = withAuth(
  { methods: ["POST"], rateLimit: 10 },
  async ({ req, res, user }) => {
    const adminEmail = (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || "").trim();
    if (!adminEmail || !user.email || user.email !== adminEmail) {
      return void res.status(403).json({ error: "Forbidden" });
    }
```

Every other admin endpoint gates on `isAdminUser(user)` (= `app_metadata.is_admin === true`). This one gates on `user.email === process.env.ADMIN_EMAIL`. Two problems:

1. **Drift.** The whole point of extracting `adminAuth.ts` was so admin-surface drift can't happen. This endpoint pre-dates the extract and was never migrated. If `is_admin` is ever granted to a second user (Christian + a future support engineer), they cannot fire push diagnostics — even though they have admin everywhere else. The opposite is also a hazard: if `ADMIN_EMAIL` is mis-set in Vercel env to a user who is NOT supposed to be admin, that user gets push-dispatch power without `is_admin = true`.
2. **`VITE_ADMIN_EMAIL` fallback is wrong.** `VITE_*` vars are intended for client-side bundling. Reading one at server side suggests the original code was written by copy-paste from the browser without a follow-up review. If a Vercel deploy sets `VITE_ADMIN_EMAIL` (for the client build) but not `ADMIN_EMAIL`, the gate now keys on the public-bundled value — the email is in the production JS bundle.

**Fix**: replace the email-equality block with `if (!isAdminUser(user)) return void res.status(403).json({ error: "Forbidden" });`. Same import the file already has (`user-data.ts:36`). Drop `ADMIN_EMAIL` and `VITE_ADMIN_EMAIL` from the Vercel env once the rewrite ships. Audit `EML/Ops/env-vars.md` for stale references.

### F2 — `audit_log` write happens AFTER the PATCH, not before, and is fire-and-forget
**Severity: MEDIUM** — the canonical "tier change with no audit row" failure mode.

`api/user-data.ts:3415-3448`:

```ts
const patchRes = await fetch(`${SB_URL}/rest/v1/user_profiles?id=eq.${...}`, {
  method: "PATCH", ...
});
if (!patchRes.ok) { ... return 502 ... }

// Audit-log entry. Fire-and-forget so a logging hiccup doesn't undo the
// tier change. The PATCH already succeeded — losing one log row is the
// less-bad failure mode than a confused customer.
fetch(`${SB_URL}/rest/v1/audit_log`, {
  method: "POST", ...
}).catch((err) => {
  console.error("[admin_set_tier] audit_log write failed:", err);
});
```

Comment is honest about the tradeoff but it's the wrong tradeoff for an enterprise launch:

- **Crash window.** Vercel function can be killed between the PATCH and the audit fetch (process timeout, OOM, region failover). Tier is changed, audit is gone — exactly the "who changed Christian's tier on May 7?" question that has no answer.
- **Network errors silently swallowed.** `.catch(err => console.error(...))` just logs. No retry, no fallback queue. Under Supabase's load events (last week's "unhealthy" alerts in `EML/Audits/archive/`), this fails quietly.

The audit row has the data needed to RECONSTRUCT the tier change, so the right invariant is **audit_log MUST land OR the PATCH MUST be reverted**. Two options, in order of how-much-rework:

1. **Cheapest**: write audit_log BEFORE the PATCH with `status: "pending"`, then update to `applied` after PATCH succeeds. A row with status=pending tells support "we tried; check Vercel function logs for the PATCH outcome." Two fetches instead of one.
2. **Right**: do the whole thing in a Postgres function (`admin_set_tier_with_audit(p_target uuid, p_new_tier text, p_actor uuid, p_reason text)`) so the PATCH and the INSERT are in one transaction. Either both or neither. Pass the actor_id as an argument; the function INSERTs into audit_log with `SECURITY DEFINER`.

The May 6 production audit's F12 — "audit_log not used everywhere it should be" — also covers this. Tagged for cross-reference.

### F3 — Four persona/gmail handlers have no admin gate AND no audit_log
**Severity: MEDIUM** — bounded by ownership but invisible.

| Handler | File | Server gate | Mutates | audit_log |
|---|---|---|---|---|
| `handleAuditPersona` | `entries.ts:925-931` | `requireBrainAccess` only | bulk-rejects persona facts in caller's brain | NO |
| `handleWipePersonaExtracted` | `entries.ts:910-916` | `requireBrainAccess` only | hard-deletes persona entries in caller's brain | NO |
| `handleBackfillPersona` | `entries.ts:882-890` | `requireBrainAccess` only | creates persona entries in caller's brain | NO |
| `handleRevertPersonaBackfill` | `entries.ts:897-902` | `requireBrainAccess` only | flips entry types in caller's brain | NO |

These are exposed in the AdminTab UI (Settings → Enrichment → admin extras) but not gated on `isAdminUser`. They can ONLY mutate the caller's own brain (via `requireBrainAccess`), so a non-admin user calling them can only blast their own data — no cross-tenant risk. But:

- **`wipe-persona-extracted` is a bulk hard-delete.** A user who finds the action name (it's in the bundled JS — search "wipe-persona-extracted" in any production-built bundle) can fire it via `fetch` and obliterate their auto-extracted persona entries with NO audit row. Then claim "everion deleted my data" with no way for support to confirm or refute.
- **`audit-persona` rejects facts in bulk.** Same shape — no audit row, no record.
- **The handlers existed before the admin tab was a clear concept.** They migrated to the admin UI but the gate didn't migrate with them.

**Fix path**:

1. Add `isAdminUser(user)` check to all four (one-line each — pattern is already in 7 other handlers in the same file).
2. Add audit_log write to `handleWipePersonaExtracted` (count-deleted, brain_id) and `handleAuditPersona` (count-rejected). The other two are reversible / already idempotent and lower priority.
3. Either move them out of the public action list into a separate `?admin=` namespace, OR document that `requireBrainAccess` is the only intended gate (they're meant to be self-service for any user) — but then take them out of the AdminTab where the UI suggests admin-only.

The architecture decision (admin-only vs. self-service) needs a one-line ruling. Once decided, the gate matches the ruling and the audit_log row matches the danger class.

### F4 — `handleHealth` accepts every HTTP method with rateLimit:false
**Severity: LOW** — DOS amplifier, not a confidentiality issue.

`api/user-data.ts:1216-1217`:

```ts
const handleHealth = withAuth(
  { methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], rateLimit: false },
```

`rateLimit: false` means no per-user throttle. The handler does 4 outbound fetches (Supabase, Gemini, Groq, Upstash) per call. The Admin tab polls it every 30s while visible (`AdminTab.tsx:782-784`). A second admin tab open in another window doubles the fan-out. A non-admin user with the URL gets the same — `withAuth` only requires a valid session.

Not a security issue per se — every value returned (`db: bool, gemini: bool, groq: bool, upstash: bool`) is non-PII and is the same for every authenticated caller. But it's a self-DOS vector and a multiplier on the Gemini quota.

The `AdminTab.tsx:782-789` visibility-gated polling already addresses the worst of it; the comment at lines 778-782 explicitly calls this out as the May 2026 Supabase unhealthy-alert cause. Carrying it down to LOW because the polling fix is in.

**Fix**: `rateLimit: 30` (per-user, per-minute). Restrict methods to GET only. The other methods exist because of an old hard-rewrite quirk that's no longer relevant.

### F5 — `handleSentryIssues` has no admin gate
**Severity: LOW** — info disclosure, but Sentry data is internal-only and the surface is narrow.

`api/user-data.ts:1353-1379`. Any authenticated user can call `?resource=sentry_issues` and get the top 24h Sentry issues for the project — issue title, event count, user count, last-seen timestamp, permalink. The permalink is to `sentry.io/organizations/<org>/issues/<id>/` which requires Sentry login to actually open, so the leak is the **issue titles** (which can include error messages, sometimes with user-ID fragments).

Mitigations: Sentry titles in this project are already scrubbed (`EML/Audits/archive/audit-security-2026-05-06.md` confirmed PII-free error messages). The endpoint is rate-limited to 20/min.

**Fix**: add `isAdminUser` check. One line, same pattern as `handleAdminUsers`.

### F6 — `entries.ts` admin handlers do not write audit_log
**Severity: LOW** — eight handlers mutate state with no audit trail.

| Handler | Mutates | audit_log |
|---|---|---|
| `handleClearBackfill` | clears enrichment flags in bulk | NO |
| `handleRetryFailed` | resets `embedding_status='failed'` rows | NO |
| `handleDistillRejected` | overwrites rejected_summary | NO |
| `handleDistillGmail` | overwrites gmail accepted/rejected_summary | NO |
| `handleAuditPersona` | bulk-rejects facts (also F3) | NO |
| `handleWipePersonaExtracted` | hard-deletes (also F3) | NO |
| `handleBackfillPersona` | creates entries (also F3) | NO |
| `handleRevertPersonaBackfill` | flips entry types (also F3) | NO |

`audit_log` is used in `entries.ts` at lines 349, 486, 547, 606, 1364, 1490, 1631, 1712, 1751 — all for user-facing actions (delete, share, merge, empty-trash). Admin/debug actions skip it.

The risk class is low because every one of these is bounded to the caller's own brain (`requireBrainAccess`). But the launch criterion in `EML/Audits/archive/production-audit-2026-05-07.md` was "audit log coverage for /v1/* and MCP write tools" — these admin actions are write actions and should be in scope.

**Fix**: add a single helper `writeAdminAuditLog(user_id, action, brain_id, count, metadata)` and call it from each of the eight handlers. ~30 lines total.

### F7 — `?resource=admin_user_overview` does not gate on a target=self check
**Severity: LOW** — currently moot because every caller is an admin.

`user-data.ts:3318-3343` accepts ANY UUID and returns that user's full profile + billing IDs (including `lemonsqueezy_subscription_id`, `appstore_original_transaction_id`, `playstore_purchase_token`). The gate is `isAdminUser(user)` — fine in steady state, but if `is_admin` is ever granted to a junior support engineer, they get unrestricted PII access to every user.

**Fix path** (defence-in-depth):

1. Add a `roles` column to `user_profiles` for the admin user — `support` (read-only PII) vs. `support_lead` (mutate tier). Gate `admin_set_tier` on `support_lead`.
2. Add a `support_view` audit_log row for every `admin_user_overview` GET — so PII reads leave a trail. Currently they don't.

Defer to post-launch unless support-team scope grows.

### F8 — `target_user_id !== user.id` is not enforced on `admin_set_tier`
**Severity: LOW** — currently exploitable for self-elevation only via Supabase dashboard.

A current admin can change their own tier via `admin_set_tier` because the handler doesn't check `target !== user.id` (`user-data.ts:3360-3366`). Audit log records it (with `actor_id == user_id`), so the trail is intact, but the workflow lets one admin grant themselves a paid tier for free.

For the single-admin launch this is a non-issue (Christian is the admin and granting himself tiers is a feature for testing the billing surface — that's literally the use case the comment at `user-data.ts:3271-3278` describes). For a support team it's a separation-of-duties hole.

**Fix path**: post-launch, add `if (target === user.id) return 403` and require admins to use the LemonSqueezy portal for their own tier changes — which already bypasses this surface anyway (it's via webhook).

---

## What's solid (recap, terse)

- Admin gate is **server-side** at every PostgREST mutation. Client gate at `SettingsView.tsx:358-360` is informational only.
- `isAdminUser` is **deduplicated** to `_lib/adminAuth.ts:3`. Drift fix from F4 of `production-audit-2026-05-07.md` ✅.
- `is_admin` is **unforgeable from the client** (Supabase enforces `app_metadata` is service-role-write-only).
- `admin_set_tier` is **the textbook shape**: UUID-validated target, allowlisted tier, required reason, idempotency-key, before/after capture, audit row, rate-limited.
- `_lock_billing_columns` migration trigger means even the `TierChanger` component (which does a browser-SDK update) cannot mutate billing fields — defence-in-depth.
- AdminTab does not render for non-admins — `SettingsView.tsx:358-360`. No content leak path even on inspect-element.

---

## Pre-launch checklist

| # | Item | Severity | Effort | Owner |
|---|---|---|---|---|
| 1 | F1 — migrate `handleTriggerTestPush` to `isAdminUser`, drop `ADMIN_EMAIL` env | HIGH | 5 min | dev |
| 2 | F1 — remove `VITE_ADMIN_EMAIL` from Vercel env (leaks email into bundle) | HIGH | 2 min | ops |
| 3 | F2 — write audit_log BEFORE PATCH in `handleAdminSetTier` (status pending → applied) | MEDIUM | 20 min | dev |
| 4 | F3 — add `isAdminUser` gate to `wipe-persona-extracted`, `audit-persona`, `backfill-persona`, `revert-persona-backfill` | MEDIUM | 15 min | dev |
| 5 | F3 — add audit_log row to `handleWipePersonaExtracted` (delete count + brain_id) | MEDIUM | 10 min | dev |
| 6 | F4 — `handleHealth` rateLimit: 30, methods: ["GET"] only | LOW | 2 min | dev |
| 7 | F5 — `handleSentryIssues` add `isAdminUser` gate | LOW | 1 min | dev |
| 8 | F6 — add `writeAdminAuditLog` helper, call from 8 entries.ts admin handlers | LOW | 30 min | dev (post-launch OK) |
| 9 | F7 — add `support_view` audit row to `admin_user_overview` GET | LOW | 10 min | dev (post-launch OK) |
| 10 | F8 — block `target === user.id` on `admin_set_tier` (separation of duties) | LOW | 1 min | dev (post-launch — single-admin) |
| 11 | One-line ruling on F3 architecture: admin-only or self-service? Document in `EML/architecture/auth.md` | MEDIUM | 5 min | architect |

---

## Recommendations (priority)

1. **[HIGH] F1** — `handleTriggerTestPush` is the regression risk that F4 was opened to kill. Migrate to `isAdminUser` before launch. ~5 min.
2. **[HIGH] F1** — confirm `VITE_ADMIN_EMAIL` is not in the production bundle. If it is, the admin email is leaked to every visitor. Audit `dist/assets/*.js` for the email string after the next prod build.
3. **[MEDIUM] F2** — wrap PATCH + audit_log in a Postgres function for tier changes. Removes the crash window between the two. Once F2 is done, the **only** path that flips a paid tier in production has both atomicity and an audit row, end-to-end.
4. **[MEDIUM] F3** — decide and document. If those four handlers are admin-only, add the gate + audit row. If they're self-service, move them out of the AdminTab UI so the surface matches the gate.
5. **[LOW] F5, F4, F6, F7** — bundle into one "tighten admin endpoints" commit before W3 of the launch sprint. ~45 min total.
6. **[POST-LAUNCH] F8** — enforce only when the support team grows beyond one person. Until then, the admin self-test loop is intentional.

---

## Method

- Read `src/components/settings/AdminTab.tsx` end-to-end (1899 lines) — every admin UI surface and every endpoint it calls.
- Read `src/components/settings/AdminCRMSection.tsx` end-to-end (754 lines) — tier-change UX, idempotency-key generation, audit timeline render.
- Read `api/_lib/adminAuth.ts` (5 lines) — confirmed single source of truth.
- Grepped `isAdminUser` across `api/` and `src/` — every callsite mapped to a row in the inventory table.
- Read every admin handler in `api/user-data.ts` and `api/entries.ts` — line refs in inventory column.
- Confirmed audit_log write timing in `handleAdminSetTier` (lines 3415-3448).
- Cross-referenced findings to `EML/Audits/archive/production-audit-2026-05-07.md` (F4, W2 carry-overs), `EML/Audits/archive/billing-audit-2026-05-07.md` (DB-trigger lock confirmation), `EML/Audits/archive/audit-security-2026-05-06.md` (Sentry PII baseline), `EML/architecture/auth.md` (gate model).
- No live exercising of admin endpoints (read-only static audit per scope).

**Audit kicked off by**: user request "evidence-based admin-tab audit (F4 follow-through)" on 2026-05-07.
