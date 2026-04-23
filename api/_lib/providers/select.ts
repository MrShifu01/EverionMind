import type { AIProvider, ProviderAdapter, ProviderConfig } from "./types.js";
import { anthropic } from "./anthropic.js";
import { openai } from "./openai.js";
import { gemini } from "./gemini.js";

export interface UserAISettings {
  plan?: string | null;
  anthropic_key?: string | null;
  openai_key?: string | null;
  gemini_key?: string | null;
  anthropic_model?: string | null;
  openai_model?: string | null;
  gemini_byok_model?: string | null;
}

export interface ManagedGeminiOptions {
  key: string;
  model: string;
  chatModel: string;
}

export interface SelectOptions {
  forChat?: boolean;
  managed?: ManagedGeminiOptions;
  sanitizeGeminiModel?: (m: string | null | undefined) => string;
}

/**
 * Pure provider-selection logic. BYOK priority order:
 *   anthropic > openai > gemini > managed-gemini (pro only)
 * Returns null if free-tier user with no BYOK key.
 */
export function selectProvider(
  s: UserAISettings | null | undefined,
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

  const plan = settings.plan ?? "free";
  if (plan === "pro" && opts.managed?.key) {
    return {
      provider: "gemini-managed",
      key: opts.managed.key,
      model: opts.forChat ? opts.managed.chatModel : opts.managed.model,
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
