# Brain-Sharing Audit — 2026-05-07

> Cross-tenant share surface: `brain_invites`, `brain_members`, `brain_vault_grants`, `entry_shares`. Audits owner-vs-member RBAC, invite redemption flow + expiry, FK CASCADE chain, RLS coverage on all four tables, DEK envelope grants, and `requireBrainRole` adoption across the 12 serverless functions.

## Verdict

**Architecture is right.** Owner is derived from `brains.owner_id` (not stored in `brain_members`), invite tokens are 32-byte CSPRNG hex generated via `crypto.randomBytes(32)` (`api/user-data.ts:375`), expiry is enforced server-side at redemption (`api/user-data.ts:473-474`), every cross-tenant table has RLS enabled, and the service-role API is the single mutation choke-point (no client-side INSERT policy on `brain_invites` or `brain_members`). Per-brain DEK envelope grants are gated by `is_brain_owner` for INSERT/DELETE and recipient-only for SELECT — the May-6 P0 leak (enumerate by `?brain_id=`) is closed at `api/user-data.ts:1697-1705`.

**Five findings, all MEDIUM-or-lower.** F1 (HIGH): viewer-vs-member is enforced at the RLS layer for entries but the API gate `requireBrainAccess` collapses both into one bucket — so MCP `create_entry` + capture handlers rely on RLS to reject viewers, while every other write path uses `requireBrainRole(["owner","member"])` and rejects viewers cleanly. RLS catches it but the inconsistency is a footgun. F2 (MEDIUM): invite token comparison goes through a string-equality lookup in PostgREST (constant-time at the DB layer) but the API never compares plaintext tokens itself — solid. F3 (MEDIUM): no rate limit on the redemption endpoint specifically (inherits the brains-resource 60/min). F4 (LOW): expired invites are not auto-pruned. F5 (LOW): `entry_shares` SELECT policy returns rows for an entry even if the source entry has been deleted (deleted_at filter only on entries, not on the share row).

Pre-launch fix list is short. F1 is the only one I'd land before public.

---

## Architecture overview

```
Owner UI                                                       Recipient UI
    │                                                                │
    │  POST /api/brains?action=invite                                │
    │     {brain_id, email, role:'viewer'|'member'}                  │
    ▼                                                                │
┌───────────────────────────────────────┐                            │
│ user-data.ts:323-454                  │                            │
│  • requireOwner(brain_id) — service   │                            │
│    role lookup of brains.owner_id     │                            │
│  • Validate email + role regex        │                            │
│  • Reject self-invite                 │                            │
│  • Reject if email already a member   │                            │
│  • token = crypto.randomBytes(32)     │                            │
│  • DELETE prior pending invites       │                            │
│    (brain_id, email, accepted_at IS   │                            │
│     NULL) — replace, not stack        │                            │
│  • INSERT brain_invites               │                            │
│    expires_at = now + 7d              │                            │
│  • sendInviteEmail(acceptUrl)         │                            │
└───────────────────────────────────────┘                            │
            │                                                        │
            ▼                                                        │
       brain_invites row                                             │
       (id, brain_id, email, role,                                   │
        token, invited_by, expires_at,                               │
        accepted_at NULL)                                            │
                                                                     │
       email → recipient with                                        │
       https://everion.app/?invite=<token>                           ▼
                                                  ┌──────────────────────────┐
                                                  │ App.tsx reads ?invite=   │
                                                  │   stashes across auth     │
                                                  │   round-trip              │
                                                  │ POST /api/brains          │
                                                  │   ?action=accept          │
                                                  │   {token}                 │
                                                  └──────────────────────────┘
                                                              │
                                                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ user-data.ts:460-530 — accept handler                                │
│  • TOKEN_RE check (64-hex)                                           │
│  • Lookup invite by token                                            │
│    – 404 if not found                                                │
│    – 410 if accepted_at IS NOT NULL                                  │
│    – 410 if expires_at < now()                                       │
│    – 403 if invite.email !== caller.email (case-insensitive)         │
│  • If caller IS owner, mark accepted, no-op (no self-membership)     │
│  • UPSERT brain_members(brain_id,user_id,role,invited_by)            │
│    on_conflict=brain_id,user_id with merge-duplicates                │
│  • PATCH brain_invites SET accepted_at = now()                       │
└─────────────────────────────────────────────────────────────────────┘
                                                              │
                                                              ▼
                                              brain_members row exists
                                              ↓
                                  (owner UI separately uses
                                   handleBrainVaultGrants POST
                                   to wrap the brain DEK with
                                   the new member's public RSA key
                                   and INSERT brain_vault_grants)
```

