import type { ApiRequest } from "./types";

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
    console.error(
      "[rateLimit] UPSTASH_REDIS_REST_URL not set — rate limiting will fail closed in serverless",
    );
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
  if (now > e.reset) {
    e.count = 0;
    e.reset = now + windowMs;
  }
  e.count++;
  _counts.set(key, e);
  return e.count > limit;
}

// ─── Circuit breaker on Upstash health ────────────────────────────────────────
// Fail-open in-memory fallback gives zero protection in serverless. If Upstash
// is misconfigured (bad token) or down, we don't want to silently drop the
// rate limit for 5 minutes — we want to fail closed so attackers can't ride
// through with unbounded requests. The breaker trips after 3 consecutive
// failures and stays open for 5 min before probing again.
const _CIRCUIT_THRESHOLD = 3;
const _CIRCUIT_OPEN_MS = 5 * 60_000;
let _consecutiveFailures = 0;
let _circuitOpenUntil = 0;

function _circuitOpen(): boolean {
  return Date.now() < _circuitOpenUntil;
}

function _recordUpstashFailure(): void {
  _consecutiveFailures++;
  if (_consecutiveFailures >= _CIRCUIT_THRESHOLD && !_circuitOpen()) {
    _circuitOpenUntil = Date.now() + _CIRCUIT_OPEN_MS;
    console.warn(
      `[rateLimit] Upstash circuit OPEN for ${_CIRCUIT_OPEN_MS / 1000}s after ${_consecutiveFailures} consecutive failures — failing closed`,
    );
  }
}

function _recordUpstashSuccess(): void {
  if (_consecutiveFailures > 0) _consecutiveFailures = 0;
  if (_circuitOpenUntil > 0 && Date.now() >= _circuitOpenUntil) _circuitOpenUntil = 0;
}

// ─── Upstash sliding window via REST pipeline ─────────────────────────────────
// Returns true if the call should be RATE-LIMITED (denied), false if allowed.
// Throws when the circuit is open OR when this call's failure trips the breaker
// — caller treats throw as "fail closed (503)" instead of falling back in-memory.
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
      _recordUpstashFailure();
      console.warn(`[rateLimit] Upstash pipeline HTTP ${res.status}`);
      throw new Error(`Upstash HTTP ${res.status}`);
    }
    const data: any = await res.json();
    const count: number = data[2]?.result ?? 0;
    _recordUpstashSuccess();
    return count > limit;
  } catch (err: any) {
    _recordUpstashFailure();
    console.warn(`[rateLimit] Upstash error: ${err?.message ?? String(err)}`);
    throw err;
  }
}

function _getIp(req: ApiRequest): string {
  // Vercel provides the original client IP as the leftmost x-forwarded-for
  // value. Using the last hop collapses all traffic behind the edge IP and
  // turns rate limits into a site-wide NAT lockout.
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  return (
    firstForwarded ||
    (req.headers["x-real-ip"] as string | undefined) ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/**
 * Returns true if the request is allowed (not rate-limited).
 * Each endpoint gets its own independent counter — the path is included in
 * the key so that LLM/embed calls don't consume the budget of feed/entries.
 *
 * Failure modes (in priority order):
 *   1. Upstash unconfigured + serverless         → fail closed (return false)
 *   2. Circuit breaker open (3+ recent failures) → fail closed (return false)
 *   3. Upstash call throws on this attempt       → fail closed (return false)
 *
 * The previous "fall back to in-memory" path is gone. Per-instance memory in
 * a serverless environment provides zero real protection (different cold
 * boots see no shared state) and turning a misconfigured/down Upstash into a
 * silent open gate is exactly the kind of footgun this hardening is meant to
 * close.
 *
 * @param req - Vercel/Node request
 * @param limit - max requests per window
 * @param windowMs - window size in milliseconds (default 60s)
 */
export async function rateLimit(
  req: ApiRequest,
  limit: number = 20,
  windowMs: number = 60_000,
  suffix?: string,
): Promise<boolean> {
  const ip = _getIp(req);
  const path = (req.url || "").split("?")[0].slice(0, 50);
  const key = suffix ? `${ip}:${path}:${suffix}` : `${ip}:${path}`;
  const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL;
  if (!hasUpstash) {
    if (_onVercel) return false; // serverless without Redis = fail closed
    return !_inMemoryLimited(key, windowMs, limit); // dev convenience only
  }
  if (_circuitOpen()) return false; // breaker tripped → fail closed
  try {
    const limited = await _upstashLimited(key, windowMs, limit);
    return !limited;
  } catch {
    // Upstash threw and the breaker may have just tripped on this call.
    // Either way, fail closed — never silently bypass to in-memory in prod.
    return false;
  }
}
