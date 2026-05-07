/**
 * Tier-based daily enrichment quota.
 *
 * Phase 2A scale foundation: every enrichInline call checks the user's
 * daily quota before running LLM steps. Free tier gets 20/day, starter
 * gets 200/day, pro/max are unlimited. Counters live in user_enrich_quota
 * and are managed via the consume_enrich_quota RPC (atomic upsert+check).
 *
 * Failure mode is fail-CLOSED for metered tiers: if the quota check itself
 * errors, enrichment waits instead of silently disabling cost controls.
 */

import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_HDR = sbHeaders();

export const TIER_DAILY_QUOTA: Record<string, number> = {
  free: 20,
  starter: 200,
  pro: -1, // unlimited (sentinel)
  max: -1,
};

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  /** True only when the check itself failed; caller should treat it as retryable. */
  errored: boolean;
}

/**
 * Resolve a tier string to a numeric limit. Falls back to 'free' for
 * unknown / null / empty values so untiered accounts don't accidentally
 * get unlimited enrichment.
 */
export function dailyLimitForTier(tier: string | null | undefined): number {
  const key = (tier ?? "").trim().toLowerCase();
  if (key in TIER_DAILY_QUOTA) return TIER_DAILY_QUOTA[key]!;
  return TIER_DAILY_QUOTA.free!;
}

/**
 * Look up the user's tier in user_profiles (cheap — single row by PK).
 * Returns 'free' when the profile is missing rather than blocking.
 */
export async function fetchUserTier(userId: string): Promise<string> {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=tier&limit=1`,
      { headers: SB_HDR },
    );
    if (!r.ok) return "free";
    const rows: Array<{ tier?: string | null }> = await r.json().catch(() => []);
    return (rows[0]?.tier ?? "free").toLowerCase();
  } catch {
    return "free";
  }
}

/**
 * Check the user's daily quota and consume one credit if allowed.
 * Returns allowed=true for unlimited tiers without touching the table.
 *
 * IMPORTANT: this is called at the TOP of enrichInline before any LLM
 * call. If allowed=false, caller should mark the entry as
 * enrichment_state='quota_exceeded' and return without doing work.
 */
export async function checkAndConsumeQuota(
  userId: string,
  tier: string,
): Promise<QuotaResult> {
  const limit = dailyLimitForTier(tier);
  if (limit < 0) {
    // Unlimited — skip the round trip entirely.
    return { allowed: true, used: 0, limit, errored: false };
  }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/consume_enrich_quota`, {
      method: "POST",
      headers: SB_HDR,
      body: JSON.stringify({ p_user_id: userId, p_limit: limit }),
    });
    if (!r.ok) {
      console.error(
        `[enrich-quota] HTTP ${r.status} on consume_enrich_quota — failing closed`,
      );
      return { allowed: false, used: 0, limit, errored: true };
    }
    const rows: Array<{ allowed: boolean; used: number }> = await r.json().catch(() => []);
    const row = rows[0];
    if (!row) return { allowed: false, used: 0, limit, errored: true };
    return { allowed: row.allowed === true, used: row.used ?? 0, limit, errored: false };
  } catch (err) {
    console.error(
      `[enrich-quota] consume failed — failing closed: ${(err as Error).message}`,
    );
    return { allowed: false, used: 0, limit, errored: true };
  }
}

/**
 * Read-only quota peek for UI (e.g. "you've used 14/20 today"). Doesn't
 * consume a credit. Returns null on failure (UI just hides the indicator).
 */
export async function readQuotaUsage(userId: string): Promise<{ used: number; date: string } | null> {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/user_enrich_quota?user_id=eq.${encodeURIComponent(userId)}&date=eq.${new Date().toISOString().slice(0, 10)}&select=count,date&limit=1`,
      { headers: SB_HDR },
    );
    if (!r.ok) return null;
    const rows: Array<{ count: number; date: string }> = await r.json().catch(() => []);
    const row = rows[0];
    return row ? { used: row.count, date: row.date } : { used: 0, date: new Date().toISOString().slice(0, 10) };
  } catch {
    return null;
  }
}
