import type { Entry } from "../types";
import { KEYS } from "./storageKeys";

const DB_NAME = "openbrain-cache";
const STORE = "entries_cache";
const DB_VERSION = 1;
const CACHE_KEY = "entries";

interface CacheRecord {
  key: string;
  data: Entry[];
  ts: number;
}

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function writeEntriesCache(entries: Entry[]): Promise<void> {
  try {
    localStorage.setItem(KEYS.ENTRIES_CACHE, JSON.stringify(entries));
  } catch {
    /* ignore */
  }

  try {
    const db = await openCacheDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        key: CACHE_KEY,
        data: entries,
        ts: Date.now(),
      } satisfies CacheRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e: unknown) {
    console.warn("[entriesCache] IDB write failed:", e instanceof Error ? e.message : e);
  }
}

export async function readEntriesCache(): Promise<Entry[] | null> {
  try {
    const db = await openCacheDB();
    const record = await new Promise<CacheRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(CACHE_KEY);
      req.onsuccess = () => resolve((req.result as CacheRecord) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (record && Array.isArray(record.data) && record.data.length > 0) {
      return record.data;
    }
  } catch (e: unknown) {
    console.warn(
      "[entriesCache] IDB read failed, falling back to localStorage:",
      e instanceof Error ? e.message : e,
    );
  }

  try {
    const cached = localStorage.getItem(KEYS.ENTRIES_CACHE);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Entry[];
    }
  } catch {
    /* ignore */
  }

  return null;
}
