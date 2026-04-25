// ============================================================
// Realtime sync for entry cards.
// ============================================================
//
// Subscribes to UPDATEs on public.entries filtered to the active brain
// and merges the enrichment-relevant fields into the local entries
// state, so the P/I/C/E chips and wave-dot reflect server progress
// without a manual refresh.
//
// Why this hook (and not useEnrichmentOrchestrator):
//   The orchestrator hook is the legacy client-side enrichment pipeline.
//   It's defined but never mounted — and dragging it back in would also
//   re-enable the duplicate client-side LLM calls that the new server
//   pipeline replaced. This hook does only the propagation.
//
// Auth/RLS:
//   getRealtimeClient() carries the user JWT via the accessToken
//   callback, so RLS on entries (user_id = auth.uid()) admits the
//   broadcast. Without that JWT every UPDATE is silently filtered.
//
// Required server-side prerequisites (already done):
//   - migration 047: ALTER PUBLICATION supabase_realtime ADD TABLE entries
//   - REPLICA IDENTITY DEFAULT (so payload.new contains the full row)

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getRealtimeClient } from "../lib/supabaseRealtime";
import type { Entry } from "../types";

export function useEntryRealtime(
  activeBrainId: string | undefined,
  setEntries: Dispatch<SetStateAction<Entry[]>>,
): void {
  useEffect(() => {
    if (!activeBrainId) return;

    const rt = getRealtimeClient();
    const channel = rt.channel(`entries:${activeBrainId}`);

    channel
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "entries",
          filter: `brain_id=eq.${activeBrainId}`,
        },
        (payload: { new?: Partial<Entry> & { id?: string } }) => {
          const row = payload?.new;
          if (!row?.id) return;
          console.log("[realtime] entry update", row.id, {
            embedding_status: (row as any).embedding_status,
            enrichment: (row.metadata as any)?.enrichment,
          });
          setEntries((prev) => {
            const idx = prev.findIndex((e) => e.id === row.id);
            if (idx === -1) return prev;
            const next = prev.slice();
            const merged: Entry = { ...next[idx] };
            // Only mirror fields the chips/wave-dot/search read. Skipping
            // anything else avoids stomping client-only state (decryption,
            // optimistic updates).
            if (row.metadata !== undefined) merged.metadata = row.metadata as Entry["metadata"];
            if ((row as any).embedded_at !== undefined) (merged as any).embedded_at = (row as any).embedded_at;
            if ((row as any).embedding_status !== undefined) (merged as any).embedding_status = (row as any).embedding_status;
            if ((row as any).status !== undefined) (merged as any).status = (row as any).status;
            next[idx] = merged;
            return next;
          });
        },
      )
      .subscribe((status: string, err?: Error) => {
        console.log(`[realtime] entries:${activeBrainId} → ${status}`, err ?? "");
      });

    return () => {
      channel.unsubscribe();
    };
  }, [activeBrainId, setEntries]);
}
