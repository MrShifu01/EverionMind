import { randomUUID } from "crypto";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { SERVER_PROMPTS } from "./_lib/prompts.js";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { retrieveEntries } from "./_lib/retrievalCore.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";
import { rebuildConceptGraph } from "./_lib/retrievalCore.js";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();
const SB_URL = (process.env.SUPABASE_URL || "").trim();
const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const sbHdrs = () => ({ "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` });

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
  if (action === "chat") return handleChat(req, res, user);

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

// ── Chat agent (function calling) ───────────────────────────────────────────

const CHAT_TOOLS = [
  {
    name: "retrieve_memory",
    description: "Full semantic retrieval using vector search + keyword expansion + graph boost. Use this for most queries — it finds the most relevant entries.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language question or topic to search for" },
        limit: { type: "number", description: "Max entries to return (1–50, default 15)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_upcoming",
    description: "Return entries with upcoming due dates, deadlines, expiry dates, or event dates.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "Look-ahead window in days (1–365, default 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_entry",
    description: "Fetch a single entry by its UUID.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Entry UUID" } },
      required: ["id"],
    },
  },
  {
    name: "search_entries",
    description: "Low-level vector-only search. Use retrieve_memory for most queries.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_entry",
    description: "Save new information to the user's knowledge base.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short descriptive title (max 200 chars)" },
        content: { type: "string", description: "Full content to store" },
        type: { type: "string", description: "Entry type: note, person, recipe, task, event, document, idea, contact. Defaults to note." },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_entry",
    description: "Update an existing entry's title, content, tags, or type. Only call after user has confirmed the change.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entry UUID to update" },
        title: { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content (optional)" },
        type: { type: "string", description: "New entry type (optional)" },
        tags: { type: "array", items: { type: "string" }, description: "New tags array (optional, replaces existing)" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_entry",
    description: "Soft-delete an entry. Only call after user has confirmed the deletion.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entry UUID to delete" },
      },
      required: ["id"],
    },
  },
];

const DATE_FIELDS = ["due_date", "deadline", "expiry_date", "event_date"] as const;

