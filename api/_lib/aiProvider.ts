// ============================================================
// Single AI provider adapter for the enrichment pipeline.
// ============================================================
//
// One callAI() entry point. Internal adapters per provider shape.
// Adding a new provider = new adapter + entry in the dispatch switch;
// the rest of the codebase stays unchanged.
//
// This file is pure I/O — no business logic, no flag stamping, no
// metadata parsing. It takes a config + prompt, returns text.

export type Provider = "anthropic" | "openai" | "gemini" | "openai-compatible";

export interface AICall {
  provider: Provider;
  apiKey: string;
  model: string;
  /** Required for "openai-compatible" (Ollama, LM Studio, OpenRouter, …). */
  baseUrl?: string;
}

interface AICallOpts {
  /** Hard cap on output tokens. Adapter applies provider-specific defaults. */
  maxTokens?: number;
  /**
   * Hint that the response should be JSON. Adapters set provider-specific
   * response formats where supported (OpenAI response_format, Gemini
   * responseMimeType). Callers must still validate the parsed shape — this
   * is a hint, not a guarantee.
  */
  json?: boolean;
  /**
   * Optional metered-user context. When supplied, callAI consumes quota before
   * any provider network request. This keeps cost control at the LLM boundary
   * instead of relying on every feature path to remember a separate gate.
   */
  quota?: {
    userId: string;
    tier?: string;
  };
}

import { googleAiFetch, googleAiModelUrl } from "./googleAi.js";
import { checkAndConsumeQuota, fetchUserTier } from "./enrichQuota.js";
import { withDateContext } from "./promptContext.js";
import {
  buildGeminiGenerateContentBody,
  geminiCandidateParts,
  geminiGenerationConfig,
  pickGeminiAnswerText,
} from "./providers/geminiHelpers.js";

