import { sbHeaders } from "./sbHeaders.js";

export type UsageAction = "captures" | "chats" | "voice" | "improve";

const LIMITS: Record<string, Record<UsageAction, number>> = {
  starter: { captures: 500,  chats: 200,  voice: 20,  improve: 20       },
  pro:     { captures: 2000, chats: 1000, voice: 100, improve: Infinity },
};

const SB_URL = process.env.SUPABASE_URL!;

export async function checkAndIncrement(
  userId: string,
  action: UsageAction,
  tier: string,
  hasByok: boolean,
): Promise<{ allowed: boolean; remaining: number; pct: number }> {
  if (hasByok) return { allowed: true, remaining: Infinity, pct: 0 };
  if (tier === "free") return { allowed: false, remaining: 0, pct: 100 };

  const tierLimits = LIMITS[tier];
  if (!tierLimits) return { allowed: false, remaining: 0, pct: 100 };

  const limit = tierLimits[action];
  const period = new Date().toISOString().slice(0, 7);

  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/increment_usage`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({ p_user_id: userId, p_period: period, p_action: action }),
    });
    if (!r.ok) throw new Error(`RPC failed: ${r.status}`);
    const count = (await r.json()) as number;

    if (limit === Infinity) return { allowed: true, remaining: Infinity, pct: 0 };
    const remaining = Math.max(0, limit - count);
    const pct = Math.min(100, Math.round((count / limit) * 100));
    return { allowed: count < limit, remaining, pct };
  } catch (err) {
    console.error("[usage] checkAndIncrement failed:", err);
    throw Object.assign(new Error("quota_check_failed"), { status: 503 });
  }
}