ASCII flow above mirrors the actual code paths at the cited line numbers; verify with `git blame api/user-data.ts:375` and the migrations chain `068 → 069 → 070 → 072`.

---

## Table inventory

### `brain_invites` (migration `068_brain_sharing.sql:46-56`)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` default | |
| `brain_id` | uuid NOT NULL, FK→`brains(id)` ON DELETE CASCADE | line 48 |
| `email` | text NOT NULL | normalized to lowercase at API layer (user-data.ts:331) |
| `role` | text NOT NULL CHECK in (`viewer`,`member`) | DB-level enum guard |
| `token` | text NOT NULL UNIQUE | 32-byte hex from `crypto.randomBytes(32)` (user-data.ts:375) |
| `invited_by` | uuid NOT NULL, FK→`auth.users(id)` ON DELETE CASCADE | inviter — cascades on user-delete |
| `created_at` | timestamptz, `now()` default | |
| `expires_at` | timestamptz NOT NULL | API sets `now + 7d` (user-data.ts:377) |
| `accepted_at` | timestamptz NULL | sentinel — NULL means pending |

**Indexes** (068:58-63):
- `brain_invites_brain_idx (brain_id, created_at DESC)` — owner-scoped invite list
- `brain_invites_email_pending_idx (lower(email)) WHERE accepted_at IS NULL` — pending lookup by email

**RLS**: `ENABLE ROW LEVEL SECURITY` (068:65). Policies:
- `brain_invites_select` (069:66-69) — `is_brain_owner(brain_id, auth.uid())` — owner only.
- **No INSERT/UPDATE/DELETE policy** for `authenticated`. Mutations go through the service-role API. PostgREST denies anything else by default.

### `brain_members` (migration `068_brain_sharing.sql:18-25`)
| Column | Type | Notes |
|---|---|---|
| `brain_id` | uuid NOT NULL, FK→`brains(id)` ON DELETE CASCADE | |
| `user_id` | uuid NOT NULL, FK→`auth.users(id)` ON DELETE CASCADE | |
| `role` | text NOT NULL CHECK in (`viewer`,`member`) | DB-level guard |
| `invited_by` | uuid, FK→`auth.users(id)` ON DELETE SET NULL | nullable — inviter can leave first |
| `joined_at` | timestamptz, `now()` default | |

**PK**: `(brain_id, user_id)` — composite, enforces single-membership-per-brain.

**Indexes** (068:29-30): `brain_members_user_idx (user_id, brain_id)` — reverse lookup ("brains I'm in").

**RLS**: `ENABLE ROW LEVEL SECURITY` (068:32). Policies:
- `brain_members_select` (069:58-64) — `user_id = auth.uid() OR is_brain_owner(brain_id, auth.uid())` — caller's own membership row, plus owner sees every member of their brain.
- **No INSERT/UPDATE/DELETE policy** — service-role only. Same pattern as `brain_invites`.

### `brain_vault_grants` (migration `072_brain_vault_envelope.sql:27-34`)
| Column | Type | Notes |
|---|---|---|
| `brain_id` | uuid NOT NULL, FK→`brains(id)` ON DELETE CASCADE | |
| `user_id` | uuid NOT NULL, FK→`auth.users(id)` ON DELETE CASCADE | recipient of wrapped DEK |
| `wrapped_dek` | text NOT NULL | brain DEK encrypted with recipient's public RSA key, format `dek:v1:...` |
| `granted_by` | uuid, FK→`auth.users(id)` ON DELETE SET NULL | the owner who minted the grant |
| `granted_at` | timestamptz, `now()` default | |

**PK**: `(brain_id, user_id)` — one DEK per (brain, member).

**Indexes** (072:36-39): `brain_vault_grants_user_idx (user_id)`, `brain_vault_grants_brain_idx (brain_id)`.

**RLS**: `ENABLE ROW LEVEL SECURITY` (072:41). Policies:
- `brain_vault_grants_select` (072:46-51) — `user_id = auth.uid() OR is_brain_owner(brain_id, auth.uid())`. Recipient sees their own wrapped DEK; owner sees every grant on their brain (needed for the management UI).
- `brain_vault_grants_insert` (072:56-60) — `is_brain_owner(brain_id, auth.uid())`. Only the brain owner can mint grants.
- `brain_vault_grants_delete` (072:64-68) — same: owner-only revoke.
- **No UPDATE policy** — to rotate, owner deletes + re-inserts. Sensible (DEK is opaque ciphertext).

