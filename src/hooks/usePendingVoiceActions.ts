import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../lib/authFetch";

export interface PendingVoiceAction {
  id: string;
  brain_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  summary: string;
  created_at: string;
  expires_at: string;
}

interface UsePendingVoiceActions {
  pending: PendingVoiceAction[];
  loading: boolean;
  refresh: () => Promise<void>;
  accept: (id: string) => Promise<{ ok: boolean; error?: string; result?: unknown }>;
  reject: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

// Polls /api/llm?action=pending-list while `active` is true. Stops when
// active flips false. Also exposes accept/reject which hit pending-commit
// and optimistically clear the row from local state on success.
export function usePendingVoiceActions(active: boolean): UsePendingVoiceActions {
  const [pending, setPending] = useState<PendingVoiceAction[]>([]);
  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const r = await authFetch("/api/llm?action=pending-list", { method: "POST" });
      if (r.ok) {
        const data = (await r.json().catch(() => ({}))) as { pending?: PendingVoiceAction[] };
        setPending(data.pending ?? []);
      }
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      setPending([]);
      return;
    }
    void refresh();
    // Poll every 3s while voice is active. Light enough not to wake mobile
    // radios excessively, fresh enough that the banner shows the model's
    // enqueue ~1 turn after it fires.
    const id = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(id);
  }, [active, refresh]);

  const commit = useCallback(async (id: string, decision: "accept" | "reject") => {
    try {
      const r = await authFetch("/api/llm?action=pending-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        // Optimistic remove from local list.
        setPending((prev) => prev.filter((p) => p.id !== id));
        return { ok: true, ...(data as object) };
      }
      return { ok: false, error: (data as { error?: string }).error ?? `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "commit_failed" };
    }
  }, []);

  const accept = useCallback((id: string) => commit(id, "accept"), [commit]);
  const reject = useCallback((id: string) => commit(id, "reject"), [commit]);

  return { pending, loading, refresh, accept, reject };
}
