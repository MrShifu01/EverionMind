// Canonical AI context loader.
//
// Single source of truth for the two pieces every AI endpoint needs:
//   1. user_profiles.tier  — billing tier (free / starter / pro / max).
//      Driven by Stripe / RevenueCat webhooks and admin grants. This is
//      the table the rest of the system writes to when entitlement
//      changes; it is the only trustworthy signal for "is this user
//      allowed managed-AI access right now?".
//   2. user_ai_settings    — BYOK keys + model preferences. Optional:
//      a brand-new account has no row here at all.
//
// Both fetches happen in parallel — same wall-clock cost as the previous
// single-table read. The legacy `user_ai_settings.plan` column is now
// IGNORED on every read path; relying on it produced silent failures
// for admin-promoted Pro users (no settings row, default 'free', /api/llm
// returned no provider, capture failed with "AI couldn't classify").

import { sbHeaders } from "./sbHeaders.js";
import type { UserAISettings } from "./providers/select.js";

const SB_URL = (process.env.SUPABASE_URL || "").trim();

export type UserTier = "free" | "starter" | "pro" | "max";

const VALID_TIERS = new Set<UserTier>(["free", "starter", "pro", "max"]);

export interface UserAiContext {
  tier: UserTier;
  settings: UserAISettings;
}

function normalizeTier(raw: unknown): UserTier {
  if (typeof raw !== "string") return "free";
  const lower = raw.toLowerCase();
  return VALID_TIERS.has(lower as UserTier) ? (lower as UserTier) : "free";
}

export async function loadUserAiContext(userId: string): Promise<UserAiContext> {
  const [settingsRes, profileRes] = await Promise.all([
    fetch(
      `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(userId)}` +
        `&select=anthropic_key,anthropic_model,openai_key,openai_model,gemini_key,gemini_byok_model&limit=1`,
      { headers: sbHeaders() },
    ).catch(() => null),
    fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=tier&limit=1`,
      { headers: sbHeaders() },
    ).catch(() => null),
  ]);

  const settingsRow: UserAISettings =
    settingsRes && settingsRes.ok
      ? ((await settingsRes.json().catch(() => []))[0] ?? {})
      : {};

  const profileRow: { tier?: string } =
    profileRes && profileRes.ok
      ? ((await profileRes.json().catch(() => []))[0] ?? {})
      : {};

  return { tier: normalizeTier(profileRow.tier), settings: settingsRow };
}
