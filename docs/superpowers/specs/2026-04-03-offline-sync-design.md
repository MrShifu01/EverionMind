# Offline Sync Design

**Date:** 2026-04-03  
**Feature:** Offline write queue with automatic sync on reconnect  
**Scope:** Creates, updates, and deletes for brain entries

---

## Goal

When OpenBrain is offline (e.g. phone with no signal), mutations (create/update/delete) should be queued locally and automatically synced to Supabase when connectivity returns. The app should remain fully usable offline; the user sees a subtle badge indicating how many operations are pending.

---

## Approach

IndexedDB queue + `window.online` event listener (Option A).

**Why:** Works on all browsers including iOS Safari. Background Sync API (the service worker alternative) is unsupported on iOS. Since the user must have the app open to create entries, `window.online` is sufficient — no background service worker drain needed.

---

## Architecture

### New files

**`src/lib/offlineQueue.js`**  
Thin IndexedDB wrapper. Exposes:
- `enqueue(op)` — writes `{ id, url, method, body, created_at }` to the store
- `getAll()` — returns all queued ops ordered by `created_at` ascending (oldest first)
- `remove(id)` — deletes a single op by ID
- `clear()` — wipes the entire queue

Falls back to `localStorage` if IndexedDB quota is exceeded, and logs a console warning.

**`src/hooks/useOfflineSync.js`**  
React hook. Responsibilities:
- Tracks `isOnline` (initialised from `navigator.onLine`)
- Listens to `window.online` / `window.offline` events
- On `online`: drains the queue via `authFetch`, oldest-first
- Uses a `draining` ref flag to prevent concurrent drain runs
- Exposes `{ isOnline, pendingCount }`

### Modified files

**`src/OpenBrain.jsx`**  
- `doSave`, `handleUpdate`, `handleDelete` each check `isOnline` before calling the API
- If offline: call `enqueue(op)` and update local state optimistically
- Import and use `useOfflineSync` hook; render pending badge in header

---

## Data Flow

### Offline write
1. User saves/edits/deletes
2. App checks `isOnline`
3. Op written to IndexedDB; local state updated immediately
4. Badge shows "X pending"

### Reconnect & drain
1. `window.online` fires
2. `useOfflineSync` checks `draining` flag — if already draining, skip
3. Sets `draining = true`, fetches all ops from IndexedDB (oldest first)
4. For each op:
   - Call `authFetch(url, { method, body })`
   - **201/200** → remove from queue, decrement badge
   - **404** → silently remove (entity already gone)
   - **Other failure** → leave in queue, continue to next op
5. Sets `draining = false`
6. Badge disappears when queue is empty

### Conflict resolution
Last write wins. Ops replay in creation order. No merge logic.

---

## Edge Cases

| Case | Handling |
|------|----------|
| **Concurrent drain** | `draining` ref flag prevents multiple simultaneous drains if connection flaps |
| **Image upload offline** | `/api/capture` with binary attachment cannot be serialised to IndexedDB — show "Image uploads require a connection" and block the save |
| **Storage quota exceeded** | `enqueue()` catches quota errors, falls back to `localStorage`, shows console warning |
| **Stale ops (>7 days)** | Ops older than 7 days are dropped at drain time with a console warning — prevents replaying ancient conflicting mutations |
| **Pending-create then edit/delete** | Edit/delete queues behind the create; drain order (oldest-first) ensures create lands first |
| **Auth token expiry during drain** | `authFetch` injects current token at call time; if 401, op stays in queue and retries on next `online` event after token refresh |
| **Supabase down (online but server error)** | 5xx responses leave op in queue; retries on next `online` event or page reload |
| **App closed before sync** | IndexedDB persists across sessions — queue survives app close and phone restart; drains on next app open if online |
| **Temporary ID on creates** | New entry gets `Date.now()` ID locally; on sync the server returns the real ID, which replaces the temporary one in local state |

---

## UI

- **Pending badge:** Small inline indicator in the header (e.g. `"2 pending"`) rendered only when `pendingCount > 0`
- **Offline image warning:** Inline message near the image attach button when `!isOnline`
- No banners, toasts, or modals — keeps the UI clean

---

## Out of Scope

- Todos (`TodoView`) — already `localStorage`-only, no change needed
- Suggestions / answered questions — `localStorage`-only, no change needed
- Brain create/delete (`useBrain.js`) — low frequency, not worth queueing
- Conflict UI (merge dialogs) — last-write-wins is sufficient for a single-user personal app
