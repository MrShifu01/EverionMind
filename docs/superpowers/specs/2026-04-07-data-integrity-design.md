# Data Integrity — Design Spec
**Date:** 2026-04-07

## Scope
Soft delete + Trash view, offline sync failure notifications.

---

## Soft Delete + Trash

### Problem
Hard deletes are unrecoverable. No trash, no recovery window.

### Migration 016

```sql
ALTER TABLE entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS entries_deleted_at_idx ON entries(deleted_at) WHERE deleted_at IS NOT NULL;
```

### API Changes

**`api/entries.ts` GET:** Add `&deleted_at=is.null` to default query. Add `?trash=true` param → query `deleted_at=not.is.null&deleted_at=gt.<30-days-ago>`.

**`api/entries.ts` DELETE:** Change from hard DELETE to PATCH `{ deleted_at: new Date().toISOString() }`. Add `?permanent=true` param for final purge from Trash view (owner only).

**`api/entries.ts` PATCH (new `action=restore`):** Set `deleted_at = NULL`.

### Client: TrashView

New `src/views/TrashView.tsx`:
- Lists entries where deleted_at is set, sorted by deleted_at desc
- Each entry: title, type icon, "Deleted X days ago" label
- Per-entry: "Restore" button, "Delete Permanently" button
- Bulk: "Restore All", "Empty Trash"
- Auto-purge note: "Entries deleted more than 30 days ago are gone forever"

### Navigation

BottomNav gains a Trash tab (bin icon) — or accessible from Settings "Data & Storage" section. Either works; Settings section preferred to avoid cluttering nav.

### Client `deleteEntry` flow

Currently: `authFetch(DELETE /api/entries/:id)` → hard delete.
After: same call, server soft-deletes. Entry removed from local state immediately (still feels instant). Undo toast: "Undo" within 5s calls `PATCH ?action=restore`.

---

## Offline Sync Failure Notifications

### Problem
`useOfflineSync` permanently drops ops after 3 retries with only a `console.error`. User has no idea data was lost.

### Solution

**`useOfflineSync`:** Instead of `remove(op.id)` on max retries, move op to a "failed" state:
- Add `failed: boolean` field to OfflineOp (or store separately in IndexedDB `failed_ops` store)
- Return `failedOps: OfflineOp[]` from the hook (alongside existing `{isOnline, pendingCount}`)
- Failed ops retain their original `body` so content is recoverable

**`src/App.tsx` or `src/OpenBrain.tsx`:** When `failedOps.length > 0`, show a persistent `FailedSyncBanner`:

```tsx
<FailedSyncBanner
  count={failedOps.length}
  onCopyAll={() => /* copy failed op bodies as JSON */}
  onDismiss={() => clearFailedOps()}
/>
```

Banner: red/orange persistent strip at top. "X items failed to sync. [Copy data] [Dismiss]". Copy writes JSON of all failed ops to clipboard so user can recover manually.

**`src/lib/offlineQueue.ts`:** Add `putFailed(op)`, `getAllFailed()`, `clearFailed()` using a separate `failed_ops` store in IndexedDB.

---

## Tests

- `tests/api/entries-soft-delete.test.ts` — DELETE sets deleted_at, GET excludes soft-deleted, trash=true returns them, restore clears deleted_at
- `tests/lib/offlineQueue-failed.test.ts` — putFailed/getAllFailed/clearFailed work correctly
- `tests/hooks/useOfflineSync-failures.test.ts` — max retry moves op to failed store, failedOps returned in hook result
