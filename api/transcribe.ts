/**
 * POST /api/transcribe
 *
 * Transcribes audio using OpenAI Whisper-1 or Groq whisper-large-v3-turbo.
 *
 * Headers:
 *   X-User-Api-Key:  OpenAI key  (optional if Groq key provided)
 *   X-Groq-Api-Key:  Groq key    (optional if OpenAI key provided)
 *
 * Body (JSON):
 *   audio:    string — base64-encoded audio (WebM/Opus, MP4, WAV, MP3, etc.)
 *   mimeType: string — MIME type of the audio (e.g. "audio/webm;codecs=opus")
 *   language: string? — BCP-47 language code hint (e.g. "en", "af"). Optional.
 *
 * Priority: Groq key → OpenAI key (Groq is faster and has a free tier)
 *
 * Response:
 *   { text: string }    — transcript on success
 *   { error: string }   — on failure
 *
 * Rate limit: 10 req/min
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // 24 MB

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 10))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

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

  // Decode base64 → buffer
  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audio, "base64");
  } catch {
    return res.status(400).json({ error: "Invalid base64 audio" });
  }

  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return res.status(413).json({ error: "Audio too large (max 24 MB)" });
  }

  // Pick provider: prefer Groq (faster, free tier)
  const useGroq = !!groqKey;
  const apiKey = useGroq ? groqKey : openAIKey;
  const apiUrl = useGroq
    ? "https://api.groq.com/openai/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
  const model = useGroq ? "whisper-large-v3-turbo" : "whisper-1";

  // Derive a filename extension from the MIME type so Whisper can detect format
  const ext = _mimeToExt(mimeType) || "webm";

  // Build multipart/form-data manually — no npm dependency needed
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
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }

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
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
  };
  return map[m] || null;
}
