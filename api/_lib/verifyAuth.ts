import type { ApiRequest } from "./types";
import type { AuthedUser } from "./withAuth.js";
import crypto from "crypto";
import { sbHeadersNoContent } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const VERIFY_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5_000;
const CACHE_MAX_ENTRIES = 500;

// Per-process cache of verified JWTs. A typical page issues 4–8 authed
// requests in parallel (HomeView fetches profile / gmail / calendar / vault /
// checklist_done; Settings tabs do their own GETs); each formerly hit
// /auth/v1/user separately. With a short TTL keyed by token-hash, a page load
// pays one round-trip and the rest are local — turns 8×~100ms into
// 1×~100ms when Supabase is healthy, and protects against the upstream
// 504/522 storm we're seeing today.
//
// Keep the TTL tight so revoked tokens age out quickly while still collapsing
// request bursts from one app render.
//
// Map preserves insertion order so we can cheaply trim the oldest entry
// when we exceed CACHE_MAX_ENTRIES — bounds memory on a hot instance.
type CacheEntry = { user: AuthedUser; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Hard-cap the JWT verification round-trip. Supabase auth occasionally
// returns 504/522 under load (Cloudflare front-of-queue timeout); without
// a timeout here the Vercel function holds the connection open until its
// 300s budget runs out, making every page that fetches authed data look
// like it's "loading forever." 5s is generous for a healthy auth call
// (typical: <100ms) and short enough that the client can show an error
// banner and let the user retry.
export async function verifyAuth(req: ApiRequest): Promise<AuthedUser | null> {
  const token = (req.headers.authorization as string | undefined)?.split(" ")[1];
  if (!token) return null;

  const key = tokenHash(token);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.user;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        apikey: sbHeadersNoContent().apikey,
        Authorization: `Bearer ${token}`,
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // Drop any stale cache entry for a now-invalid token.
      if (cached) cache.delete(key);
      return null;
    }
    const user = (await res.json()) as AuthedUser;
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(key, { user, expiresAt: now + CACHE_TTL_MS });
    return user;
  } catch {
    // Network error, abort, or non-2xx — treat as unauthenticated. Caller
    // already maps null → 401 so the client gets a fast failure instead of
    // a hung connection.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