async function execTool(name: string, args: Record<string, any>, userId: string, brainId: string): Promise<unknown> {
  if (name === "retrieve_memory") {
    return retrieveEntries(args.query, brainId, GEMINI_API_KEY, Math.min(Math.max(1, args.limit || 15), 50));
  }
  if (name === "search_entries") {
    const embedding = await generateEmbedding(args.query, GEMINI_API_KEY);
    if (!embedding) return { entries: [] };
    const r = await fetch(`${SB_URL}/rest/v1/rpc/match_entries`, {
      method: "POST",
      headers: sbHdrs(),
      body: JSON.stringify({ query_embedding: `[${embedding.join(",")}]`, p_brain_id: brainId, match_count: 10 }),
    });
    return r.ok ? r.json() : { entries: [] };
  }
  if (name === "get_entry") {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,type,tags,metadata,created_at,updated_at`,
      { headers: sbHdrs() },
    );
    if (!r.ok) return { error: "Failed to fetch entry" };
    const rows: any[] = await r.json();
    return rows[0] || { error: "Entry not found" };
  }
  if (name === "get_upcoming") {
    const days = Math.min(Math.max(1, args.days || 30), 365);
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const fetches = await Promise.all(
      DATE_FIELDS.map(async (field) => {
        const params = new URLSearchParams({
          brain_id: `eq.${brainId}`, deleted_at: "is.null",
          [`metadata->>${field}`]: `gte.${today}`,
          select: "id,title,type,tags,content,metadata,created_at", limit: "100",
        });
        const r = await fetch(`${SB_URL}/rest/v1/entries?${params}&metadata->>${field}=lte.${future}`, { headers: sbHdrs() });
        if (!r.ok) return [];
        const rows: any[] = await r.json();
        return rows.map((e) => ({ ...e, _date_field: field }));
      }),
    );
    const seen = new Set<string>(); const merged: any[] = [];
    for (const rows of fetches) for (const row of rows) if (!seen.has(row.id)) { seen.add(row.id); merged.push(row); }
    merged.sort((a, b) => {
      const aD = DATE_FIELDS.map((f) => a.metadata?.[f]).filter(Boolean).sort()[0] ?? "9999";
      const bD = DATE_FIELDS.map((f) => b.metadata?.[f]).filter(Boolean).sort()[0] ?? "9999";
      return aD.localeCompare(bD);
    });
    return { entries: merged, days, from: today, to: future };
  }
  if (name === "create_entry") {
    const safeTitle = String(args.title || "").trim().slice(0, 200);
    const safeContent = String(args.content || "").slice(0, 10000);
    const safeType = String(args.type || "note").trim().slice(0, 50).toLowerCase();
    const safeTags = Array.isArray(args.tags) ? args.tags.slice(0, 20).map((t: any) => String(t).slice(0, 50)) : [];
    let embedding: number[] | null = null;
    if (GEMINI_API_KEY) embedding = await generateEmbedding(buildEntryText({ title: safeTitle, content: safeContent, tags: safeTags }), GEMINI_API_KEY);
    const id = (randomUUID as () => string)();
    const r = await fetch(`${SB_URL}/rest/v1/entries`, {
      method: "POST",
      headers: { ...sbHdrs(), Prefer: "return=representation" },
      body: JSON.stringify({ id, user_id: userId, brain_id: brainId, title: safeTitle, content: safeContent, type: safeType, tags: safeTags, embedding, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return { error: `Failed to create: ${await r.text().catch(() => r.status)}` };
    const rows: any[] = await r.json();
    if (GEMINI_API_KEY) rebuildConceptGraph(brainId, GEMINI_API_KEY).catch(() => {});
    return rows[0];
  }
  if (name === "update_entry") {
    const entryRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,tags&limit=1`,
      { headers: sbHdrs() },
    );
    if (!entryRes.ok) return { error: "Failed to fetch entry" };
    const rows: any[] = await entryRes.json();
    if (!rows.length) return { error: "Entry not found" };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (args.title !== undefined) patch.title = String(args.title).trim().slice(0, 200);
    if (args.content !== undefined) patch.content = String(args.content).slice(0, 10000);
    if (args.type !== undefined) patch.type = String(args.type).trim().slice(0, 50).toLowerCase();
    if (args.tags !== undefined) patch.tags = (args.tags as any[]).slice(0, 20).map((t) => String(t).slice(0, 50));
    if (GEMINI_API_KEY && (args.title !== undefined || args.content !== undefined || args.tags !== undefined)) {
      const merged = { title: (patch.title ?? rows[0].title) as string, content: (patch.content ?? rows[0].content) as string, tags: (patch.tags ?? rows[0].tags ?? []) as string[] };
      const emb = await generateEmbedding(buildEntryText(merged), GEMINI_API_KEY);
      if (emb) patch.embedding = emb;
    }
    const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}`, {
      method: "PATCH",
      headers: { ...sbHdrs(), Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) return { error: `Update failed: ${await r.text().catch(() => r.status)}` };
    const updated: any[] = await r.json();
    if (GEMINI_API_KEY) rebuildConceptGraph(brainId, GEMINI_API_KEY).catch(() => {});
    return updated[0];
  }
  if (name === "delete_entry") {
    const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}`, {
      method: "PATCH",
      headers: { ...sbHdrs(), Prefer: "return=minimal" },
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    if (!r.ok) return { error: `Delete failed: ${await r.text().catch(() => r.status)}` };
    return { id: args.id, deleted: true };
  }
  return { error: `Unknown tool: ${name}` };
}

