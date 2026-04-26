import type { OfflineOp } from "../types";
import { KEYS } from "./storageKeys";

const DB_NAME = "openbrain-offline";
const STORE = "queue";
const FAILED_STORE = "failed_ops";
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Version 1: main queue store
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      // Version 2: failed ops store
      if (!db.objectStoreNames.contains(FAILED_STORE)) {
        db.createObjectStore(FAILED_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(op: OfflineOp): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(op);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      console.warn("[offlineQueue] IndexedDB quota exceeded, falling back to localStorage");
      try {
        const existing: OfflineOp[] = JSON.parse(localStorage.getItem(KEYS.OFFLINE_QUEUE) || "[]");
        const idx = existing.findIndex((o) => o.id === op.id);
        if (idx >= 0) existing[idx] = op;
        else existing.push(op);
        localStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(existing));
      } catch {
        /* ignore localStorage errors */
      }
    } else {
      throw e;
    }
  }
}

export async function getAll(): Promise<OfflineOp[]> {
  try {
    const db = await openDB();
    const items = await new Promise<OfflineOp[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result || []) as OfflineOp[]);
      req.onerror = () => reject(req.error);
    });
    return items.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  } catch {
    try {
      const items: OfflineOp[] = JSON.parse(localStorage.getItem(KEYS.OFFLINE_QUEUE) || "[]");
      return items.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    } catch {
      return [];
    }
  }
}

export async function remove(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      const items: OfflineOp[] = JSON.parse(localStorage.getItem(KEYS.OFFLINE_QUEUE) || "[]");
      localStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(items.filter((o) => o.id !== id)));
    } catch {
      /* ignore */
    }
  }
}

export async function clear(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.removeItem(KEYS.OFFLINE_QUEUE);
  }
}

// ── Failed ops store ──
// Ops that exceeded MAX_RETRIES are moved here so they can be
// displayed to the user and cleared manually instead of silently dropped.

export async function putFailed(op: OfflineOp): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FAILED_STORE, "readwrite");
    tx.objectStore(FAILED_STORE).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllFailed(): Promise<OfflineOp[]> {
  const db = await openDB();
  return new Promise<OfflineOp[]>((resolve, reject) => {
    const tx = db.transaction(FAILED_STORE, "readonly");
    const req = tx.objectStore(FAILED_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []) as OfflineOp[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearFailed(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FAILED_STORE, "readwrite");
    tx.objectStore(FAILED_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