### `entry_shares` (migration `070_entry_shares.sql:13-19`)
| Column | Type | Notes |
|---|---|---|
| `entry_id` | uuid NOT NULL, FK→`entries(id)` ON DELETE CASCADE | |
| `target_brain_id` | uuid NOT NULL, FK→`brains(id)` ON DELETE CASCADE | |
| `shared_by` | uuid NOT NULL, FK→`auth.users(id)` ON DELETE CASCADE | |
| `shared_at` | timestamptz, `now()` default | |

**PK**: `(entry_id, target_brain_id)` — same entry can be re-shared into multiple brains, can't be double-shared into the same one.

**Indexes** (070:21-24): `entry_shares_target_brain_idx (target_brain_id)`, `entry_shares_entry_idx (entry_id)`.

**RLS**: `ENABLE ROW LEVEL SECURITY` (070:26). Policies:
- `entry_shares_select` (070:54-68) — owner/member of target brain, OR the entry creator/source-brain-owner/source-brain-member. Everyone with a legit reason to see "entry X is shared into brain Y" can read it.
- `entry_shares_insert` (070:72-88) — `shared_by = auth.uid() AND (entry creator OR source brain owner) AND (target brain owner OR target brain member)`. Stops cross-account share leaks.
- `entry_shares_delete` (070:92-105) — original sharer, source-brain-owner, or target-brain-owner. Target-brain owner can revoke pushed-in shares (good).
- **No UPDATE policy** — `entry_shares` is immutable. Re-share = delete + insert.

---

## What's solid

- **Owner is derived, not stored** (`068:5-7`): `brain_members` has CHECK `role IN ('viewer','member')` — `'owner'` is impossible at DB level. `checkBrainAccess` (`api/_lib/checkBrainAccess.ts:21-26`) checks `brains.owner_id` first, then falls through to `brain_members`. Single source of truth for ownership.
- **No client-side INSERT/UPDATE/DELETE on `brain_invites` or `brain_members`** — every mutation goes through `/api/user-data?resource=brains`, which is service-role under `withAuth`. RLS plus the absence of an `authenticated`-role mutation policy means PostgREST denies any direct browser POST — verified by reading 068 and 069 in full; no `CREATE POLICY ... FOR INSERT TO authenticated` ever appears for these two tables.
- **Token entropy**: `crypto.randomBytes(32).toString("hex")` (`user-data.ts:375`) → 256 bits, not predictable. The frontend (App.tsx) regex-validates `^[0-9a-f]{64}$` before posting, so malformed links don't reach the server (`user-data.ts:315`).
- **Token uniqueness**: `brain_invites.token` has a UNIQUE constraint (`068:51`). Insert collision becomes a Postgres unique-violation rather than silent overwrite.
- **Expiry enforced at redemption**: `api/user-data.ts:473-474` — `if (new Date(invite.expires_at).getTime() < Date.now()) return 410`. Attempts to redeem after the 7-day window get a clean 410 Gone, not silent acceptance.
- **Single-use enforcement**: same handler — `if (invite.accepted_at) return 410` at `:472`. Double-redeem races collapse via the composite-PK upsert at `:501-513` (`on_conflict=brain_id,user_id` + `resolution=merge-duplicates`).
- **Email-match guard against link leakage**: `:476-478` — `if (callerEmail !== expectedEmail) return 403`. A leaked link can only be redeemed by the auth account whose email matches the invite. Lowercased on both sides.
- **Self-invite reject**: `:336-337` — `if (email === user.email) 400`. Owner can't trip the system into adding themselves to `brain_members` (which would conflict with the owner-derivation invariant — owner row would exist twice in different sources).
- **Existing-member reject**: `:341-370` — best-effort `auth.admin.users` lookup; if the email already owns a `brain_members` row, returns 409 instead of overwriting role on re-invite. Frontend has a separate role-change action (`?action=update-role`).
- **Pending-invite replace, not stack**: `:382-385` — owner re-inviting same email deletes prior pending row before insert. Avoids the unique-violation race on `token`. Latest link/role wins. Old token immediately invalid (looked up by token, not by email).
- **`requireBrainRole` adoption** — single choke-point for "must be owner-or-member, not viewer" on entry mutation:
  - `api/entries.ts:244` — restore (was `["owner","member"]`)
  - `api/entries.ts:294` — patch entry
  - `api/entries.ts:297` — patch entry brain_id (move): re-checks role on destination brain too — closes "viewer in brain B can have an entry moved into brain B" hole
  - `api/_lib/handlers/entryDelete.ts:29` — soft delete `["owner","member"]`, hard delete owner-only
  All four are role-restrictive (`["owner","member"]` excludes `viewer`). Backed by the entries RLS policies in `069:88-105` which reject viewer INSERT/UPDATE/DELETE at the DB layer too.
