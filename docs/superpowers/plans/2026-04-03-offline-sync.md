# Offline Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Queue creates, updates, and deletes in IndexedDB when offline and drain them automatically when the device reconnects.

**Architecture:** A thin `offlineQueue.js` module owns IndexedDB reads/writes. A `useOfflineSync` React hook owns online/offline state and drain logic. `OpenBrain` and `QuickCapture` check `isOnline` before calling the API — if offline, they enqueue the op and update local state optimistically.

**Tech Stack:** Vitest, jsdom, fake-indexeddb, @testing-library/react, IndexedDB (native browser API)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/offlineQueue.js` | IndexedDB CRUD: `enqueue`, `getAll`, `remove`, `clear` |
| Create | `src/hooks/useOfflineSync.js` | `isOnline`, `pendingCount`, drain-on-reconnect |
| Create | `src/test-setup.js` | Vitest global setup (`@testing-library/jest-dom`) |
| Create | `tests/lib/offlineQueue.test.js` | Queue unit tests |
| Create | `tests/hooks/useOfflineSync.test.js` | Hook unit tests |
| Modify | `vite.config.js` | Add `test` block for Vitest |
| Modify | `package.json` | Add test script + dev dependencies |
| Modify | `src/OpenBrain.jsx` | Wire hook; wrap `handleUpdate`, `commitPendingDelete`, `handleDelete` timer; add badge; pass `isOnline`/`refreshCount` to `QuickCapture` |
| Modify | `src/OpenBrain.jsx` (`QuickCapture`) | Accept `isOnline`/`refreshCount` props; enqueue in `doSave`; block image upload offline |

---

## Task 1: Install Vitest and configure

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `src/test-setup.js`

- [ ] **Step 1: Install dev dependencies**

```bash
npm install --save-dev vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb
```

Expected: packages added to `node_modules`, `package.json` devDependencies updated.

- [ ] **Step 2: Add test script to `package.json`**

In `package.json`, add `"test": "vitest run"` and `"test:watch": "vitest"` to the `scripts` block:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Add test config to `vite.config.js`**

Full updated `vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'OpenBrain',
        short_name: 'OpenBrain',
        description: "Chris's personal memory & knowledge OS",
        theme_color: '#0f0f23',
        background_color: '#0f0f23',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
})
```

- [ ] **Step 4: Create `src/test-setup.js`**

```javascript
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Verify Vitest runs**

```bash
npm test
```

Expected: `No test files found` or exit 0 (no failures). Not `Error: Cannot find module`.

- [ ] **Step 6: Commit**

```bash
git add package.json vite.config.js src/test-setup.js package-lock.json
git commit -m "chore: add Vitest + testing-library setup"
```

---

## Task 2: Create `src/lib/offlineQueue.js` (TDD)

**Files:**
- Create: `src/lib/offlineQueue.js`
- Create: `tests/lib/offlineQueue.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/offlineQueue.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { enqueue, getAll, remove, clear } from '../../src/lib/offlineQueue';

describe('offlineQueue', () => {
  beforeEach(async () => {
    await clear();
  });

  it('enqueue adds an op and getAll returns it', async () => {
    const op = {
      id: 'test-1',
      url: '/api/capture',
      method: 'POST',
      body: '{}',
      created_at: new Date().toISOString(),
    };
    await enqueue(op);
    const all = await getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('test-1');
  });

  it('getAll returns ops sorted oldest-first', async () => {
    await enqueue({ id: 'recent', url: '/api/capture', method: 'POST', body: '{}', created_at: '2026-01-02T00:00:00.000Z' });
    await enqueue({ id: 'old',    url: '/api/capture', method: 'POST', body: '{}', created_at: '2026-01-01T00:00:00.000Z' });
    const all = await getAll();
    expect(all[0].id).toBe('old');
    expect(all[1].id).toBe('recent');
  });

  it('remove deletes only the specified op', async () => {
    await enqueue({ id: 'keep',      url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    await enqueue({ id: 'delete-me', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    await remove('delete-me');
    const all = await getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('keep');
  });

  it('clear empties the queue', async () => {
    await enqueue({ id: 'x', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    await clear();
    const all = await getAll();
    expect(all).toHaveLength(0);
  });

  it('enqueue is idempotent for the same id (put semantics)', async () => {
    const op = { id: 'dup', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() };
    await enqueue(op);
    await enqueue(op);
    const all = await getAll();
    expect(all).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test
```

