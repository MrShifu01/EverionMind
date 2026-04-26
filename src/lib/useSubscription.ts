import { useState, useEffect } from "react";
import { supabase } from "./supabase";

export type Tier = "free" | "starter" | "pro" | "max";
export type UsageAction = "captures" | "chats" | "voice" | "improve";

interface UsageCounts {
  captures: number;
  chats: number;
  voice: number;
  improve: number;
}

const LIMITS: Record<Tier, UsageCounts> = {
  free:    { captures: 0,    chats: 0,    voice: 0,    improve: 0    },
  starter: { captures: 500,  chats: 200,  voice: 20,   improve: 20   },
  pro:     { captures: 2000, chats: 1000, voice: 100,  improve: 9999 },
  max:     { captures: 9999, chats: 9999, voice: 9999, improve: 9999 },
};

const ZERO_USAGE: UsageCounts = { captures: 0, chats: 0, voice: 0, improve: 0 };

export interface SubscriptionState {
  tier: Tier;
  usage: UsageCounts;
  limits: UsageCounts;
  pct: Partial<Record<UsageAction, number>>;
  renewalDate: string | null;
  isLoading: boolean;
}

export function useSubscription(): SubscriptionState {
  const [tier, setTier] = useState<Tier>("free");
  const [usage, setUsage] = useState<UsageCounts>(ZERO_USAGE);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const period = new Date().toISOString().slice(0, 7);

      const [profileRes, usageRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("tier,tier_expires_at,stripe_subscription_id")
          .eq("id", user.id)
          .single(),
        supabase
          .from("user_usage")
          .select("captures,chats,voice,improve")
          .eq("user_id", user.id)
          .eq("period", period)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const rawTier = (profileRes.data?.tier ?? "free") as Tier;
      const expiresAt = profileRes.data?.tier_expires_at ?? null;
      const effectiveTier: Tier =
        expiresAt && new Date(expiresAt) < new Date() ? "free" : rawTier;

      setTier(effectiveTier);
      setRenewalDate(expiresAt);
      setUsage(usageRes.data ?? ZERO_USAGE);
      setIsLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const limits = LIMITS[tier];

  const pct: Partial<Record<UsageAction, number>> = {};
  for (const action of ["captures", "chats", "voice", "improve"] as UsageAction[]) {
    const limit = limits[action];
    if (limit > 0 && limit < 9999) {
      pct[action] = Math.min(100, Math.round((usage[action] / limit) * 100));
    }
  }

  return { tier, usage, limits, pct, renewalDate, isLoading };
}
