import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();

// Dispatched via rewrites:
//   /api/gemini → /api/llm
//   /api/transcribe → /api/llm?action=transcribe
//   /api/extract-file → /api/llm?action=extract-file
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = (req.query.action as string) || "";

  const limit = action === "transcribe" ? 10 : 40;
  if (!(await rateLimit(req, limit))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (action === "transcribe") return handleTranscribe(req, res);
  if (action === "extract-file") return handleExtractFile(req, res);

  const { messages, max_tokens, system } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: "Too many messages" });
  }
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      return res.status(400).json({ error: "Invalid message format" });
    }
    if (!["user", "assistant"].includes(msg.role)) {
      return res.status(400).json({ error: "Message role must be 'user' or 'assistant'" });
    }
    if (typeof msg.content !== "string") {
      return res.status(400).json({ error: "Message content must be plain text strings only" });
    }
  }
  if (max_tokens !== undefined && (typeof max_tokens !== "number" || max_tokens < 1 || max_tokens > 4096)) {
    return res.status(400).json({ error: "Invalid max_tokens" });
  }

  if (!GEMINI_API_KEY) return res.status(500).json({ error: "AI not configured" });
  return handleGemini(res, { messages, max_tokens, system });
}

async function handleGemini(res: ApiResponse, { messages, max_tokens, system }: { messages: any[]; max_tokens?: number; system?: string }): Promise<void> {
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
    const parts: any[] = data.candidates?.[0]?.content?.parts || [];
    const answerParts = parts.filter((p: any) => !p.thought);
    const text = answerParts.map((p: any) => p.text || "").join("").trim()
      || parts.map((p: any) => p.text || "").join("").trim();
    return res.status(200).json({ content: [{ type: "text", text }], model: GEMINI_MODEL });
  }
  console.error("[gemini]", response.status, JSON.stringify(data));
  return res.status(response.status).json(data);
}

// ── File extraction ──────────────────────────────────────────────────────────

const MAX_FILE_B64 = 20 * 1024 * 1024;
const EXTRACT_PROMPT = "Extract all text and information from this file. Preserve structure. Output only the extracted content, no commentary.";

async function handleExtractFile(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "AI not configured" });

  const { filename: _filename, fileData, mimeType } = req.body as { filename?: string; fileData?: string; mimeType?: string };

  if (!fileData || typeof fileData !== "string") return res.status(400).json({ error: "fileData required" });
  if (!mimeType) return res.status(400).json({ error: "mimeType required" });
  if (fileData.length > MAX_FILE_B64) return res.status(413).json({ error: "File too large (max ~15 MB)" });

  try {
    const parts: any[] = [];
    if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
      parts.push({ inlineData: { mimeType, data: fileData } });
    }
    parts.push({ text: EXTRACT_PROMPT });
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: 4096 } }),
      }
    );
    const d: any = await r.json();
    if (!r.ok) { console.error("[extract-file]", r.status, JSON.stringify(d)); return res.status(r.status).json(d); }
    const xParts: any[] = d.candidates?.[0]?.content?.parts || [];
    const xAnswer = xParts.filter((p: any) => !p.thought).map((p: any) => p.text || "").join("").trim()
      || xParts.map((p: any) => p.text || "").join("").trim();
    return res.status(200).json({ text: xAnswer });
  } catch (e: any) {
    console.error("[extract-file]", e);
    return res.status(502).json({ error: e.message || "Extraction failed" });
  }
}

// ── Transcribe (Groq Whisper) ────────────────────────────────────────────────

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

async function handleTranscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!GROQ_API_KEY) return res.status(500).json({ error: "Voice transcription not configured" });

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

  let whisperRes: Response;
  try {
    whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
  } catch (err: any) {
    console.error("[transcribe] network error:", err.message);
    return res.status(502).json({ error: "Failed to reach transcription service" });
  }

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    console.error(`[transcribe] error ${whisperRes.status}: ${errText}`);
    return res.status(whisperRes.status === 401 ? 401 : 502).json({
      error: whisperRes.status === 401 ? "Transcription service authentication failed" : "Transcription failed",
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
