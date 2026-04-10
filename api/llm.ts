import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

// Hardcoded server-side models — always used when no user key is provided
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
// GEMINI_MODEL: gemini-2.0-flash-lite is fast (<3s), free tier, multimodal — use this by default.
// gemma-4-31b-it is too slow (15-30s) and times out on Vercel's 10s function limit.
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.0-flash-lite").trim();

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
  if (action === "extract-file") return handleExtractFile(req, res);

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

  const userKey = ((req.headers["x-user-api-key"] as string) || "").trim();

  // No user key → always use hardcoded server Gemini (Gemma 4 31B)
  if (!userKey) {
    if (!GEMINI_API_KEY) return res.status(400).json({ error: "x-user-api-key header is required" });
    return handleGoogle(res, { messages, max_tokens, system });
  }

  const apiKey = userKey;
  if (provider === "openai") {
    return handleOpenAI(req, res, { model, messages, max_tokens, system, apiKey });
  }
  if (provider === "openrouter") {
    return handleOpenRouter(req, res, { model, messages, max_tokens, system, apiKey });
  }
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

async function handleGoogle(res: ApiResponse, { messages, max_tokens, system }: Pick<LlmParams, "messages" | "max_tokens" | "system">): Promise<void> {
  // Native generateContent API — works with Gemma and all Google models
  const contents = messages.map((m: any) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: Record<string, any> = {
    contents,
    generationConfig: { maxOutputTokens: max_tokens || 1000 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system.slice(0, 10000) }] };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data: any = await response.json();
  if (response.ok) {
    // Gemma 4 uses thinking mode — parts[0] is the reasoning chain (thought:true),
    // the actual answer is in the non-thought parts. Always read non-thought parts.
    const parts: any[] = data.candidates?.[0]?.content?.parts || [];
    const answerParts = parts.filter((p: any) => !p.thought);
    const text = answerParts.map((p: any) => p.text || "").join("").trim()
      || parts.map((p: any) => p.text || "").join("").trim(); // fallback: all parts
    return res.status(200).json({ content: [{ type: "text", text }], model: GEMINI_MODEL });
  }
  console.error("[google]", response.status, JSON.stringify(data));
  return res.status(response.status).json(data);
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
      usage: data.usage,
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
    }),
  });

  const data: any = await response.json();

  if (!response.ok) {
    console.error("[llm/openrouter] error", response.status, JSON.stringify(data));
    return res.status(response.status).json(data);
  }

  // Normalize to Anthropic shape so the frontend doesn't need to know the difference
  if (data.choices?.[0]?.message?.content) {
    return res.status(200).json({
      content: [{ type: "text", text: data.choices[0].message.content }],
      model: data.model || safeModel,
      usage: data.usage,
    });
  }

  res.status(response.status).json(data);
}

// ── File extraction ──────────────────────────────────────────────────────────

const MAX_FILE_B64 = 20 * 1024 * 1024;
const EXTRACT_PROMPT = "Extract all text and information from this file. Preserve structure. Output only the extracted content, no commentary.";

async function handleExtractFile(req: ApiRequest, res: ApiResponse): Promise<void> {
  let apiKey = ((req.headers["x-user-api-key"] as string) || "").trim();
  let provider = ((req.headers["x-provider"] as string) || "openrouter").trim();
  let model = ((req.headers["x-model"] as string) || "").trim();

  // No user key → use hardcoded server Gemini
  if (!apiKey) {
    if (!GEMINI_API_KEY) return res.status(400).json({ error: "x-user-api-key required" });
    apiKey = GEMINI_API_KEY;
    provider = "google";
    model = GEMINI_MODEL;
  }
  const { filename, fileData, mimeType } = req.body as { filename?: string; fileData?: string; mimeType?: string };

  if (!fileData || typeof fileData !== "string") return res.status(400).json({ error: "fileData required" });
  if (!mimeType) return res.status(400).json({ error: "mimeType required" });
  if (fileData.length > MAX_FILE_B64) return res.status(413).json({ error: "File too large (max ~15 MB)" });

  try {
    if (provider === "google") {
      // Native generateContent API — supports images and all Gemma/Gemini models
      const usedModel = model || GEMINI_MODEL;
      const parts: any[] = [];
      if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
        parts.push({ inlineData: { mimeType, data: fileData } });
      }
      parts.push({ text: EXTRACT_PROMPT });
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: 4096 } }),
        }
      );
      const d: any = await r.json();
      if (!r.ok) { console.error("[extract-file/google]", r.status, JSON.stringify(d)); return res.status(r.status).json(d); }
      const xParts: any[] = d.candidates?.[0]?.content?.parts || [];
      const xAnswer = xParts.filter((p: any) => !p.thought).map((p: any) => p.text || "").join("").trim()
        || xParts.map((p: any) => p.text || "").join("").trim();
      return res.status(200).json({ text: xAnswer });
    }

    if (provider === "anthropic") {
      const block = mimeType.startsWith("image/")
        ? { type: "image", source: { type: "base64", media_type: mimeType, data: fileData } }
        : { type: "document", source: { type: "base64", media_type: mimeType, data: fileData } };
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: model || "claude-haiku-4-5-20251001", max_tokens: 4096, messages: [{ role: "user", content: [block, { type: "text", text: EXTRACT_PROMPT }] }] }),
      });
      const d: any = await r.json();
      return res.status(r.ok ? 200 : r.status).json(r.ok ? { text: d.content?.[0]?.text || "" } : d);
    }

    // OpenRouter / OpenAI-compatible
    const fileBlock = mimeType.startsWith("image/")
      ? { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileData}` } }
      : { type: "file", file: { filename: filename || "file", file_data: `data:${mimeType};base64,${fileData}` } };
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, "HTTP-Referer": "https://everionmind.com", "X-Title": "Everion" },
      body: JSON.stringify({ model: model || "google/gemma-3-27b-it", max_tokens: 4096, messages: [{ role: "user", content: [fileBlock, { type: "text", text: EXTRACT_PROMPT }] }] }),
    });
    const d: any = await r.json();
    if (!r.ok) { console.error("[extract-file/openrouter]", r.status, JSON.stringify(d)); return res.status(r.status).json(d); }
    return res.status(200).json({ text: d.choices?.[0]?.message?.content || "" });
  } catch (e: any) {
    console.error("[extract-file]", e);
    return res.status(502).json({ error: e.message || "Extraction failed" });
  }
}

// ── Transcribe (merged from api/transcribe.ts) ──────────────────────────────
// Rate limit: 10/min (enforced above in main handler)

const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // 24 MB

async function handleTranscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Always use server Groq key — no user key fallback
  if (!GROQ_API_KEY) return res.status(500).json({ error: "Voice transcription not configured (missing GROQ_API_KEY)" });

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

  const apiKey = GROQ_API_KEY;
  const apiUrl = "https://api.groq.com/openai/v1/audio/transcriptions";
  const model = "whisper-large-v3-turbo";

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

  const providerName = "Groq";
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
  return res.status(200).json({ text: data.text || "", audioBytes: audioBuffer.byteLength, provider: "groq", model });
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
