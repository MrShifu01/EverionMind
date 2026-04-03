import { useState, useEffect, useRef, useCallback } from 'react';
import { getAll, remove } from '../lib/offlineQueue';
import { authFetch } from '../lib/authFetch';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function useOfflineSync({ onEntryIdUpdate } = {}) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const drainingRef = useRef(false);
  // PERF-7: debounce refreshCount so rapid successive calls (e.g. bulk enqueue)
  // only trigger one IndexedDB read instead of one per call.
  const refreshTimerRef = useRef(null);

  const refreshCount = useCallback(() => {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      const ops = await getAll();
      setPendingCount(ops.length);
    }, 300);
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
          if (op.type === 'raw-capture') {
            const parseRes = await authFetch('/api/anthropic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op.anthropicRequest) });
            if (!parseRes.ok) continue; // keep in queue, retry later
            const data = await parseRes.json().catch(() => null);
            let parsed = {};
            try { parsed = JSON.parse((data?.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()); } catch {}
            if (!parsed.title) continue; // bad parse, keep in queue
            const saveRes = await authFetch('/api/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || '', p_type: parsed.type || 'note', p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [] }) });
            if (saveRes.ok) {
              const result = await saveRes.json().catch(() => null);
              if (result?.id && op.tempId) onEntryIdUpdate?.(op.tempId, result.id);
              await remove(op.id);
              setPendingCount(c => Math.max(0, c - 1));
            }
          } else {
            const res = await authFetch(op.url, { method: op.method, headers: { 'Content-Type': 'application/json' }, body: op.body });
            if (res.ok || res.status === 404) {
              if (res.ok && op.method === 'POST' && op.tempId) {
                const data = await res.json().catch(() => null);
                if (data?.id) onEntryIdUpdate?.(op.tempId, data.id);
              }
              await remove(op.id);
              setPendingCount(c => Math.max(0, c - 1));
            }
          }
          // non-404 failure: leave in queue, continue to next op
        } catch {
          // network error: leave in queue
        }
      }
    } finally {
      drainingRef.current = false;
      // Re-sync count from actual queue state after drain completes (bypass debounce)
      getAll().then(remaining => setPendingCount(remaining.length));
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