Expected: `Cannot find module '../../src/lib/offlineQueue'`

- [ ] **Step 3: Implement `src/lib/offlineQueue.js`**

```javascript
const DB_NAME = 'openbrain-offline';
const STORE = 'queue';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(op) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(op);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    if (e?.name === 'QuotaExceededError') {
      console.warn('[offlineQueue] IndexedDB quota exceeded, falling back to localStorage');
      try {
        const existing = JSON.parse(localStorage.getItem('openbrain_queue') || '[]');
        const idx = existing.findIndex(o => o.id === op.id);
        if (idx >= 0) existing[idx] = op; else existing.push(op);
        localStorage.setItem('openbrain_queue', JSON.stringify(existing));
      } catch {}
    } else {
      throw e;
    }
  }
}

export async function getAll() {
  try {
    const db = await openDB();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } catch {
    try {
      const items = JSON.parse(localStorage.getItem('openbrain_queue') || '[]');
      return items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } catch {
      return [];
    }
  }
}

export async function remove(id) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      const items = JSON.parse(localStorage.getItem('openbrain_queue') || '[]');
      localStorage.setItem('openbrain_queue', JSON.stringify(items.filter(o => o.id !== id)));
    } catch {}
  }
}

export async function clear() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.removeItem('openbrain_queue');
  }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/offlineQueue.js tests/lib/offlineQueue.test.js
git commit -m "feat: offline queue (IndexedDB) with tests"
```

---

## Task 3: Create `src/hooks/useOfflineSync.js` (TDD)

**Files:**
- Create: `src/hooks/useOfflineSync.js`
- Create: `tests/hooks/useOfflineSync.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/hooks/useOfflineSync.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { enqueue, clear } from '../../src/lib/offlineQueue';

vi.mock('../../src/lib/authFetch', () => ({
  authFetch: vi.fn(),
}));
import { authFetch } from '../../src/lib/authFetch';
import { useOfflineSync } from '../../src/hooks/useOfflineSync';

describe('useOfflineSync', () => {
  beforeEach(async () => {
    await clear();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  it('isOnline reflects navigator.onLine on mount', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useOfflineSync());
    expect(result.current.isOnline).toBe(false);
  });

  it('isOnline becomes false when offline event fires', async () => {
    const { result } = renderHook(() => useOfflineSync());
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current.isOnline).toBe(false);
  });

  it('isOnline becomes true when online event fires', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    authFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const { result } = renderHook(() => useOfflineSync());
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(result.current.isOnline).toBe(true);
  });

  it('pendingCount reflects queue length on mount', async () => {
    await enqueue({ id: 'a', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    await enqueue({ id: 'b', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.pendingCount).toBe(2));
  });

  it('drains queue on online event — successful ops are removed', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await enqueue({ id: 'op-1', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(authFetch).toHaveBeenCalledWith('/api/capture', expect.objectContaining({ method: 'POST' }));
  });

  it('404 responses are treated as success and removed from queue', async () => {
    authFetch.mockResolvedValue({ ok: false, status: 404 });
    await enqueue({ id: 'op-2', url: '/api/delete-entry', method: 'DELETE', body: '{}', created_at: new Date().toISOString() });
    const { result } = renderHook(() => useOfflineSync());

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
  });

  it('5xx errors leave op in queue', async () => {
    authFetch.mockResolvedValue({ ok: false, status: 500 });
    await enqueue({ id: 'op-3', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    const { result } = renderHook(() => useOfflineSync());

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(authFetch).toHaveBeenCalled());
    expect(result.current.pendingCount).toBe(1);
  });

  it('drops ops older than 7 days without calling authFetch', async () => {
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await enqueue({ id: 'stale', url: '/api/capture', method: 'POST', body: '{}', created_at: stale });
    const { result } = renderHook(() => useOfflineSync());

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(authFetch).not.toHaveBeenCalled();
  });

  it('calls onEntryIdUpdate when a create op returns a new id', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: 'real-id' }) });
    await enqueue({ id: 'op-4', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString(), tempId: 'temp-123' });
    const onEntryIdUpdate = vi.fn();
    renderHook(() => useOfflineSync({ onEntryIdUpdate }));

    await act(async () => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(onEntryIdUpdate).toHaveBeenCalledWith('temp-123', 'real-id'));
  });

  it('does not run concurrent drains', async () => {
    let resolveFirst;
    authFetch.mockImplementation(() => new Promise(res => { resolveFirst = () => res({ ok: true, status: 200, json: () => Promise.resolve({}) }); }));
    await enqueue({ id: 'op-5', url: '/api/capture', method: 'POST', body: '{}', created_at: new Date().toISOString() });
    const { result } = renderHook(() => useOfflineSync());

    act(() => { window.dispatchEvent(new Event('online')); });
    act(() => { window.dispatchEvent(new Event('online')); }); // second fire while draining

    await act(async () => { resolveFirst?.(); });
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(authFetch).toHaveBeenCalledTimes(1); // only once despite two online events
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test
```

