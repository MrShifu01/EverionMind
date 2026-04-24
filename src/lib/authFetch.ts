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

async function fetchWithToken(url: string, options: RequestInit, token: string | undefined): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token: string | undefined;

  if (_sessionCache && Date.now() < _sessionCache.expiresAt) {
    token = _sessionCache.token;
  } else {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      _sessionCache = { token: session.access_token, expiresAt: Date.now() + TTL_MS };
      token = session.access_token;
    } else {
      _sessionCache = null;
    }
  }

  const response = await fetchWithToken(url, options, token);

  // 401: attempt a single token refresh then retry once
  if (response.status === 401) {
    _sessionCache = null;
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (refreshed?.access_token) {
      _sessionCache = { token: refreshed.access_token, expiresAt: Date.now() + TTL_MS };
      const retried = await fetchWithToken(url, options, refreshed.access_token);
      trackEmbeddingIfPresent(retried);
      return retried;
    }
  }

  trackEmbeddingIfPresent(response);

  return response;
}
