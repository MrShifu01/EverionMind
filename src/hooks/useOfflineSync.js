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
