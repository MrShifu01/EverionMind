import type { AIProvider, ProviderAdapter, ProviderConfig } from "./types.js";
import { anthropic } from "./anthropic.js";
import { openai } from "./openai.js";
import { gemini } from "./gemini.js";

// `plan` is intentionally absent from this shape. Tier lives on
// user_profiles.tier and must be passed explicitly into selectProvider
// (see api/_lib/loadUserAiContext.ts). The previous arrangement —
// `user_ai_settings.plan` mirroring billing tier — drifted whenever
// admin grants set user_profiles.tier='pro' without inserting a
// matching settings row. Result: free-defaulted plan, no managed
// provider, capture failed silently for new Pro users.
export interface UserAISettings {
  anthropic_key?: string | null;
  openai_key?: string | null;
  gemini_key?: string | null;
  anthropic_model?: string | null;
  openai_model?: string | null;
  gemini_byok_model?: string | null;
}

interface ManagedGeminiOptions {
  key: string;
  starterModel: string;
  starterChatModel: string;
  proModel: string;
  proChatModel: string;
}

interface SelectOptions {
  forChat?: boolean;
  managed?: ManagedGeminiOptions;
  sanitizeGeminiModel?: (m: string | null | undefined) => string;
}

/**
 * Pure provider-selection logic. BYOK priority order:
 *   anthropic > openai > gemini-byok > managed-gemini (paid tiers)
 * Returns null if user is on free tier with no BYOK key.
 *
 * Tier comes from user_profiles.tier — pass it explicitly.
 */
export function selectProvider(
  s: UserAISettings | null | undefined,
  tier: string,
  opts: SelectOptions = {},
): ProviderConfig | null {
  const settings = s || {};
  const sanitize = opts.sanitizeGeminiModel ?? ((m) => m || "");

  if (settings.anthropic_key) {
    return {
      provider: "anthropic",
      key: settings.anthropic_key,
      model: settings.anthropic_model || "claude-sonnet-4-6",
    };
  }
  if (settings.openai_key) {
    return {
      provider: "openai",
      key: settings.openai_key,
      model: settings.openai_model || "gpt-4o-mini",
    };
  }
  if (settings.gemini_key) {
    return {
      provider: "gemini-byok",
      key: settings.gemini_key,
      model: sanitize(settings.gemini_byok_model),
    };
  }

  // Managed provider is gated on tier from user_profiles.
  // pro / max → pro models, starter → starter models, anything else → no provider.
  const lowered = (tier || "").toLowerCase();
  const isStarter = lowered === "starter";
  const isPro = lowered === "pro" || lowered === "max";
  if ((isPro || isStarter) && opts.managed?.key) {
    return {
      provider: "gemini-managed",
      key: opts.managed.key,
      model: opts.forChat
        ? isPro
          ? opts.managed.proChatModel
          : opts.managed.starterChatModel
        : isPro
          ? opts.managed.proModel
          : opts.managed.starterModel,
    };
  }

  return null;
}

/** Resolve an adapter implementation for a given provider. Gemini BYOK and managed share the same HTTP API. */
export function getAdapter(p: AIProvider): ProviderAdapter {
  if (p === "anthropic") return anthropic;
  if (p === "openai") return openai;
  return gemini;
}