// Retry transient failures (5xx + network errors + 429) with exponential
// backoff: 100ms → 400ms → 1.6s. 4xx other than 429 is a permanent failure
// (auth, content policy, malformed request) — surface immediately so we
// don't burn time/credits retrying something that will keep failing.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  googleApiKey?: string,
): Promise<Response> {
  const delays = [100, 400, 1600];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = googleApiKey
        ? await googleAiFetch(googleApiKey, url, init, 15_000)
        : await fetch(url, init);
      const transient = res.status >= 500 || res.status === 429;
      if (!transient || attempt === delays.length) return res;
      console.warn(
        `[aiProvider:${label}] HTTP ${res.status} on attempt ${attempt + 1}/${delays.length + 1} — retrying in ${delays[attempt]}ms`,
      );
    } catch (err) {
      lastErr = err;
      if (attempt === delays.length) throw err;
      console.warn(
        `[aiProvider:${label}] network error on attempt ${attempt + 1}/${delays.length + 1} — retrying in ${delays[attempt]}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
  // Unreachable — the loop returns or throws on the final attempt — but TS
  // can't prove that, so re-throw the last error.
  throw lastErr ?? new Error("fetchWithRetry exhausted retries");
}

/**
 * Call the configured AI provider with a system prompt + user content.
 * Returns the response text on success, "" on permanent failure (4xx auth,
 * malformed request, missing key, or 5xx after 3 retries with exponential
 * backoff). Errors are logged with provider context but not thrown —
 * enrichment treats empty as "step did not succeed, leave the flag unset
 * for retry on the next pass."
 */
export async function callAI(
  cfg: AICall,
  rawSystem: string,
  content: string,
  opts: AICallOpts = {},
): Promise<string> {
  if (!cfg.apiKey) return "";
  if (opts.quota) {
    const tier = opts.quota.tier ?? (await fetchUserTier(opts.quota.userId));
    const quota = await checkAndConsumeQuota(opts.quota.userId, tier);
    if (!quota.allowed) {
      console.warn(
        `[aiProvider:quota] ${opts.quota.userId} blocked at ${quota.used}/${quota.limit} daily`,
      );
      return "";
    }
  }
  const system = withDateContext(rawSystem);
  switch (cfg.provider) {
    case "anthropic":
      return callAnthropic(cfg, system, content, opts);
    case "openai":
    case "openai-compatible":
      return callOpenAI(cfg, system, content, opts);
    case "gemini":
      return callGemini(cfg, system, content, opts);
    default: {
      // Exhaustive check — TypeScript will error if a Provider variant is added
      // without a corresponding case.
      const _exhaustive: never = cfg.provider;
      void _exhaustive;
      return "";
    }
  }
}

// ── Anthropic Messages API ──────────────────────────────────────────────────

async function callAnthropic(
  cfg: AICall,
  system: string,
  content: string,
  opts: AICallOpts,
): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: opts.maxTokens ?? 1500,
          system,
          messages: [{ role: "user", content }],
        }),
      },
      "anthropic",
    );
  } catch (err: any) {
    console.error(`[aiProvider:anthropic] network failure after retries: ${err?.message ?? err}`);
    return "";
  }
  if (!res.ok) {
    console.error(`[aiProvider:anthropic] HTTP ${res.status}`, await res.text().catch(() => ""));
    return "";
  }
  const d: any = await res.json().catch(() => null);
  return d?.content?.[0]?.text ?? "";
}

// ── OpenAI / OpenAI-compatible Chat Completions ─────────────────────────────
//
// Local model gateways (Ollama, LM Studio, OpenRouter, vLLM, llama.cpp server,
// Together, Groq, Fireworks) all expose this exact shape. Pointing baseUrl at
// http://localhost:11434/v1 talks to Ollama; pointing at https://api.groq.com/openai/v1
// talks to Groq. Same adapter.

async function callOpenAI(
  cfg: AICall,
  system: string,
  content: string,
  opts: AICallOpts,
): Promise<string> {
  const baseUrl =
    cfg.provider === "openai-compatible"
      ? cfg.baseUrl?.replace(/\/$/, "")
      : "https://api.openai.com/v1";
  if (!baseUrl) {
    console.error("[aiProvider:openai-compatible] baseUrl required");
    return "";
  }
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: opts.maxTokens ?? 1500,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
  };
  if (opts.json) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetchWithRetry(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      cfg.provider,
    );
  } catch (err: any) {
    console.error(
      `[aiProvider:${cfg.provider}] network failure after retries: ${err?.message ?? err}`,
    );
    return "";
  }
  if (!res.ok) {
    console.error(
      `[aiProvider:${cfg.provider}] HTTP ${res.status}`,
      await res.text().catch(() => ""),
    );
    return "";
  }
  const d: any = await res.json().catch(() => null);
  return d?.choices?.[0]?.message?.content ?? "";
}

// ── Google Gemini generateContent ───────────────────────────────────────────
//
// 2.5 Flash uses extended thinking by default. At small token budgets the
// thinking phase eats the entire output, returning truncated text. We disable
// thinking by default for enrichment calls — short structured responses don't
// benefit from it and the budget should be spent on the answer.

async function callGemini(
  cfg: AICall,
  system: string,
  content: string,
  opts: AICallOpts,
): Promise<string> {
  const generationConfig = geminiGenerationConfig(cfg.model, {
    maxOutputTokens: opts.maxTokens ?? 1500,
    ...(cfg.model.startsWith("gemini-3") ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
  });
  if (opts.json) generationConfig.responseMimeType = "application/json";

  let res: Response;
  try {
    res = await fetchWithRetry(
      googleAiModelUrl(cfg.model, "generateContent"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildGeminiGenerateContentBody({
            contents: [{ role: "user", parts: [{ text: content }] }],
            system,
            generationConfig,
          }),
        ),
      },
      "gemini",
      cfg.apiKey,
    );
  } catch (err: any) {
    console.error(`[aiProvider:gemini] network failure after retries: ${err?.message ?? err}`);
    return "";
  }
  if (!res.ok) {
    console.error(`[aiProvider:gemini] HTTP ${res.status}`, await res.text().catch(() => ""));
    return "";
  }
  const d: any = await res.json().catch(() => null);
  return pickGeminiAnswerText(geminiCandidateParts(d));
}
