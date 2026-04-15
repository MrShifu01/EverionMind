import { supabase } from "./supabase";
import { trackEmbeddingIfPresent } from "./usageTracker";

const TTL_MS = 4 * 60 * 1000; // 4 minutes — within Supabase token lifetime
let _sessionCache: { token: string; expiresAt: number } | null = null;

// Invalidate on sign-in / sign-out / token refresh
supabase.auth.onAuthStateChange(() => {
  _sessionCache = null;
});

/** Reset session cache — for tests only */
export function _resetSessionCache(): void {
  _sessionCache = null;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token: string | undefined;

  if (_sessionCache && Date.now() < _sessionCache.expiresAt) {
    token = _sessionCache.token;
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      _sessionCache = { token: session.access_token, expiresAt: Date.now() + TTL_MS };
      token = session.access_token;
    } else {
      _sessionCache = null;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  trackEmbeddingIfPresent(response);

  return response;
}
