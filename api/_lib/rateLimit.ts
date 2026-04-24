import type { ApiRequest } from './types';

// Distributed rate limiter — sliding window using Upstash Redis REST API.
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
// Falls back to in-memory (per-instance, zero real protection in serverless) if unconfigured.
//
// Setup: https://console.upstash.com — create a Redis database, copy REST URL + token.
// Add to Vercel env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

// ─── In-memory fallback (same serverless caveat as before) ───────────────────
const _onVercel = !!process.env.VERCEL;
if (!process.env.UPSTASH_REDIS_REST_URL) {
  if (_onVercel) {
    console.error("[rateLimit] UPSTASH_REDIS_REST_URL not set — rate limiting will fail closed in serverless");
  } else {
    console.warn("[rateLimit] No Upstash URL configured — using in-memory rate limit (dev only)");
  }
}

const _counts = new Map<string, { count: number; reset: number }>();
const _MAX_IN_MEMORY_KEYS = 500;

function _evictExpired(): void {
  const now = Date.now();
  for (const [key, e] of _counts) {
    if (now > e.reset) _counts.delete(key);
  }
}

function _inMemoryLimited(key: string, windowMs: number, limit: number): boolean {
  const now = Date.now();
  if (_counts.size >= _MAX_IN_MEMORY_KEYS) _evictExpired();
  const e = _counts.get(key) || { count: 0, reset: now + windowMs };
  if (now > e.reset) { e.count = 0; e.reset = now + windowMs; }
  e.count++;
  _counts.set(key, e);
  return e.count > limit;
}

// ─── Upstash sliding window via REST pipeline ─────────────────────────────────
async function _upstashLimited(key: string, windowMs: number, limit: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const now = Date.now();
  const windowStart = now - windowMs;
  const setKey = `rl:${key}`;
  const member = `${now}:${crypto.randomUUID().slice(0, 8)}`;

  // Pipeline: trim old, add new, count, set TTL
  const pipeline: (string | number)[][] = [
    ["ZREMRANGEBYSCORE", setKey, "-inf", String(windowStart)],
    ["ZADD", setKey, String(now), member],
    ["ZCARD", setKey],
    ["PEXPIRE", setKey, windowMs],
  ];

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });
    if (!res.ok) {
      console.warn(`[rateLimit] Upstash pipeline HTTP ${res.status} — falling back to in-memory`);
      return _inMemoryLimited(key, windowMs, limit);
    }
    const data: any = await res.json();
    const count: number = data[2]?.result ?? 0;
    return count > limit;
  } catch (err: any) {
    console.warn(`[rateLimit] Upstash error — falling back to in-memory: ${err.message}`);
    return _inMemoryLimited(key, windowMs, limit);
  }
}

function _getIp(req: ApiRequest): string {
  // S1-6: Use LAST IP in x-forwarded-for chain (closest verified hop from Vercel edge).
  // First hop is user-controlled and spoof-able. x-real-ip is harder to forge.
  const forwarded = (req.headers["x-forwarded-for"] as string | undefined);
  const lastForwarded = forwarded?.split(",").pop()?.trim();
  return lastForwarded || (req.headers["x-real-ip"] as string | undefined) || req.socket?.remoteAddress || "unknown";
}

/**
 * Returns true if the request is allowed (not rate-limited).
 * Each endpoint gets its own independent counter — the path is included in
 * the key so that LLM/embed calls don't consume the budget of feed/entries.
 * @param req - Vercel/Node request
 * @param limit - max requests per window
 * @param windowMs - window size in milliseconds (default 60s)
 */
export async function rateLimit(req: ApiRequest, limit: number = 20, windowMs: number = 60_000): Promise<boolean> {
  const ip = _getIp(req);
  const path = (req.url || "").split("?")[0].slice(0, 50);
  const key = `${ip}:${path}`;
  const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL;
  if (!hasUpstash && _onVercel) return false; // fail closed in prod without Redis
  const limited = hasUpstash
    ? await _upstashLimited(key, windowMs, limit)
    : _inMemoryLimited(key, windowMs, limit);
  return !limited;
}