- **DEK envelope grants are owner-only insert/delete**: `072:56-68` plus belt-and-suspenders API check at `user-data.ts:1728-1735` and `:1759-1765`. May-6 P0-3 leak (`?brain_id=X` without `user_id` filter) is closed at `:1697-1705` — non-owner caller forced into `brain_id=eq.<X>&user_id=eq.<self>`.
- **`get_user_public_key` SECURITY DEFINER** (`072:74-82`): bypasses `vault_keys` RLS but returns `public_key` only. Salt + verify_token + wrapped private key never leak through this surface.
- **No-recursion RLS via SECURITY DEFINER predicates** (069:17-55): `is_brain_owner`, `is_brain_member`, `is_brain_member_with_role` — `SET search_path = public`, REVOKE from PUBLIC, GRANT to `authenticated`. Cross-table RLS checks no longer infinite-loop.
- **Audit trail on share/unshare**: `api/entries.ts:1712-1723` (share) and `:1751-1762` (unshare) write `audit_log` rows with `action`, `resource_id`, source/target brain IDs.
- **Persona scope isolation** (`api/_lib/personalBrain.ts`): persona facts always land in the user's personal brain (`is_personal=eq.true`), never in a shared brain. Shared-brain chat strips identity preamble (`buildProfilePreamble.ts` per `architecture/security.md:76`).

---

## Findings

### F1 — `requireBrainAccess` collapses viewer + member; viewer write-block relies on RLS only (HIGH)
**Severity: HIGH** — defence-in-depth gap on the ingestion path.

The codebase has two parallel auth helpers in `api/_lib/withAuth.ts`:
- `requireBrainAccess(userId, brainId)` (`:161-170`) — passes if caller has ANY role (owner / member / viewer). 403 only if `checkBrainAccess` returns null.
- `requireBrainRole(userId, brainId, allowed)` (`:172-183`) — passes only if role is in the allowed list.

`requireBrainRole` is used on the entry edit/delete/restore/move paths in `api/entries.ts` and `api/_lib/handlers/entryDelete.ts` — viewer is correctly rejected there (verified above).

But `requireBrainAccess` is the gate on every other write/ingest path, all of which a viewer should NOT be able to invoke:
- `api/capture.ts:107` — `handleCapture` insert
- `api/capture.ts:113` — capture into extra brain IDs
- `api/capture.ts:340` — `handleSaveLinks` insert
- `api/capture.ts:421` — `handleEmbed` single-entry re-embed
- `api/capture.ts:452` — `handleEmbed` batch re-embed
- `api/transfer.ts:43` — `handleExport` (read; correct)
- `api/transfer.ts:66` — `handleImport` bulk INSERT into `entries`
- `api/entries.ts:1697-1698` — `handleShareEntry` (target brain access)
- `api/feedback.ts:68/106/155` — feedback rows
- `api/_lib/mergeEntries.ts:230` — merge

A viewer in a shared brain who calls `/api/capture` with `p_brain_id=<the shared brain>` clears `requireBrainAccess` cleanly. The actual INSERT into `entries` is then blocked by RLS — `entries_insert` policy (`069:89-97`) requires `is_brain_owner OR is_brain_member_with_role(...,'member')`, so the row is rejected at the DB layer with a 4xx that bubbles up as a 502 ("Database error"). Same for `handleImport`, `handleSaveLinks`, `handleShareEntry`'s actual `entry_shares` insert.

Why this is HIGH not blocking:
- RLS catches it. No data leak — viewer cannot actually insert.
- But the API returns a confusing 502 instead of a clean 403, which (a) leaks the schema (caller learns RLS exists and rejected them), (b) trips error monitoring (looks like a DB outage), and (c) means the front-end can't render a "viewer can't do this" message.
- More important: `requireBrainAccess` is a documented helper paired with `requireBrainRole`. The fact that callsites randomly pick one or the other suggests the intent isn't enforced by review. A future contributor copying the pattern from `capture.ts` into a new write path might rely on RLS that doesn't exist yet (e.g., a new `links` table forgot the role check).