Expected: `Cannot find module '../../src/hooks/useOfflineSync'`

- [ ] **Step 3: Implement `src/hooks/useOfflineSync.js`**

```javascript
import { useState, useEffect, useRef, useCallback } from 'react';
import { getAll, remove } from '../lib/offlineQueue';
import { authFetch } from '../lib/authFetch';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function useOfflineSync({ onEntryIdUpdate } = {}) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const drainingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const ops = await getAll();
    setPendingCount(ops.length);
  }, []);

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const ops = await getAll();
      for (const op of ops) {
        if (Date.now() - new Date(op.created_at).getTime() > STALE_MS) {
          console.warn('[offlineSync] Dropping stale op', op.id);
          await remove(op.id);
          setPendingCount(c => Math.max(0, c - 1));
          continue;
        }
        try {
          const res = await authFetch(op.url, {
            method: op.method,
            headers: { 'Content-Type': 'application/json' },
            body: op.body,
          });
          if (res.ok || res.status === 404) {
            if (res.ok && op.method === 'POST' && op.tempId) {
              const data = await res.json().catch(() => null);
              if (data?.id) onEntryIdUpdate?.(op.tempId, data.id);
            }
            await remove(op.id);
            setPendingCount(c => Math.max(0, c - 1));
          }
          // non-404 failure: leave in queue, continue to next op
        } catch {
          // network error: leave in queue
        }
      }
    } finally {
      drainingRef.current = false;
    }
  }, [onEntryIdUpdate]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); drain(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [drain]);

  return { isOnline, pendingCount, sync: drain, refreshCount };
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test
```

Expected: `14 passed` (5 from Task 2 + 9 from Task 3)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOfflineSync.js tests/hooks/useOfflineSync.test.js
git commit -m "feat: useOfflineSync hook with drain-on-reconnect + tests"
```

---

## Task 4: Wire `useOfflineSync` into `OpenBrain` main component

**Files:**
- Modify: `src/OpenBrain.jsx` (the `OpenBrain` function, ~line 539)

- [ ] **Step 1: Add imports at the top of `OpenBrain.jsx`**

After the existing import block (line 7, after `import { useBrain } ...`), add:

```javascript
import { useOfflineSync } from "./hooks/useOfflineSync";
import { enqueue } from "./lib/offlineQueue";
```

- [ ] **Step 2: Add `useOfflineSync` hook inside `OpenBrain` function**

After the `useBrain` call (~line 553), add:

```javascript
  const { isOnline, pendingCount, refreshCount } = useOfflineSync({
    onEntryIdUpdate: useCallback((tempId, realId) => {
      setEntries(prev => prev.map(e => e.id === tempId ? { ...e, id: realId } : e));
    }, []),
  });

  // Keep a ref so timer callbacks can read current isOnline without stale closure
  const isOnlineRef = useRef(isOnline);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
