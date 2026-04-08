import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

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

// OpenRouter model default — user may select any model via the UI;
// the server no longer whitelists models since the user supplies their own key
// and OpenRouter validates model names itself.
const OPENROUTER_DEFAULT_MODEL = "google/gemini-2.0-flash-lite:free";

interface LlmParams {
  model: string;
  messages: any[];
  max_tokens: number | undefined;
  system: string | undefined;
  apiKey: string;
}

// Dispatched via rewrites:
//   /api/anthropic, /api/openai, /api/openrouter → /api/llm?provider=X
//   /api/transcribe → /api/llm?action=transcribe
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = (req.query.action as string) || "";

  // Transcribe has a stricter rate limit (10/min vs 40/min for LLM)
  const limit = action === "transcribe" ? 10 : 40;
  if (!(await rateLimit(req, limit))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (action === "transcribe") return handleTranscribe(req, res);

  const provider = (req.query.provider as string) || "anthropic";
  const { model, messages, max_tokens, system } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: "Too many messages" });
  }

  // S1-5: Validate each message has only role (user/assistant) and string content
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      return res.status(400).json({ error: "Invalid message format" });
    }
    if (!["user", "assistant"].includes(msg.role)) {
      return res.status(400).json({ error: "Message role must be 'user' or 'assistant'" });
    }
    if (typeof msg.content !== "string") {
      // Reject image blocks, tool_use blocks, arrays, etc.
      return res.status(400).json({ error: "Message content must be plain text strings only" });
    }
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
  // No server-side model whitelist — the user supplies their own API key so
  // OpenRouter validates model names. Sanitise only: must be a non-empty string
  // under 200 chars with no control characters.
  const safeModel = (model && typeof model === "string" && model.length <= 200 && !/[\x00-\x1f]/.test(model))
    ? model
    : OPENROUTER_DEFAULT_MODEL;

  // OpenRouter uses OpenAI-compatible format — system param becomes first message
  const orMessages = system
    ? [{ role: "system", content: system.slice(0, 10000) }, ...messages]
    : messages;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://everionmind.com",
      "X-Title": "Everion",
    },
    body: JSON.stringify({
      model: safeModel,
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
      model: data.model || safeModel,
    });
  }

  res.status(response.status).json(data);
}

// ── Transcribe (merged from api/transcribe.ts) ──────────────────────────────
// Rate limit: 10/min (enforced above in main handler)

const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // 24 MB

async function handleTranscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  const groqKey = ((req.headers["x-groq-api-key"] as string) || "").trim();
  const openAIKey = ((req.headers["x-user-api-key"] as string) || "").trim();

  if (!groqKey && !openAIKey) {
    return res.status(400).json({ error: "Provide a Groq or OpenAI API key for voice transcription" });
  }

  const { audio, mimeType, language } = req.body;

  if (!audio || typeof audio !== "string") {
    return res.status(400).json({ error: "audio (base64 string) required" });
  }
  if (!mimeType || typeof mimeType !== "string") {
    return res.status(400).json({ error: "mimeType required" });
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audio, "base64");
  } catch {
    return res.status(400).json({ error: "Invalid base64 audio" });
  }

  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return res.status(413).json({ error: "Audio too large (max 24 MB)" });
  }

  const useGroq = !!groqKey;
  const apiKey = useGroq ? groqKey : openAIKey;
  const apiUrl = useGroq
    ? "https://api.groq.com/openai/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
  const model = useGroq ? "whisper-large-v3-turbo" : "whisper-1";

  const ext = _mimeToExt(mimeType) || "webm";
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`;
  const CRLF = "\r\n";

  const modelField = `--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}${model}`;
  const langField = language
    ? `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="language"${CRLF}${CRLF}${language}`
    : "";
  const responseFormatField = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="response_format"${CRLF}${CRLF}json`;
  const fileHeader = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="audio.${ext}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
  const closingBoundary = `${CRLF}--${boundary}--`;

  const enc = new TextEncoder();
  const parts: Uint8Array[] = [
    enc.encode(modelField),
    enc.encode(langField),
    enc.encode(responseFormatField),
    enc.encode(fileHeader),
    audioBuffer,
    enc.encode(closingBoundary),
  ];

  const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.byteLength; }

  const providerName = useGroq ? "Groq" : "OpenAI";
  let whisperRes: Response;
  try {
    whisperRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
  } catch (err: any) {
    console.error(`[transcribe] ${providerName} network error:`, err.message);
    return res.status(502).json({ error: `Failed to reach ${providerName} transcription API` });
  }

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    console.error(`[transcribe] ${providerName} API error ${whisperRes.status}: ${errText}`);
    return res.status(whisperRes.status === 401 ? 401 : 502).json({
      error: whisperRes.status === 401 ? `Invalid ${providerName} API key` : "Transcription failed",
    });
  }

  const data: any = await whisperRes.json();
  return res.status(200).json({ text: data.text || "" });
}

function _mimeToExt(mime: string): string | null {
  const m = mime.split(";")[0].trim();
  const map: Record<string, string> = {
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/wave": "wav",
    "audio/x-wav": "wav", "audio/flac": "flac", "audio/m4a": "m4a",
  };
  return map[m] || null;
}