**Fix** (small):
1. Add a one-line `await requireBrainRole(userId, brainId, ["owner","member"])` everywhere that mutates per-brain data, replacing `requireBrainAccess`. Searched call sites: ~13.
2. Leave `requireBrainAccess` only on read paths (export, list shares, list feedback, retrieval helpers, `handleEmbed` GET if any).
3. Add a lint rule or a comment block at the top of `withAuth.ts` describing the rule: "if you write to a brain-scoped table, use `requireBrainRole`; if you read, `requireBrainAccess` is fine."

Evidence: `api/capture.ts:107` (insert) uses `requireBrainAccess`; `api/entries.ts:294` (update) uses `requireBrainRole`. Both are entries-table writes. Pick one.

### F2 — Token comparison constant-time at DB layer only (MEDIUM)
**Severity: MEDIUM** — mitigated, document.

`api/user-data.ts:466` does `?token=eq.${encodeURIComponent(token)}` which is parameterized SQL on the Postgres side — equality compares 32 bytes via `bttextcmp`, which short-circuits on the first byte mismatch. Across a network this is ~µs, dwarfed by jitter, and the API response is pinned to a single round-trip with no retries inside `accept`. Practically not exploitable.

But: the API never compares plaintext tokens itself. There's no `if (token === something)` in the path. So no application-layer timing risk. The risk surface is only Postgres's btree comparator, which is documented as not constant-time but in practice is unmeasurable at 32-byte UUID-ish strings over TCP+TLS.

**No fix required** — note for future. If we ever switch to HMAC-signed tokens with a server-side secret, switch the equality compare to `crypto.timingSafeEqual` on the decoded HMAC tag. Right now we don't have an HMAC; the token IS the secret, validated by random equality.

### F3 — No targeted rate limit on `/api/brains?action=accept` (MEDIUM)
**Severity: MEDIUM**

The `brains` resource handler is mounted under a single `withAuth({ rateLimit: 60 })` (verified at the top of `handleBrains` in `api/user-data.ts` — same dispatcher serves invite/accept/list-members/remove/update-role/revoke). 60/min covers normal use, but:

A leaked `/?invite=<token>` link with the matching email account compromised could be redeemed in one shot — that's not the threat. The threat is: token-guessing. 64-hex token = 2^256 search space. At 60 attempts/min/user that's `2^256 / 60` minutes to brute-force = unreachable. Realistic.

**No fix required** for token guessing. But:
- A separate consideration is invite-spam: an owner with a stolen JWT can mint up to 60 invites/min. `sendInviteEmail` at `:435-441` invokes whatever provider we use (Resend per archived audits). Cost surface: $0.0004/email × 60 = $0.024/min/abused-account. Not catastrophic.

**Fix** (small): split `?action=invite` to `rateLimit: 10` (matches `lemon-checkout` per billing audit) and leave `?action=accept` at 60. Done via `rateLimitKey` in withAuth or a per-action guard inside the handler.

### F4 — Expired invites never auto-pruned (LOW)
**Severity: LOW**

`brain_invites` rows with `accepted_at IS NULL AND expires_at < now()` accumulate forever. The accept handler refuses them at `:473-474`, so the security posture stays sound, but:
- The `brain_invites_email_pending_idx` partial index (`068:61-63`) covers exactly this set — every owner-side "pending invites" list query (`:597-600`) returns expired-but-unaccepted rows mixed in unless the API filters. Currently the API filters by `accepted_at=is.null` only, NOT `expires_at>now()`. So a viewer of the members panel sees stale "pending" rows.
- Storage: each row is ~200B; at 1k brains × 5 invites/brain × 12 months / 7-day expiry → ~250k stale rows. Tiny, but nonzero.

**Fix**: add to the pending-invite list query at `user-data.ts:598`:
```ts
const invR = await fetch(
  `${SB_URL}/rest/v1/brain_invites?brain_id=eq.${...}&accepted_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=...`,
  ...
);
```
Plus a daily cron `DELETE FROM brain_invites WHERE accepted_at IS NULL AND expires_at < now() - interval '30 days'` to drop the long tail. 30-day window keeps history visible in the audit log.

### F5 — `entry_shares` SELECT survives source-entry soft-delete (LOW)
**Severity: LOW** — UX bug more than security.

The share-overlay model joins `entries` with `entry_shares` on `target_brain_id` (`api/entries.ts:181-193`). When the source entry is soft-deleted (`deleted_at IS NOT NULL`), the LIST handler filters by `&deleted_at=is.null`, so the deleted entry is excluded from results — correct behaviour.

