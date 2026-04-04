/**
 * POST /api/transcribe
 *
 * Transcribes audio using OpenAI Whisper-1.
 * Requires the user's OpenAI API key (X-User-Api-Key header).
 *
 * Body (JSON):
 *   audio:    string — base64-encoded audio (WebM/Opus, MP4, WAV, MP3, etc.)
 *   mimeType: string — MIME type of the audio (e.g. "audio/webm;codecs=opus")
 *   language: string? — BCP-47 language code hint (e.g. "en", "af"). Optional.
 *
 * Response:
 *   { text: string }    — transcript on success
 *   { error: string }   — on failure
 *
 * Rate limit: 10 req/min (Whisper is expensive)
 */
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // 24 MB (Whisper API limit is 25 MB)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 10))) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const userKey = (req.headers["x-user-api-key"] || "").trim();
  if (!userKey) return res.status(400).json({ error: "X-User-Api-Key header required (OpenAI key)" });

  const { audio, mimeType, language } = req.body;

  if (!audio || typeof audio !== "string") {
    return res.status(400).json({ error: "audio (base64 string) required" });
  }
  if (!mimeType || typeof mimeType !== "string") {
    return res.status(400).json({ error: "mimeType required" });
  }

  // Decode base64 → buffer
  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audio, "base64");
  } catch {
    return res.status(400).json({ error: "Invalid base64 audio" });
  }

  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return res.status(413).json({ error: "Audio too large (max 24 MB)" });
  }

  // Derive a filename extension from the MIME type so Whisper can detect format
  const ext = _mimeToExt(mimeType) || "webm";

  // Build multipart/form-data manually — no npm dependency needed
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`;
  const CRLF = "\r\n";

  const modelField = `--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}whisper-1`;
  const langField = language
    ? `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="language"${CRLF}${CRLF}${language}`
    : "";
  const responseFormatField = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="response_format"${CRLF}${CRLF}json`;
  const fileHeader = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="audio.${ext}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
  const closingBoundary = `${CRLF}--${boundary}--`;

  const enc = new TextEncoder();
  const parts = [
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

  let whisperRes;
  try {
    whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
  } catch (err) {
    console.error("[transcribe] Whisper network error:", err.message);
    return res.status(502).json({ error: "Failed to reach OpenAI Whisper API" });
  }

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    console.error(`[transcribe] Whisper API error ${whisperRes.status}: ${errText}`);
    return res.status(whisperRes.status === 401 ? 401 : 502).json({
      error: whisperRes.status === 401 ? "Invalid OpenAI API key" : "Whisper transcription failed",
    });
  }

  const data = await whisperRes.json();
  return res.status(200).json({ text: data.text || "" });
}

function _mimeToExt(mime) {
  const m = mime.split(";")[0].trim();
  const map = {
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
