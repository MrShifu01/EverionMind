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
import { supabase } from "../lib/supabase";
import type { Entry } from "../types";

export function useEntryRealtime(
  activeBrainId: string | undefined,
  setEntries: Dispatch<SetStateAction<Entry[]>>,
): void {
  useEffect(() => {
    if (!activeBrainId) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      // Critical: set the access token BEFORE the channel.subscribe sends
      // its phx_join message. Without this, the join races the async
      // onAuthStateChange listener and goes out with claims_role=anon —
      // server-side RLS on entries (user_id = auth.uid()) then filters
      // out every row and the channel never delivers a payload, even
      // though it reports SUBSCRIBED.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const token = data.session?.access_token ?? null;

      const rt = getRealtimeClient();
      if (token) {
        await rt.setAuth(token);
      } else {
        console.warn("[realtime] no session token at subscribe time — broadcast will be filtered as anon");
      }

      if (cancelled) return;
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
            setEntries((prev) => {
              const idx = prev.findIndex((e) => e.id === row.id);
              if (idx === -1) return prev;
              const next = prev.slice();
              const merged: Entry = { ...next[idx] };
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
          if (err) console.warn(`[realtime] entries:${activeBrainId} → ${status}`, err);
        });

      cleanup = () => {
        channel.unsubscribe();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [activeBrainId, setEntries]);
}