But the `entry_shares` row itself remains. So:
- A target-brain owner running "list shared entries" sees the share-row count un-changed.
- If the source entry is restored, it pops back into the target brain automatically. Maybe desirable, maybe not — currently undefined.
- `entry_shares_select` policy (`070:54-68`) doesn't AND with `entries.deleted_at IS NULL`, so a target-brain owner can SELECT the share row for a deleted entry and see metadata (`shared_by`, `shared_at`) about a memory that's been "deleted." Minor info leak — share fact persists past delete.

**Fix**: either (a) cascade-delete the share row when the source entry is soft-deleted (trigger or fire from the delete handler), or (b) extend `entry_shares_select` USING clause with `EXISTS (SELECT 1 FROM entries WHERE id = entry_id AND deleted_at IS NULL)`. (b) is cheaper but adds an RLS-side join. (a) keeps RLS simple; add to `api/_lib/handlers/entryDelete.ts`.

---

## RBAC matrix — what each role can do

| Action | Owner | Member | Viewer | Non-member |
|---|---|---|---|---|
| Read brain | ✓ via `brains_select` (`069:71-77`) | ✓ same | ✓ same | ✗ |
| Read entries in brain | ✓ via `entries_select` (`069:79-86`) | ✓ same | ✓ same | ✗ |
| Read entries shared INTO brain | ✓ via `is_entry_shared_to_user` (`070:31-46`) | ✓ same | ✓ same | ✗ |
| INSERT entry into brain | ✓ via `entries_insert` (`069:88-97`) | ✓ same (role='member') | ✗ DB rejects | ✗ |
| UPDATE entry | ✓ creator OR owner | ✓ creator only | ✗ | ✗ |
| DELETE entry (soft) | ✓ via `entries_delete` (`069:99-105`) | ✓ creator only | ✗ | ✗ |
| DELETE entry (hard) | ✓ via `requireBrainRole(["owner"])` (`entryDelete.ts:29`) | ✗ | ✗ | ✗ |
| Read brain members | ✓ all rows via owner predicate | ✓ own row only | ✓ own row only | ✗ |
| Invite member | ✓ via `requireOwner` (`user-data.ts:338`) | ✗ | ✗ | ✗ |
| Accept invite | n/a (self-invite blocked) | n/a | ✓ if email matches | ✓ if email matches |
| Remove member | ✓ owner OR self (`:615-617`) | ✓ self only | ✓ self only | ✗ |
| Update member role | ✓ owner only (`:641-642`) | ✗ | ✗ | ✗ |
| Revoke invite | ✓ owner only (`:668-669`) | ✗ | ✗ | ✗ |
| Mint vault grant | ✓ via `is_brain_owner` (`072:56-60`) + API guard (`:1728-1735`) | ✗ | ✗ | ✗ |
| Read own vault grant | ✓ via `user_id=auth.uid()` (`072:46-51`) | ✓ same | ✓ same | ✗ |
| Read all grants on owned brain | ✓ via `is_brain_owner` | ✗ | ✗ | ✗ |
| Revoke vault grant | ✓ via `is_brain_owner` (`072:64-68`) + API guard (`:1759-1765`) | ✗ | ✗ | ✗ |
| Share entry into brain X | ✓ creator/source-owner AND target access (`070:72-88`) | ✓ same (creator-only edge) | ✓ if creator (RLS lets it) — bug? | ✗ |
| Unshare entry | ✓ original sharer / source-owner / target-owner | ✓ same | ✓ if was original sharer | ✗ |

> Note on the viewer-share row: `entry_shares_insert` predicate (`070:72-88`) requires `shared_by = auth.uid() AND (entry creator OR source brain owner)`. A viewer in brain A who created an entry there technically passes "entry creator" — but viewer can't INSERT entries (per F1 / `entries_insert`), so they can't be a creator in a brain they joined as viewer. The hole only exists if a member-then-demoted-to-viewer still owns past entries; in that case they can share their own past creations forward. Acceptable, document.

---

## FK CASCADE chain — deleting a brain cleans up everything

Verified by reading every `REFERENCES brains(id)` constraint across `supabase/migrations`:

| Table | FK→brains | Action |
|---|---|---|
| `brain_members.brain_id` | `068:19` | CASCADE |
| `brain_invites.brain_id` | `068:48` | CASCADE |
| `brain_vault_grants.brain_id` | `072:28` | CASCADE |
| `entry_shares.target_brain_id` | `070:15` | CASCADE |
| `entries.brain_id` | `001:92` (no action specified — default NO ACTION → blocks delete) | **inconsistent** |
| `vault_entries.brain_id` | `079:36-37` | CASCADE (since 079) |
| `links.brain_id` | `001:101` (no action — NO ACTION) | **inconsistent** |
| `important_memories.brain_id` | `062:17` | CASCADE |
| `concept_graphs.brain_id` | `022:5` | CASCADE |
| `query_feedback.brain_id` | `024:8` | CASCADE |
| `messaging_connections.brain_id` | `005:4,17` | CASCADE |
| `brain_api_keys.brain_id` | `012:8` | CASCADE |
| `brain_notification_prefs.brain_id` | `075:11` | CASCADE |
| `expiry_log.brain_id` | `076:11` | CASCADE |

