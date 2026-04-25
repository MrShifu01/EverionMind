/**
 * Lazy singleton RealtimeClient — separate from the minimal supabase.ts client
 * which deliberately excludes Realtime to keep the cold-load bundle small.
 * Import this only from hooks that explicitly need Realtime (e.g. enrichment status).
 *
 * Note on auth: postgres_changes events go through RLS on the broadcast side,
 * so the websocket needs the user's JWT — the anon key alone matches no rows
 * in the entries policy (user_id = auth.uid()), and every event is dropped.
 * The `accessToken` callback gives the client a fresh JWT on (re)connect and
 * on every channel resubscribe.
 */
import { RealtimeClient } from "@supabase/realtime-js";
import { supabase } from "./supabase";

let _client: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient {
  if (_client) return _client;
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  _client = new RealtimeClient(`${url}/realtime/v1/websocket`, {
    params: { apikey: anonKey },
    accessToken: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      console.log("[realtime:auth] accessToken callback →", token ? `present (len ${token.length})` : "null");
      return token;
    },
  });
  _client.connect();

  // Push fresh tokens through to the open socket whenever the auth state
  // changes (sign-in, sign-out, refresh). Without this, a session that was
  // refreshed after the first connect keeps using the stale token until
  // the websocket reconnects.
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("[realtime:auth] state change", event, session ? "→ token applied" : "→ cleared");
    _client?.setAuth(session?.access_token ?? null);
  });

  return _client;
}
