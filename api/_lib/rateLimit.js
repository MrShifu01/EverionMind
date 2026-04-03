// SEC-3 AUDIT FINDING — IN-MEMORY RATE LIMITER DOES NOT WORK IN SERVERLESS
// Each Vercel function instance has its own in-memory Map.
// Distributing requests across instances completely bypasses rate limits.
// TODO: Replace with Upstash Redis or @vercel/kv distributed rate limiting.
// Install: npm install @upstash/ratelimit @upstash/redis
// Until this is replaced, this rate limiter provides zero real protection.

// Per-instance in-memory rate limiter (serverless: limits bursts within a single cold-start instance)
const counts = new Map();

function isRateLimited(ip, windowMs, limit) {
  const now = Date.now();
  const entry = counts.get(ip) || { count: 0, reset: now + windowMs };

  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + windowMs;
  }

  entry.count++;
  counts.set(ip, entry);
  return entry.count > limit;
}

export function rateLimit(req, limit = 20, windowMs = 60_000) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return !isRateLimited(ip, windowMs, limit);
}

/**
 * ARCH-8: Rate limit wrapper. Currently uses in-memory Map (not distributed).
 * To upgrade: replace the isRateLimited body with @upstash/ratelimit sliding window check.
 * npm install @upstash/ratelimit @upstash/redis
 */
export function withRateLimit(handler, { windowMs = 60000, max = 30 } = {}) {
  return (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(ip, windowMs, max)) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    return handler(req, res);
  };
}