async function handleChat(req: ApiRequest, res: ApiResponse, user: any): Promise<void> {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "AI not configured" });

  const { message, brain_id, history = [], confirmed = false, pending_action } = req.body;
  if (!message || typeof message !== "string") return res.status(400).json({ error: "message required" });
  if (!brain_id || typeof brain_id !== "string") return res.status(400).json({ error: "brain_id required" });

  // If confirmed=true and there's a pending destructive action, execute it directly
  if (confirmed && pending_action?.tool && pending_action?.args) {
    try {
      const result = await execTool(pending_action.tool, pending_action.args, user.id, brain_id);
      const action = pending_action.tool === "delete_entry" ? "deleted" : "updated";
      return res.status(200).json({ reply: `Done — entry ${action}.`, tool_calls: [{ tool: pending_action.tool, result }] });
    } catch (e: any) {
      return res.status(200).json({ reply: `Failed: ${e.message}` });
    }
  }

  // Build contents array from history + new message
  const contents: any[] = [
    ...history.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const toolCalls: Array<{ tool: string; result: unknown }> = [];
  const MAX_ROUNDS = 5;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body: Record<string, any> = {
      contents,
      tools: [{ functionDeclarations: CHAT_TOOLS }],
      systemInstruction: { parts: [{ text: SERVER_PROMPTS.CHAT_AGENT }] },
      generationConfig: { maxOutputTokens: 2000 },
    };

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const gemData: any = await gemRes.json();
    if (!gemRes.ok) {
      console.error("[chat]", gemRes.status, JSON.stringify(gemData));
      return res.status(200).json({ reply: "Sorry, something went wrong. Please try again." });
    }

    const parts: any[] = gemData.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p: any) => p.functionCall);

    if (!funcCall) {
      // No function call — final text response
      const textParts = parts.filter((p: any) => !p.thought && p.text);
      const reply = textParts.map((p: any) => p.text).join("").trim() || parts.map((p: any) => p.text || "").join("").trim();
      return res.status(200).json({ reply, tool_calls: toolCalls });
    }

    const { name: toolName, args: toolArgs } = funcCall.functionCall;

    // Intercept destructive tools before confirmed
    if (!confirmed && (toolName === "update_entry" || toolName === "delete_entry")) {
      // Get entry title for the confirmation label
      let label = toolName === "delete_entry" ? `Delete entry (${toolArgs.id?.slice(0, 8)}…)` : `Update entry (${toolArgs.id?.slice(0, 8)}…)`;
      try {
        const entryRes = await fetch(
          `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(toolArgs.id)}&brain_id=eq.${encodeURIComponent(brain_id)}&select=title&limit=1`,
          { headers: sbHdrs() },
        );
        if (entryRes.ok) {
          const rows: any[] = await entryRes.json();
          if (rows[0]?.title) label = `${toolName === "delete_entry" ? "Delete" : "Update"} "${rows[0].title}"`;
        }
      } catch { /* non-fatal */ }

      // Get the model's confirmation message from parts text (if any) or generate one
      const confirmText = parts.filter((p: any) => p.text).map((p: any) => p.text).join("").trim()
        || (toolName === "delete_entry" ? `I'm about to delete this entry. Confirm?` : `I'm about to update this entry. Confirm?`);

      return res.status(200).json({
        reply: confirmText,
        pending_action: { tool: toolName, args: toolArgs, label },
      });
    }

    // Execute the tool
    let toolResult: unknown;
    try {
      toolResult = await execTool(toolName, toolArgs, user.id, brain_id);
    } catch (e: any) {
      toolResult = { error: e.message || "Tool execution failed" };
    }
    toolCalls.push({ tool: toolName, result: toolResult });

    // Add function call + response to contents for next round
    contents.push({ role: "model", parts: [{ functionCall: { name: toolName, args: toolArgs } }] });
    contents.push({ role: "user", parts: [{ functionResponse: { name: toolName, response: { result: toolResult } } }] });
  }

  // Hit max rounds — return what we have
  return res.status(200).json({ reply: "I ran into an issue completing that. Please try again.", tool_calls: toolCalls });
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
const EXTRACT_PROMPT = SERVER_PROMPTS.EXTRACT_FILE;

async function handleExtractFile(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "AI not configured" });

  const { filename: _filename, fileData, mimeType } = req.body as { filename?: string; fileData?: string; mimeType?: string };

  if (!fileData || typeof fileData !== "string") return res.status(400).json({ error: "fileData required" });
  if (!mimeType) return res.status(400).json({ error: "mimeType required" });
  if (fileData.length > MAX_FILE_B64) return res.status(413).json({ error: "File too large (max ~15 MB)" });

  try {
    const parts: any[] = [
      { inlineData: { mimeType, data: fileData } },
      { text: EXTRACT_PROMPT },
    ];
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
