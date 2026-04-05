import type { ApiRequest, ApiResponse } from './types';

// Distributed rate limiter — sliding window using Upstash Redis REST API.
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
// Falls back to in-memory (per-instance, zero real protection in serverless) if unconfigured.
//
// Setup: https://console.upstash.com — create a Redis database, copy REST URL + token.
// Add to Vercel env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

// ─── In-memory fallback (same serverless caveat as before) ───────────────────
const _counts = new Map<string, { count: number; reset: number }>();
function _inMemoryLimited(ip: string, windowMs: number, limit: number): boolean {
  const now = Date.now();
  const e = _counts.get(ip) || { count: 0, reset: now + windowMs };
  if (now > e.reset) { e.count = 0; e.reset = now + windowMs; }
  e.count++;
  _counts.set(ip, e);
  return e.count > limit;
}

// ─── Upstash sliding window via REST pipeline ─────────────────────────────────
async function _upstashLimited(ip: string, windowMs: number, limit: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const now = Date.now();
  const windowStart = now - windowMs;
  const setKey = `rl:${ip}`;
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

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
      return _inMemoryLimited(ip, windowMs, limit);
    }
    const data: any = await res.json();
    const count: number = data[2]?.result ?? 0;
    return count > limit;
  } catch (err: any) {
    console.warn(`[rateLimit] Upstash error — falling back to in-memory: ${err.message}`);
    return _inMemoryLimited(ip, windowMs, limit);
  }
}

function _getIp(req: ApiRequest): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/**
 * Returns true if the request is allowed (not rate-limited).
 * @param req - Vercel/Node request
 * @param limit - max requests per window
 * @param windowMs - window size in milliseconds (default 60s)
 */
export async function rateLimit(req: ApiRequest, limit: number = 20, windowMs: number = 60_000): Promise<boolean> {
  const ip = _getIp(req);
  const limited = process.env.UPSTASH_REDIS_REST_URL
    ? await _upstashLimited(ip, windowMs, limit)
    : _inMemoryLimited(ip, windowMs, limit);
  return !limited;
}

/**
 * Middleware wrapper. Usage: export default withRateLimit(handler, { max: 30 })
 */
export function withRateLimit(
  handler: (req: ApiRequest, res: ApiResponse) => Promise<void>,
  { windowMs = 60000, max = 30 }: { windowMs?: number; max?: number } = {}
): (req: ApiRequest, res: ApiResponse) => Promise<void> {
  return async (req: ApiRequest, res: ApiResponse) => {
    const allowed = await rateLimit(req, max, windowMs);
    if (!allowed) return res.status(429).json({ error: "Too many requests" });
    return handler(req, res);
  };
}
