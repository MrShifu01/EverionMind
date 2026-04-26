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

export interface AICallOpts {
  /** Hard cap on output tokens. Adapter applies provider-specific defaults. */
  maxTokens?: number;
  /**
   * Hint that the response should be JSON. Adapters set provider-specific
   * response formats where supported (OpenAI response_format, Gemini
   * responseMimeType). Callers must still validate the parsed shape — this
   * is a hint, not a guarantee.
   */
  json?: boolean;
}

/**
 * Call the configured AI provider with a system prompt + user content.
 * Returns the response text on success, "" on any failure (HTTP error,
 * unparseable response, missing key). Errors are logged with provider
 * context but not thrown — enrichment treats empty as "step did not
 * succeed, leave the flag unset for retry."
 */
export async function callAI(cfg: AICall, system: string, content: string, opts: AICallOpts = {}): Promise<string> {
  if (!cfg.apiKey) return "";
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

async function callAnthropic(cfg: AICall, system: string, content: string, opts: AICallOpts): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
  });
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

async function callOpenAI(cfg: AICall, system: string, content: string, opts: AICallOpts): Promise<string> {
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

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
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

async function callGemini(cfg: AICall, system: string, content: string, opts: AICallOpts): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens ?? 1500,
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (opts.json) generationConfig.responseMimeType = "application/json";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: content }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig,
    }),
  });
  if (!res.ok) {
    console.error(`[aiProvider:gemini] HTTP ${res.status}`, await res.text().catch(() => ""));
    return "";
  }
  const d: any = await res.json().catch(() => null);
  const parts: any[] = d?.candidates?.[0]?.content?.parts ?? [];
  // Filter out internal `thought` parts (a precaution if thinking ever sneaks
  // back on); join the rest. If filtering leaves nothing, return whatever
  // was generated rather than an empty string.
  const text = parts.filter((p: any) => !p.thought).map((p: any) => p.text || "").join("").trim();
  return text || parts.map((p: any) => p.text || "").join("").trim();
}
