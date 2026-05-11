# Notification Bell

End-to-end map of the bell icon in the header — where it lives, what feeds
it, what each card does, how things get cleared. Reflects state after the
May 2026 trim that removed the Gmail ingestion subsystem.

## TL;DR

- One bell, one source of truth (`public.notifications` table). Merge
  detection + cron push paths write rows there. The client polls / refetches
  and renders cards.
- Badge dot lights up when `unreadCount > 0`. Single signal — read state
  flips on open.
- Clearing is per-row (Dismiss button) or wholesale (Clear all).

---

## File map

| File | Role |
|---|---|
| `src/components/NotificationBell.tsx` (280 lines) | Bell + dropdown panel + two card components (`MergeCard`, `AutoMergedCard`) |
| `src/hooks/useNotifications.ts` (116 lines) | Fetches, dismisses, marks-read, accepts merges |
| `src/Everion.tsx` | Mounts `useNotifications`, threads handlers into the header |
| `src/components/DesktopHeader.tsx` | Bell render point on desktop |
| `src/components/MobileHeader.tsx` | Bell render point on mobile |
| `src/MemoryHeader.tsx` | Bell render point on the Memory view's standalone header |
| `api/user-data.ts` (`handleNotifications`, line 2861) | GET / PATCH / DELETE for the table |
| `api/_lib/mergeDetect.ts` (`storeNotification`, line 242) | Insert helper used by merge-detect callsites |
| `api/user-data.ts` (`insertCronNotification`, line 2309) | Insert helper used by the four cron sites |

---

## Data shape

Stored in `public.notifications`. Client receives:

```ts
interface AppNotification {
  id: string;
  type: "merge_suggestion" | "auto_merged" | string;
  title: string;
  body?: string;
  data: Record<string, any>;     // type-specific payload
  read: boolean;
  dismissed: boolean;
  created_at: string;
}
```

The `type` field drives which card component renders. The string union is
documentation-only — the table accepts any string, and the bell falls back
to `AutoMergedCard` for unknown values.

> Legacy: rows with `type = 'gmail_scan'` or `'gmail_review'` may still
> exist in production from before the May 2026 trim. They render via the
> catch-all `AutoMergedCard`. No code path writes new ones.

---

## Where notifications come from

### Live types (something inserts a row)

| `type` | Source | Triggered by | Renders as |
|---|---|---|---|
| `merge_suggestion` | `api/_lib/mergeDetect.ts` | A new entry's similarity to an existing one passes the merge threshold | `MergeCard` |
| `auto_merged` | `api/_lib/mergeDetect.ts` (high-confidence path) | Auto-merged silently — purely informational | `AutoMergedCard` |
| `cron_summary` | `api/user-data.ts` `handleCronDaily` (line 2840) | Daily cron admin summary (gated by `admin_summary_enabled`) | `AutoMergedCard` (catch-all) |
| `daily_prompt` | `api/user-data.ts` `handleCronHourly` (line 2460) | Per-user daily capture prompt at chosen local time | `AutoMergedCard` (catch-all) |
| `weekly_nudge` | `api/user-data.ts` `handleCronHourly` (line 2510) | Weekly nudge at chosen local time | `AutoMergedCard` (catch-all) |
| `expiry_reminder` | `api/user-data.ts` `handleCronHourly` (line 2689) | Entry's `due_date`/`deadline`/`expiry_date`/`event_date` is N days out where N ∈ user's `expiry_lead_days` (default `[90,30,7,1]`). Fans out to all brain members per `brain_notification_prefs`. Gated by `FEATURE_SHARED_BRAIN_REMINDERS=1`. | `AutoMergedCard` (catch-all) — dedicated `ExpiryCard` deferred. See `Specs/shared-brain-notifications.md`. |
| `test_push` | `scripts/test-push.mjs` | Admin → Push diagnostics → Send test push | `AutoMergedCard` (catch-all) |

### Inserter helpers

Two functions write notifications. They differ in import surface — both do
the same `POST /rest/v1/notifications`.

```ts
// api/_lib/mergeDetect.ts — used by merge detect
storeNotification(userId, type, title, body, data)

// api/user-data.ts — used by cron paths that already have SB_URL/SB_KEY
insertCronNotification(userId, type, title, body, data)
```

---

## Client lifecycle

### `useNotifications` hook (`src/hooks/useNotifications.ts`)

State + handlers. Owned by `Everion.tsx`, threaded into the header.

| Trigger | Action |
|---|---|
| Mount (idle-scheduled) | `GET /api/notifications` |
| Window `focus` event | Refetch (suppressed during clear-all DELETE) |
| `visibilitychange` → visible | Refetch |
| `dismiss(id)` | Optimistic remove + `PATCH /api/notifications {id, dismissed:true}` |
| `markRead(id)` | Optimistic flip + `PATCH /api/notifications {id, read:true}` |
| `dismissAll()` | Optimistic empty + `DELETE /api/notifications` (server marks all undismissed → dismissed) |
| `acceptMerge(notif)` | `POST /api/entries?action=merge_into` then dismiss |

`unreadCount` = `notifications.filter(n => !n.read).length`. Drives the dot.

