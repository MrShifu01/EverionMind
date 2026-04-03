// IndexedDB cache for entries — keeps the last fetched entries so the UI
// can render immediately before the network response arrives.
// Uses a separate DB ('openbrain-cache') so schema changes don't collide
// with the offline-queue DB ('openbrain-offline').

const DB_NAME = 'openbrain-cache';
const STORE = 'entries_cache';
const DB_VERSION = 1;
const CACHE_KEY = 'entries';

function openCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Write the entries array to IndexedDB.
 * Also writes to localStorage as a fallback (belt + suspenders).
 */
export async function writeEntriesCache(entries) {
  // Belt-and-suspenders: keep localStorage in sync for SSR/fallback
  try { localStorage.setItem('openbrain_entries', JSON.stringify(entries)); } catch {}

  try {
    const db = await openCacheDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key: CACHE_KEY, data: entries, ts: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // IDB write failed — localStorage copy already written above
    console.warn('[entriesCache] IDB write failed:', e?.message);
  }
}

/**
 * Read the entries array from IndexedDB.
 * Falls back to localStorage if IDB is unavailable or empty.
 * Returns null if nothing is cached.
 */
export async function readEntriesCache() {
  try {
    const db = await openCacheDB();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(CACHE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    if (record && Array.isArray(record.data) && record.data.length > 0) {
      return record.data;
    }
  } catch (e) {
    console.warn('[entriesCache] IDB read failed, falling back to localStorage:', e?.message);
  }

  // localStorage fallback
  try {
    const cached = localStorage.getItem('openbrain_entries');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  return null;
}