```

- [ ] **Step 3: Replace `commitPendingDelete` with offline-aware version**

Find (around line 636):
```javascript
  const commitPendingDelete = useCallback(() => {
    if (!pendingDeleteRef.current) return;
    const { id } = pendingDeleteRef.current;
    authFetch("/api/delete-entry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
    pendingDeleteRef.current = null;
  }, []);
```

Replace with:
```javascript
  const commitPendingDelete = useCallback(() => {
    if (!pendingDeleteRef.current) return;
    const { id } = pendingDeleteRef.current;
    if (isOnlineRef.current) {
      authFetch("/api/delete-entry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
    } else {
      enqueue({ id: crypto.randomUUID(), url: "/api/delete-entry", method: "DELETE", body: JSON.stringify({ id }), created_at: new Date().toISOString() }).then(refreshCount);
    }
    pendingDeleteRef.current = null;
  }, [refreshCount]);
```

- [ ] **Step 4: Replace the delete timer callback inside `handleDelete` with offline-aware version**

Find inside `handleDelete` (around line 649):
```javascript
    const timer = setTimeout(() => {
      authFetch("/api/delete-entry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
      pendingDeleteRef.current = null;
      setLastAction(null);
    }, 5000);
```

Replace with:
```javascript
    const timer = setTimeout(() => {
      if (isOnlineRef.current) {
        authFetch("/api/delete-entry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
      } else {
        enqueue({ id: crypto.randomUUID(), url: "/api/delete-entry", method: "DELETE", body: JSON.stringify({ id }), created_at: new Date().toISOString() }).then(refreshCount);
      }
      pendingDeleteRef.current = null;
      setLastAction(null);
    }, 5000);
```

- [ ] **Step 5: Replace `handleUpdate` with offline-aware version**

Find (around line 658):
```javascript
  const handleUpdate = useCallback(async (id, changes) => {
    const previous = entries.find(e => e.id === id);
    try {
      const res = await authFetch("/api/update-entry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data?.message || data?.error) ?? `HTTP ${res.status}`);
      if (Array.isArray(data) && data.length === 0) throw new Error(`No row matched id=${id}`);
    } catch (e) { alert(`Save failed: ${e.message}`); return; }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
    setSelected(prev => prev?.id === id ? { ...prev, ...changes } : prev);
    if (previous) setLastAction({ type: "update", id, previous: { title: previous.title, content: previous.content, type: previous.type, tags: previous.tags, metadata: previous.metadata } });
  }, [entries]);
```

Replace with:
```javascript
  const handleUpdate = useCallback(async (id, changes) => {
    const previous = entries.find(e => e.id === id);
    if (!isOnline) {
      await enqueue({ id: crypto.randomUUID(), url: "/api/update-entry", method: "PATCH", body: JSON.stringify({ id, ...changes }), created_at: new Date().toISOString() });
      refreshCount();
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
      setSelected(prev => prev?.id === id ? { ...prev, ...changes } : prev);
      if (previous) setLastAction({ type: "update", id, previous: { title: previous.title, content: previous.content, type: previous.type, tags: previous.tags, metadata: previous.metadata } });
      return;
    }
    try {
      const res = await authFetch("/api/update-entry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data?.message || data?.error) ?? `HTTP ${res.status}`);
      if (Array.isArray(data) && data.length === 0) throw new Error(`No row matched id=${id}`);
    } catch (e) { alert(`Save failed: ${e.message}`); return; }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
    setSelected(prev => prev?.id === id ? { ...prev, ...changes } : prev);
    if (previous) setLastAction({ type: "update", id, previous: { title: previous.title, content: previous.content, type: previous.type, tags: previous.tags, metadata: previous.metadata } });
  }, [entries, isOnline, refreshCount]);
```

- [ ] **Step 6: Pass `isOnline` and `refreshCount` to `QuickCapture`**

Find (around line 771):
```jsx
      <QuickCapture apiKey={apiKey} sbKey={sbKey} entries={entries} setEntries={setEntries} links={links} addLinks={addLinks} onCreated={handleCreated} brainId={activeBrain?.id} />
```

Replace with:
```jsx
      <QuickCapture apiKey={apiKey} sbKey={sbKey} entries={entries} setEntries={setEntries} links={links} addLinks={addLinks} onCreated={handleCreated} brainId={activeBrain?.id} isOnline={isOnline} refreshCount={refreshCount} />
```

- [ ] **Step 7: Commit**

```bash
git add src/OpenBrain.jsx
git commit -m "feat: wire offline sync into OpenBrain — update + delete queue"
```

---

## Task 5: Make `QuickCapture` offline-aware

**Files:**
- Modify: `src/OpenBrain.jsx` (`QuickCapture` function, ~line 252)

- [ ] **Step 1: Add `isOnline` and `refreshCount` to `QuickCapture` props**

Find (line 252):
```javascript
function QuickCapture({ apiKey, sbKey, entries, setEntries, links, addLinks, onCreated }) {
```

Replace with:
```javascript
function QuickCapture({ apiKey, sbKey, entries, setEntries, links, addLinks, onCreated, isOnline = true, refreshCount }) {
```

- [ ] **Step 2: Add `enqueue` import at top of file (if not already added in Task 4 Step 1)**

Verify `import { enqueue } from "./lib/offlineQueue";` is present. If Task 4 was completed first this is already done.

- [ ] **Step 3: Replace `handleImageUpload` with offline guard**

Find (line 261):
```javascript
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = ""; setLoading(true); setStatus("thinking");
```

Replace with:
```javascript
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = "";
    if (!isOnline) { setStatus("offline-image"); setTimeout(() => setStatus(null), 3000); return; }
    setLoading(true); setStatus("thinking");
```

- [ ] **Step 4: Add offline-image to `statusMsg`**

Find (around line 363):
```javascript
  const statusMsg = { thinking: "🤖 Parsing...", saving: "💾 Saving...", "saved-db": "✅ Saved!", "saved-local": "✅ Saved locally", "saved-raw": "📝 Saved", error: "⚠️ Saved locally" };
```

Replace with:
```javascript
  const statusMsg = { thinking: "🤖 Parsing...", saving: "💾 Saving...", "saved-db": "✅ Saved!", "saved-local": "✅ Saved locally", "saved-raw": "📝 Saved", error: "⚠️ Saved locally", "offline-image": "📵 Image uploads need a connection" };
```

- [ ] **Step 5: Replace `doSave` with offline-aware version**

Find (line 298):
```javascript
  const doSave = useCallback(async (parsed) => {
    setPreview(null);
    setLoading(true); setStatus("saving");
    try {
      if (sbKey && parsed.title) {
        const rpcRes = await authFetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || "", p_type: parsed.type || "note", p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [] }) });
        if (rpcRes.ok) {
```

Replace the entire `doSave` function through its closing `}, [sbKey, entries, links, addLinks, onCreated, setEntries]);` with:

```javascript
  const doSave = useCallback(async (parsed) => {
    setPreview(null);
    setLoading(true); setStatus("saving");
    try {
      if (sbKey && parsed.title) {
        if (!isOnline) {
          const tempId = Date.now().toString();
          const newEntry = { id: tempId, title: parsed.title, content: parsed.content || "", type: parsed.type || "note", metadata: parsed.metadata || {}, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
          await enqueue({ id: crypto.randomUUID(), url: "/api/capture", method: "POST", body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || "", p_type: parsed.type || "note", p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [] }), created_at: new Date().toISOString(), tempId });
          refreshCount?.();
          setEntries(prev => [newEntry, ...prev]);
          onCreated?.(newEntry);
          setStatus("saved-local");
        } else {
          const rpcRes = await authFetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || "", p_type: parsed.type || "note", p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [] }) });
          if (rpcRes.ok) {
            const result = await rpcRes.json();
            const newEntry = { id: result?.id || Date.now().toString(), title: parsed.title, content: parsed.content || "", type: parsed.type || "note", metadata: parsed.metadata || {}, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
            setEntries(prev => [newEntry, ...prev]);
            onCreated?.(newEntry);
            setStatus("saved-db");
            findConnections(newEntry, entries, links || []).then(newLinks => {
              if (newLinks.length === 0) return;
              addLinks?.(newLinks);
              authFetch("/api/save-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links: newLinks }) }).catch(() => {});
            });
          } else {
            const newEntry = { id: Date.now().toString(), ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
            setEntries(prev => [newEntry, ...prev]);
            onCreated?.(newEntry);
            setStatus("saved-local");
          }
        }
      } else {
        const newEntry = { id: Date.now().toString(), ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
        setEntries(prev => [newEntry, ...prev]);
        onCreated?.(newEntry);
        setStatus("saved-local");
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
    setLoading(false); setTimeout(() => setStatus(null), 3000);
  }, [sbKey, entries, links, addLinks, onCreated, setEntries, isOnline, refreshCount]);
```

- [ ] **Step 6: Commit**

```bash
git add src/OpenBrain.jsx
git commit -m "feat: offline-aware QuickCapture — queue creates, block image upload offline"
```

---

## Task 6: Add pending badge to header

**Files:**
- Modify: `src/OpenBrain.jsx` (`OpenBrain` return JSX, ~line 763)

- [ ] **Step 1: Add badge next to the memories count**

Find (around line 763):
```jsx
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 11, color: "#555" }}>{entries.length} memories</span>
              {apiKey && <span style={{ display: "block", fontSize: 9, color: "#4ECDC4" }}>AI active</span>}
            </div>
```

Replace with:
```jsx
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 11, color: "#555" }}>{entries.length} memories</span>
              {apiKey && <span style={{ display: "block", fontSize: 9, color: "#4ECDC4" }}>AI active</span>}
              {pendingCount > 0 && (
                <span style={{ display: "block", fontSize: 9, color: "#FFD700", marginTop: 2 }}>
                  {pendingCount} pending sync
                </span>
              )}
            </div>
```

- [ ] **Step 2: Verify the app builds**

```bash
npm run build
```

Expected: Build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/OpenBrain.jsx
git commit -m "feat: show pending sync count badge in header"
```

---

## Task 7: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test offline create**

In Chrome DevTools → Network tab → set throttling to **Offline**. Add a new entry. Verify:
- Entry appears in the UI immediately
- Header shows "1 pending sync"

- [ ] **Step 3: Test sync on reconnect**

Set throttling back to **No throttling**. Within a few seconds the `online` event fires and the drain runs. Verify:
- Badge disappears
- Entry exists in the Supabase dashboard

- [ ] **Step 4: Test offline update**

Offline again. Open an existing entry, edit it, save. Verify:
- UI reflects the change
- "1 pending sync" badge appears
- Badge clears on reconnect and Supabase shows the update

- [ ] **Step 5: Test offline delete**

Offline. Delete an entry (wait 5 seconds for the timer to commit). Verify:
- Entry is gone from UI
- Badge appears
- On reconnect, entry is deleted from Supabase

- [ ] **Step 6: Test image block**

Offline. Tap the image attach button. Verify: "📵 Image uploads need a connection" status message appears briefly.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all tests pass.