### Bell badge logic (`NotificationBell.tsx:174`)

```ts
const hasSignal = unreadCount > 0;
```

The dot is ember (`var(--ember)`), 8×8, top-right of the bell button. It
appears whenever there's at least one unread notification. `aria-label`:
`"Notifications · N unread"`.

---

## Cards: rendering and buttons

The dropdown panel iterates `notifications.map(n => ...)`. Only one
explicit `type` branch — everything else falls through to the catch-all.

### MergeCard (`type === "merge_suggestion"`)

Displays a side-by-side preview of the new entry vs. the existing one,
the confidence score, and a list of fields that would be added.

Buttons:
- **Dismiss** — calls `onDismiss(n.id)` → `dismiss()` → PATCH
  `dismissed=true`.
- **Merge** — calls `onAcceptMerge(n)` → `acceptMerge(n)` → POSTs
  `/api/entries?action=merge_into` with `{target_id}` from `n.data`, then
  dismisses the notification on success.

### AutoMergedCard (catch-all)

Compact one-line card with title, body, and a single Dismiss button. Used
for every type other than `merge_suggestion` — `auto_merged`,
`cron_summary`, `daily_prompt`, `weekly_nudge`, `expiry_reminder`,
`test_push`, and any legacy types that still have rows in the table
(`gmail_scan`, `gmail_review`).

Single button: **Dismiss** — calls `onDismiss(n.id)`.

---

## How notifications get cleared

Two paths.

### 1. Per-row Dismiss

Every card has a Dismiss action. It calls `onDismiss(n.id)` →
`useNotifications.dismiss(id)` → optimistically removes from state + PATCHes
`dismissed: true`. The row stays in the database with `dismissed=true` for
audit but is filtered out of the GET (which uses `dismissed=eq.false`).

### 2. Clear all

Header button in the dropdown when `notifications.length > 0`. Calls
`onDismissAll()` → `useNotifications.dismissAll()` → optimistic empty +
`DELETE /api/notifications` (which is implemented as a bulk PATCH that
flips every undismissed row to dismissed for that user; supports an
optional `?type=` filter, currently unused). The hook sets a
`dismissingAllRef` guard so focus/visibility refetches between the
optimistic empty and the server response don't flash the cleared list back.

### Mark-read on open

`handleOpen` (`NotificationBell.tsx:157`) marks all unread notifications as
read when the user opens the bell. Clears the dot but doesn't dismiss the
rows — they stay visible until explicitly dismissed.

---

## Server endpoint (`/api/notifications`)

Routed through `api/user-data.ts` via the rewrite at `vercel.json:18`
(`/api/notifications` → `/api/user-data?resource=notifications`).

| Method | Behavior |
|---|---|
| GET | `dismissed=eq.false` by default, `?dismissed=true` to fetch dismissed history. Order by `created_at desc`, limit 50. |
| PATCH | Body `{id, read?, dismissed?}` — flips one row. Either flag may be set independently. |
| DELETE | Body or query — bulk PATCH `dismissed=true` for all undismissed rows belonging to the user. Optional `?type=<x>` filter to clear only one type. |

All three paths require auth and respect RLS — users only see / modify
their own rows.

---

## Recent changes worth knowing

- **Commit `33d3b7d`** (2026-04-29): Cron pushes also write notifications.
  Types `cron_summary`, `daily_prompt`, `weekly_nudge` and diagnostic
  `test_push` land in the bell. Helper `insertCronNotification` extracted in
  `user-data.ts`.
- **2026-05-05**: Shared-brain expiry-reminder fan-out plumbing landed
  (gated). New `expiry_reminder` notification type, `brain_notification_prefs`
  table, `expiry_notification_log.brain_id` column, per-brain mute pills in
  `Settings → Notifications`. Until the gates flip ON
  (`FEATURE_SHARED_BRAIN_REMINDERS=1` server, `VITE_FEATURE_SHARED_BRAIN_REMINDERS=1`
  client), notifications remain user-only. See
  `Specs/shared-brain-notifications.md` and `Ops/feature-flags.md`.
- **May 2026 trim**: Gmail ingestion subsystem removed (`api/_lib/gmailScan.ts`,
  staging inbox, GmailScanCard/GmailReviewCard, useStagedCount hook). Bell
  shrank from 478 lines to 280. Badge no longer reads a staging count.
  Pre-existing `gmail_scan` / `gmail_review` rows still render via the
  catch-all card.

---

## Known limitations / future work

- Bell pulls a max of 50 notifications. There's no infinite scroll. If
  you somehow accumulate > 50, only the newest 50 show.
- No grouping. Twenty `daily_prompt` notifications stack one per row.
  Could collapse "5 daily prompts this week" into a single card if
  capture rate stays low.
- No push-to-bell push (Service Worker → window message). The bell only
  refetches on focus / visibility. If a notification arrives while the
  app is open and visible, the badge updates only on the next refetch
  trigger (typically the user clicking back into the tab).
- Dismiss has no undo. Row is marked dismissed in the DB and disappears
  from the GET. No UI to recover it short of editing Supabase directly.
