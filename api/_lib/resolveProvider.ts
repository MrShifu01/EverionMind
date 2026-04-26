// ============================================================
// Provider routing for the enrichment pipeline.
// ============================================================
//
//   resolveProviderForUser(userId) decides which AI provider to use
//   for enrichment, based on:
//
//     1. BYOK keys in user_ai_settings — if the user provided their
//        own Anthropic / OpenAI / Gemini / OpenRouter key, use it.
//        Order: anthropic → openai → gemini → openrouter.
//        BYOK wins over tier (the user paid for those tokens).
//
//     2. Otherwise the managed-provider tier mapping in user_profiles:
//          tier=pro | max  → managed Anthropic   (env ANTHROPIC_API_KEY)
//          tier=starter    → managed Gemini      (env GEMINI_API_KEY)
//          tier=free       → null (no enrichment for free tier)
//
//   resolveEmbedProviderForUser(userId) is separate: embedding always
//   runs on Gemini (or OpenAI if user has BYOK OpenAI key) regardless
//   of the LLM choice. Anthropic does not offer a first-class embedding
//   model, and we don't want enrichment success tied to LLM provider
//   capabilities.

import type { AICall } from "./aiProvider.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HDR = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

const DEFAULT_MODELS = {
  anthropic: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
  gemini: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
} as const;

interface UserAiSettings {
  plan: string | null;
  anthropic_key: string | null;
  anthropic_model: string | null;
  openai_key: string | null;
  openai_model: string | null;
  gemini_key: string | null;
  gemini_byok_model: string | null;
  openrouter_key: string | null;
  openrouter_model: string | null;
  embed_openai_key: string | null;
}

interface UserProfile {
  tier: string | null;
}

async function fetchSettings(userId: string): Promise<UserAiSettings | null> {
  const r = await fetch(
    `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(userId)}&select=plan,anthropic_key,anthropic_model,openai_key,openai_model,gemini_key,gemini_byok_model,openrouter_key,openrouter_model,embed_openai_key&limit=1`,
    { headers: SB_HDR },
  );
  if (!r.ok) return null;
  const [row] = (await r.json().catch(() => [])) as UserAiSettings[];
  return row ?? null;
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const r = await fetch(
    `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=tier&limit=1`,
    { headers: SB_HDR },
  );
  if (!r.ok) return null;
  const [row] = (await r.json().catch(() => [])) as UserProfile[];
  return row ?? null;
}

/**
 * Resolve the LLM provider to use for enrichment for this user.
 * Returns null when the user is on a tier that doesn't get enrichment
 * AND has no BYOK key — caller should treat as "skip enrichment."
 */
export async function resolveProviderForUser(userId: string): Promise<AICall | null> {
  const settings = await fetchSettings(userId);

  // BYOK has priority over tier. Order: anthropic > openai > gemini > openrouter.
  // (Anthropic first because it's the highest-quality choice users typically
  // bring; the rest follow in roughly cost-descending order.)
  if (settings?.anthropic_key) {
    return {
      provider: "anthropic",
      apiKey: settings.anthropic_key,
      model: settings.anthropic_model || DEFAULT_MODELS.anthropic,
    };
  }
  if (settings?.openai_key) {
    return {
      provider: "openai",
      apiKey: settings.openai_key,
      model: settings.openai_model || DEFAULT_MODELS.openai,
    };
  }
  if (settings?.gemini_key) {
    return {
      provider: "gemini",
      apiKey: settings.gemini_key,
      model: settings.gemini_byok_model || DEFAULT_MODELS.gemini,
    };
  }
  if (settings?.openrouter_key) {
    return {
      provider: "openai-compatible",
      apiKey: settings.openrouter_key,
      model: settings.openrouter_model || DEFAULT_MODELS.openrouter,
      baseUrl: "https://openrouter.ai/api/v1",
    };
  }

  // No BYOK — fall back to managed provider based on tier.
  const profile = await fetchProfile(userId);
  const tier = (profile?.tier ?? settings?.plan ?? "free").toLowerCase();

  if (tier === "pro" || tier === "max") {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      return { provider: "anthropic", apiKey: anthropicKey, model: DEFAULT_MODELS.anthropic };
    }
    // Fall through to managed Gemini so pro/max users still get enrichment
    // when ANTHROPIC_API_KEY isn't configured (per project policy).
  }
  if (tier === "pro" || tier === "max" || tier === "starter") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return { provider: "gemini", apiKey, model: DEFAULT_MODELS.gemini };
  }

  // Free tier or unknown — no managed enrichment.
  return null;
}

/**
 * Resolve the embedding provider for this user. Embedding is decoupled
 * from the LLM choice because Anthropic doesn't offer a first-class
 * embedding model. Order: BYOK OpenAI (embed_openai_key or openai_key)
 * → managed Gemini.
 */
export async function resolveEmbedProviderForUser(userId: string): Promise<{
  provider: "gemini" | "openai";
  apiKey: string;
  model: string;
} | null> {
  const settings = await fetchSettings(userId);
  if (settings?.embed_openai_key) {
    return { provider: "openai", apiKey: settings.embed_openai_key, model: "text-embedding-3-small" };
  }
  if (settings?.openai_key) {
    return { provider: "openai", apiKey: settings.openai_key, model: "text-embedding-3-small" };
  }
  if (settings?.gemini_key) {
    return { provider: "gemini", apiKey: settings.gemini_key, model: "gemini-embedding-001" };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return { provider: "gemini", apiKey, model: "gemini-embedding-001" };
}
