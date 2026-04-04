// Distributed rate limiter — sliding window using Upstash Redis REST API.
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
// Falls back to in-memory (per-instance, zero real protection in serverless) if unconfigured.
//
// Setup: https://console.upstash.com — create a Redis database, copy REST URL + token.
// Add to Vercel env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

// ─── In-memory fallback (same serverless caveat as before) ───────────────────
const _counts = new Map();
function _inMemoryLimited(ip, windowMs, limit) {
  const now = Date.now();
  const e = _counts.get(ip) || { count: 0, reset: now + windowMs };
  if (now > e.reset) { e.count = 0; e.reset = now + windowMs; }
  e.count++;
  _counts.set(ip, e);
  return e.count > limit;
}

// ─── Upstash sliding window via REST pipeline ─────────────────────────────────
async function _upstashLimited(ip, windowMs, limit) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const now = Date.now();
  const windowStart = now - windowMs;
  const setKey = `rl:${ip}`;
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  // Pipeline: trim old, add new, count, set TTL
  const pipeline = [
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
    const data = await res.json();
    const count = data[2]?.result ?? 0;
    return count > limit;
  } catch (err) {
    console.warn(`[rateLimit] Upstash error — falling back to in-memory: ${err.message}`);
    return _inMemoryLimited(ip, windowMs, limit);
  }
}

function _getIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/**
 * Returns true if the request is allowed (not rate-limited).
 * @param {object} req - Vercel/Node request
 * @param {number} limit - max requests per window
 * @param {number} windowMs - window size in milliseconds (default 60s)
 */
export async function rateLimit(req, limit = 20, windowMs = 60_000) {
  const ip = _getIp(req);
  const limited = process.env.UPSTASH_REDIS_REST_URL
    ? await _upstashLimited(ip, windowMs, limit)
    : _inMemoryLimited(ip, windowMs, limit);
  return !limited;
}

/**
 * Middleware wrapper. Usage: export default withRateLimit(handler, { max: 30 })
 */
export function withRateLimit(handler, { windowMs = 60000, max = 30 } = {}) {
  return async (req, res) => {
    const allowed = await rateLimit(req, max, windowMs);
    if (!allowed) return res.status(429).json({ error: "Too many requests" });
    return handler(req, res);
  };
}
