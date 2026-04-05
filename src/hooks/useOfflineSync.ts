import { useState, useEffect, useRef, useCallback } from 'react';
import { getAll, remove, enqueue } from '../lib/offlineQueue';
import { authFetch } from '../lib/authFetch';
import { getEmbedHeaders } from '../lib/aiFetch';
import type { OfflineOp } from '../types';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RETRIES = 3;

interface ExtendedOp extends OfflineOp {
  type?: string;
  anthropicRequest?: unknown;
  retryCount?: number;
  nextRetryAt?: number;
}

interface UseOfflineSyncOptions {
  onEntryIdUpdate?: (tempId: string, realId: string) => void;
}

export function useOfflineSync({ onEntryIdUpdate }: UseOfflineSyncOptions = {}) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const drainingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCount = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      const ops = await getAll();
      setPendingCount(ops.length);
    }, 300);
  }, []);

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const ops = (await getAll()) as ExtendedOp[];
      for (const op of ops) {
        if (Date.now() - new Date(op.created_at).getTime() > STALE_MS) {
          console.warn('[offlineSync] Dropping stale op', op.id);
          await remove(op.id);
          setPendingCount(c => Math.max(0, c - 1));
          continue;
        }

        if (op.nextRetryAt && op.nextRetryAt > Date.now()) continue;

        try {
          if (op.type === 'raw-capture') {
            const parseRes = await authFetch('/api/anthropic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op.anthropicRequest) });
            if (!parseRes.ok) {
              const retryCount = (op.retryCount || 0) + 1;
              if (retryCount > MAX_RETRIES) {
                console.error('[offlineSync] Permanently dropping raw-capture op after max retries', op.id);
                await remove(op.id);
                setPendingCount(c => Math.max(0, c - 1));
              } else {
                await remove(op.id);
                await enqueue({ ...op, retryCount, nextRetryAt: Date.now() + (Math.pow(2, retryCount) * 1000) } as OfflineOp);
              }
              continue;
            }
            const data = await parseRes.json().catch(() => null);
            let parsed: Record<string, unknown> = {};
            try { parsed = JSON.parse(((data?.content?.[0]?.text as string) || '{}').replace(/```json|```/g, '').trim()); } catch { /* ignore */ }
            if (!parsed.title) continue;
            const embedHeaders = getEmbedHeaders() || {};
            const saveRes = await authFetch('/api/capture', { method: 'POST', headers: { 'Content-Type': 'application/json', ...embedHeaders }, body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || '', p_type: parsed.type || 'note', p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [] }) });
            if (saveRes.ok) {
              const result = await saveRes.json().catch(() => null);
              if (result?.id && op.tempId) onEntryIdUpdate?.(op.tempId, result.id);
              await remove(op.id);
              setPendingCount(c => Math.max(0, c - 1));
            } else {
              const retryCount = (op.retryCount || 0) + 1;
              if (retryCount > MAX_RETRIES) {
                console.error('[offlineSync] Permanently dropping raw-capture save op after max retries', op.id);
                await remove(op.id);
                setPendingCount(c => Math.max(0, c - 1));
              } else {
                await remove(op.id);
                await enqueue({ ...op, retryCount, nextRetryAt: Date.now() + (Math.pow(2, retryCount) * 1000) } as OfflineOp);
              }
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
            } else {
              const retryCount = (op.retryCount || 0) + 1;
              if (retryCount > MAX_RETRIES) {
                console.error('[offlineSync] Permanently dropping op after max retries', op.id, op.url);
                await remove(op.id);
                setPendingCount(c => Math.max(0, c - 1));
              } else {
                await remove(op.id);
                await enqueue({ ...op, retryCount, nextRetryAt: Date.now() + (Math.pow(2, retryCount) * 1000) } as OfflineOp);
              }
            }
          }
        } catch {
          const retryCount = (op.retryCount || 0) + 1;
          if (retryCount > MAX_RETRIES) {
            console.error('[offlineSync] Permanently dropping op after max retries (network error)', op.id);
            await remove(op.id);
            setPendingCount(c => Math.max(0, c - 1));
          } else {
            try { await remove(op.id); await enqueue({ ...op, retryCount, nextRetryAt: Date.now() + (Math.pow(2, retryCount) * 1000) } as OfflineOp); } catch { /* ignore */ }
          }
        }
      }
    } finally {
      drainingRef.current = false;
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
