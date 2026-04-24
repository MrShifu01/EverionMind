/**
 * Lazy singleton RealtimeClient — separate from the minimal supabase.ts client
 * which deliberately excludes Realtime to keep the cold-load bundle small.
 * Import this only from hooks that explicitly need Realtime (e.g. enrichment status).
 */
import { RealtimeClient } from "@supabase/realtime-js";

let _client: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient {
  if (_client) return _client;
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  _client = new RealtimeClient(`${url}/realtime/v1/websocket`, {
    params: { apikey: anonKey },
  });
  _client.connect();
  return _client;
}
