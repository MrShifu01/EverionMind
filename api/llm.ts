import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

// SEC-17: API Key Rotation Policy
// Rotate ANTHROPIC_API_KEY every 90 days. Last rotation: 2026-04-03
// Set up usage alerts in Anthropic console to catch unexpected spend.
// Key is stored in Vercel environment variables (never in code).

const ANTHROPIC_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

const OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1",
];

const OPENROUTER_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "anthropic/claude-3.5-haiku",
  "anthropic/claude-sonnet-4-5",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "meta-llama/llama-3.1-70b-instruct",
];

interface LlmParams {
  model: string;
  messages: any[];
  max_tokens: number | undefined;
  system: string | undefined;
  apiKey: string;
}

// Dispatched via rewrites: /api/anthropic, /api/openai, /api/openrouter → /api/llm?provider=X
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 40))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const provider = (req.query.provider as string) || "anthropic";
  const { model, messages, max_tokens, system } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: "Too many messages" });
  }
  if (max_tokens !== undefined && (typeof max_tokens !== "number" || max_tokens < 1 || max_tokens > 4096)) {
    return res.status(400).json({ error: "Invalid max_tokens" });
  }

  // SEC-2: x-user-api-key is mandatory. No fallback to server key allowed.
  const apiKey = ((req.headers["x-user-api-key"] as string) || "").trim();
  if (!apiKey) return res.status(400).json({ error: "x-user-api-key header is required" });

  if (provider === "openai") {
    return handleOpenAI(req, res, { model, messages, max_tokens, system, apiKey });
  }
  if (provider === "openrouter") {
    return handleOpenRouter(req, res, { model, messages, max_tokens, system, apiKey });
  }
  // Default: anthropic
  return handleAnthropic(req, res, { model, messages, max_tokens, system, apiKey });
}

async function handleAnthropic(_req: ApiRequest, res: ApiResponse, { model, messages, max_tokens, system, apiKey }: LlmParams): Promise<void> {
  const safeModel = ANTHROPIC_MODELS.includes(model) ? model : ANTHROPIC_MODELS[0];
  const safeBody: Record<string, any> = {
    model: safeModel,
    max_tokens: max_tokens || 1000,
    messages,
  };
  if (system && typeof system === "string") safeBody.system = system.slice(0, 10000);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(safeBody),
  });

  const data: any = await response.json();
  res.status(response.status).json(data);
}

async function handleOpenAI(_req: ApiRequest, res: ApiResponse, { model, messages, max_tokens, system, apiKey }: LlmParams): Promise<void> {
  const safeModel = OPENAI_MODELS.includes(model) ? model : OPENAI_MODELS[0];

  // Convert Anthropic-style system param to OpenAI messages format
  const oaiMessages = system
    ? [{ role: "system", content: system.slice(0, 10000) }, ...messages]
    : messages;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: safeModel,
      max_tokens: max_tokens || 1000,
      messages: oaiMessages,
    }),
  });

  const data: any = await response.json();

  // Normalize OpenAI response to Anthropic shape so the frontend doesn't need to know the difference
  if (response.ok && data.choices?.[0]?.message?.content) {
    return res.status(200).json({
      content: [{ type: "text", text: data.choices[0].message.content }],
      model: safeModel,
    });
  }

  res.status(response.status).json(data);
}

async function handleOpenRouter(_req: ApiRequest, res: ApiResponse, { model, messages, max_tokens, system, apiKey }: LlmParams): Promise<void> {
  if (model && !OPENROUTER_MODELS.includes(model)) {
    return res.status(400).json({ error: "Model not allowed" });
  }

  // OpenRouter uses OpenAI-compatible format — system param becomes first message
  const orMessages = system
    ? [{ role: "system", content: system.slice(0, 10000) }, ...messages]
    : messages;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://openbrain.app",
      "X-Title": "OpenBrain",
    },
    body: JSON.stringify({
      model: model || "google/gemini-2.0-flash-exp:free",
      max_tokens: max_tokens || 1000,
      messages: orMessages,
      route: "fallback",
    }),
  });

  const data: any = await response.json();

  // Normalize to Anthropic shape so the frontend doesn't need to know the difference
  if (response.ok && data.choices?.[0]?.message?.content) {
    return res.status(200).json({
      content: [{ type: "text", text: data.choices[0].message.content }],
      model: data.model || model,
    });
  }

  res.status(response.status).json(data);
}