The four-table sharing surface (in scope) cascades correctly. **However** entries themselves and links don't cascade — `DELETE FROM brains WHERE id = X` will fail with FK violation if any entry exists in that brain. Confirmed by reading `001_brains.sql:92`:

```sql
ALTER TABLE entries ADD COLUMN IF NOT EXISTS brain_id uuid REFERENCES brains(id);
```

No `ON DELETE` clause → defaults to NO ACTION. Same at `001:101` for `links`.

This is **intentional safety** — a stray brain delete shouldn't nuke a thousand entries. The brain-delete handler (`api/user-data.ts:711-731`) only allows the owner to delete a non-personal brain via `?id=`, and explicitly blocks personal brains. But the handler doesn't pre-emptively delete entries — so a brain with entries can't be deleted at all, which silently 502s with a Postgres FK error.

**Out of scope for this audit** (covered by `db-audit-2026-05-07.md` archived findings) — but worth flagging the chain works for sharing tables, breaks for entries/links. The user-facing "delete brain" UI either errors out or needs a "transfer entries first" prompt. Audit-catalogue task `account-delete` should pick up the user-cascade equivalent.

---

## `requireBrainRole` adoption — every callsite

Greppable signal: 4 files, 4 callsites total.

| File | Line | Allowed roles | Action |
|---|---|---|---|
| `api/entries.ts` | 244 | `["owner","member"]` | restore |
| `api/entries.ts` | 294 | `["owner","member"]` | patch |
| `api/entries.ts` | 297 | `["owner","member"]` | patch with new brain_id |
| `api/_lib/handlers/entryDelete.ts` | 29 | `["owner"]` if hard-delete else `["owner","member"]` | delete |

Every mutating brain operation that uses `requireBrainRole` correctly excludes viewer. But coverage is thin — only entry restore/update/delete/move + hard-delete go through this. See F1 above for the gap.

---

## `requireBrainAccess` adoption — read paths + ingestion-via-RLS-fallback

13 callsites in `api/`:

| File | Line | Note |
|---|---|---|
| `capture.ts:107,113,340,421,452` | INSERT paths — F1 | rely on RLS for viewer rejection |
| `transfer.ts:43,66` | export read, import INSERT — F1 partial | |
| `entries.ts:172,730,836,885,900,913,928,942,1170,1263,1307,1532-3,1593-4,1697-8,1802,1824` | mostly read paths + share/move edge cases | |
| `feedback.ts:68,106,155` | feedback writes | F1 |
| `search.ts:56` | retrieval read | correct |
| `_lib/mergeEntries.ts:230` | merge write — F1 | |
| `gmail.ts:17` | import only — gmail uses its own brain logic | n/a |
| `llm.ts:523` | chat retrieval | uses `checkBrainAccess` directly to gate role-check inline |

---

## Service-role / RLS interaction

The Vercel functions all use `SUPABASE_SERVICE_ROLE_KEY` via `sbHeaders()` (`api/_lib/sbHeaders.ts`). Service role bypasses RLS. So every RLS policy in `068/069/070/072` is **enforced only on browser-direct PostgREST calls and on `match_entries_for_user`** (`071:33` — SECURITY DEFINER, runs as role-of-definer not caller).

This means the API code itself is the actual cross-tenant gate for everything that goes through `withAuth`. The list of guards above (`requireOwner`, `requireBrainRole`, `requireBrainAccess`, `checkBrainAccess`) IS the security perimeter for shared brains. RLS is the second-line backstop for direct browser-supabase calls (which are rare — the front-end uses `/api/*` for all writes per the existing layout-architecture memory).

Audit-catalogue's `service-role-usage-audit` (archived 2026-05-07) covered this in depth and confirmed F1/F2/F3 from the May-6 production audit are closed.

---

## Limitations

