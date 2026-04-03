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