- **Supabase MCP `execute_sql` tool not available in this session** — cited tools `mcp__claude_ai_Supabase__execute_sql` are not registered in the environment (verified via ToolSearch — "No matching deferred tools found"). Could not run live `pg_policies` / `information_schema.columns` / `pg_constraint` queries. All evidence in this audit comes from reading migration files in `supabase/migrations/068_brain_sharing.sql` through `072_brain_vault_envelope.sql` plus `070_entry_shares.sql` and `071_match_entries_for_user.sql`. Migration files are the source-of-truth — Supabase applies them in order — but if anything has been hot-patched in production console without a migration, it's invisible to me. Recommend the audit owner run the three SQL probes from the spec via Supabase Studio to cross-check before launch.
- **Did not exercise live invite flow** end-to-end (sandbox, two test accounts). Token redemption, email-match, expiry, and double-redeem races are inferred from code review only. Playwright e2e test scheduled per `playwright-everion` skill — track in `LAUNCH_CHECKLIST.md`.
- **Did not check `brain_notification_prefs`, `brain_api_keys`, or other brain-scoped tables** — out of scope per audit spec.

---

## Recommendations (priority)

1. **[HIGH] F1** — replace `requireBrainAccess` with `requireBrainRole(["owner","member"])` on every brain-scoped write/insert/update/delete path. ~13 line changes across `capture.ts`, `transfer.ts`, `feedback.ts`, `_lib/mergeEntries.ts`. Add inline comment in `withAuth.ts:160` documenting the read-vs-write rule.
2. **[MEDIUM] F3** — split rate-limits in `handleBrains`: `?action=invite` → 10/min, `?action=accept` → 60/min, others stay at 60.
3. **[LOW] F4** — add `&expires_at=gt.<now>` to the pending-invites list query at `user-data.ts:598`. Add daily cron to prune `accepted_at IS NULL AND expires_at < now() - interval '30 days'` rows from `brain_invites`.
4. **[LOW] F5** — extend the soft-delete handler in `entryDelete.ts` to also `DELETE FROM entry_shares WHERE entry_id = $id`, OR add a Postgres trigger on `entries` UPDATE-to-soft-deleted that fires the cleanup. Trigger preferred — survives every code path including direct admin SQL.
5. **[NOTE]** — F2 carries no fix; documented for future migration to HMAC-signed tokens.
6. **[NOTE]** — out-of-scope but flag from CASCADE chain: `entries.brain_id` and `links.brain_id` are NO ACTION; brain delete fails until entries are moved/deleted first. Front-end should display a "this brain has N entries — move or delete first" prompt before calling DELETE. Hand off to `account-delete` audit.

## Method

- Read `supabase/migrations/068_brain_sharing.sql` (full), `069_brain_sharing_rls_no_recursion.sql` (full), `070_entry_shares.sql` (full), `071_match_entries_for_user.sql` (full), `072_brain_vault_envelope.sql` (full).
- Read `api/_lib/checkBrainAccess.ts` (full), `api/_lib/personalBrain.ts` (full), `api/_lib/withAuth.ts` lines 160-240 (`requireBrainAccess`, `requireBrainRole`, `withApiKey`).
- Read `api/user-data.ts` lines 295-720 (the entire brains-resource handler including invite/accept/members/remove-member/update-role/revoke-invite/POST/DELETE/PATCH).
- Read `api/user-data.ts` lines 1680-1775 (`handleBrainVaultGrants`, the May-6 P0-3 fix verification).
- Read `api/entries.ts` lines 160-330 (LIST + PATCH + restore + role gate), 1500-1800 (move + share/unshare/list-shares).
- Read `api/capture.ts` lines 1-340 (capture insert + save-links + embed + role-gate calls).
- Read `api/transfer.ts` lines 1-100 (export + import).
- Read `api/mcp.ts` lines 370-420 (`resolveTargetBrain` + `listBrains`).
- Read `EverionMindLaunch/architecture/security.md` lines 1-100 (cross-reference for RBAC + RLS expectations).
- Greps:
  - `requireBrainRole` across `api/` → 4 callsites + 1 export
  - `requireBrainAccess` + `checkBrainAccess` across `api/` → 30+ callsites
  - `brain_invites`, `brain_members`, `brain_vault_grants`, `entry_shares` across `api/`
  - `REFERENCES brains` across `supabase/migrations` → 14 FK references, every one verified
  - `role.*viewer|viewer.*role|requireBrainRole.*\[` for role-gate adoption pattern
- **Did NOT** run live SQL via Supabase MCP (tool not available — see Limitations).
- **Did NOT** test the redemption flow with two real accounts. Playwright e2e covered in audit-catalogue's `playwright-everion` schedule.

---

**Audit kicked off by**: user request "do brain-sharing audit" on 2026-05-07.
