import { randomUUID } from "crypto";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { SERVER_PROMPTS } from "./_lib/prompts.js";
import { withAuth, type AuthedUser } from "./_lib/withAuth.js";
import { retrieveEntries, rebuildConceptGraph } from "./_lib/retrievalCore.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { enrichInline } from "./_lib/enrich.js";
import { sbHeaders } from "./_lib/sbHeaders.js";
import {
  selectProvider,
  getAdapter,
  type UserAISettings,
} from "./_lib/providers/select.js";
import type { ProviderConfig } from "./_lib/providers/types.js";
import { extractFile as geminiExtractFile } from "./_lib/providers/gemini.js";
import { runChat, type ConfirmPolicy } from "./_lib/providers/chatRunner.js";
import { checkAndIncrement } from "./_lib/usage.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { getReqId, createLogger } from "./_lib/logger.js";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

// ── Environment ──────────────────────────────────────────────────────────────

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
const GEMINI_DEFAULT_MODEL = (process.env.GEMINI_PRO_MODEL || "gemini-2.5-flash").trim();
const VALID_GEMINI_MODELS = new Set([
  "gemini-2.0-flash-lite", "gemini-2.0-flash",
  "gemini-2.5-flash-lite", "gemini-2.5-flash",
  "gemini-1.5-flash", "gemini-1.5-pro",
]);
const sanitizeGeminiModel = (m: string | null | undefined): string =>
  m && VALID_GEMINI_MODELS.has(m) ? m : GEMINI_DEFAULT_MODEL;

const SB_URL = (process.env.SUPABASE_URL || "").trim();

// ── Provider resolution ──────────────────────────────────────────────────────

interface ChatBody {
  message: string;
  brain_id: string;
  history: any[];
  confirmed: boolean;
  pending_action?: { tool: string; args: Record<string, any>; label: string };
  learnings?: string;
}

async function resolveProvider(userId: string, forChat = false): Promise<ProviderConfig | null> {
  const r = await fetch(
    `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(userId)}&select=plan,anthropic_key,openai_key,gemini_key,anthropic_model,openai_model,gemini_byok_model&limit=1`,
    { headers: sbHeaders() },
  );
  if (!r.ok) return null;
  const rows: UserAISettings[] = await r.json();

  return selectProvider(rows[0], {
    forChat,
    managed: GEMINI_API_KEY
      ? {
          key: GEMINI_API_KEY,
          starterModel:     (process.env.GEMINI_STARTER_MODEL      || "gemini-2.0-flash-lite").trim(),
          starterChatModel: (process.env.GEMINI_STARTER_CHAT_MODEL || "gemini-2.5-flash").trim(),
          proModel:         (process.env.GEMINI_PRO_MODEL          || "gemini-2.5-flash").trim(),
          proChatModel:     (process.env.GEMINI_PRO_CHAT_MODEL     || "gemini-2.5-flash").trim(),
        }
      : undefined,
    sanitizeGeminiModel,
  });
}

// File extraction always uses Gemini (BYOK Gemini preferred, server fallback)
async function resolveGeminiKey(userId: string): Promise<string> {
  const r = await fetch(
    `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(userId)}&select=gemini_key&limit=1`,
    { headers: sbHeaders() },
  );
  if (r.ok) {
    const rows: any[] = await r.json();
    if (rows[0]?.gemini_key) return rows[0].gemini_key;
  }
  return GEMINI_API_KEY;
}

async function resolveSettingsRaw(userId: string): Promise<{ plan: string; hasKey: boolean }> {
  const r = await fetch(
    `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(userId)}&select=plan,anthropic_key,openai_key,gemini_key&limit=1`,
    { headers: sbHeaders() },
  );
  if (!r.ok) return { plan: "free", hasKey: false };
  const [row] = await r.json();
  return {
    plan: row?.plan ?? "free",
    hasKey: !!(row?.anthropic_key || row?.openai_key || row?.gemini_key),
  };
}

// ── Tool declarations ─────────────────────────────────────────────────────────

const CHAT_TOOLS = [
  {
    name: "retrieve_memory",
    description: "Full semantic retrieval using vector search + keyword expansion + graph boost. Use this for most queries — it finds the most relevant entries.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Natural language question or topic to search for" }, limit: { type: "number", description: "Max entries to return (1–50, default 15)" } }, required: ["query"] },
  },
  {
    name: "get_upcoming",
    description: "Return entries with upcoming due dates, deadlines, expiry dates, or event dates.",
    parameters: { type: "object", properties: { days: { type: "number", description: "Look-ahead window in days (1–365, default 30)" } }, required: [] },
  },
  {
    name: "get_entry",
    description: "Fetch a single entry by its UUID.",
    parameters: { type: "object", properties: { id: { type: "string", description: "Entry UUID" } }, required: ["id"] },
  },
  {
    name: "search_entries",
    description: "Low-level vector-only search. Use retrieve_memory for most queries.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Natural language search query" } }, required: ["query"] },
  },
  {
    name: "create_entry",
    description: "Save new information to the user's knowledge base.",
    parameters: { type: "object", properties: { title: { type: "string", description: "Short descriptive title (max 200 chars)" }, content: { type: "string", description: "Full content to store" }, type: { type: "string", description: "Entry type: note, person, recipe, task, event, document, idea, contact. Defaults to note." }, tags: { type: "array", items: { type: "string" }, description: "Optional tags" } }, required: ["title", "content"] },
  },
  {
    name: "update_entry",
    description: "Update an existing entry's title, content, tags, or type. Only call after user has confirmed the change.",
    parameters: { type: "object", properties: { id: { type: "string", description: "Entry UUID to update" }, title: { type: "string", description: "New title (optional)" }, content: { type: "string", description: "New content (optional)" }, type: { type: "string", description: "New entry type (optional)" }, tags: { type: "array", items: { type: "string" }, description: "New tags array (optional, replaces existing)" } }, required: ["id"] },
  },
  {
    name: "delete_entry",
    description: "Soft-delete an entry. Only call after user has confirmed the deletion.",
    parameters: { type: "object", properties: { id: { type: "string", description: "Entry UUID to delete" } }, required: ["id"] },
  },
];

const DATE_FIELDS = ["due_date", "deadline", "expiry_date", "event_date"] as const;
const DESTRUCTIVE_TOOLS = new Set(["update_entry", "delete_entry"]);

// ── Tool execution ────────────────────────────────────────────────────────────

async function execTool(name: string, args: Record<string, any>, userId: string, brainId: string): Promise<unknown> {
  if (name === "retrieve_memory") {
    return retrieveEntries(args.query, brainId, GEMINI_API_KEY, Math.min(Math.max(1, args.limit || 15), 50));
  }
  if (name === "search_entries") {
    const embedding = await generateEmbedding(args.query, GEMINI_API_KEY);
    if (!embedding) return { entries: [] };
    const r = await fetch(`${SB_URL}/rest/v1/rpc/match_entries`, {
      method: "POST", headers: sbHeaders(),
      body: JSON.stringify({ query_embedding: `[${embedding.join(",")}]`, p_brain_id: brainId, match_count: 10 }),
    });
    return r.ok ? r.json() : { entries: [] };
  }
  if (name === "get_entry") {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,type,tags,metadata,created_at,updated_at`,
      { headers: sbHeaders() },
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
        const params = new URLSearchParams({ brain_id: `eq.${brainId}`, deleted_at: "is.null", [`metadata->>${field}`]: `gte.${today}`, select: "id,title,type,tags,content,metadata,created_at", limit: "100" });
        const r = await fetch(`${SB_URL}/rest/v1/entries?${params}&metadata->>${field}=lte.${future}`, { headers: sbHeaders() });
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
      method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({ id, user_id: userId, brain_id: brainId, title: safeTitle, content: safeContent, type: safeType, tags: safeTags, embedding: embedding ? `[${embedding.join(",")}]` : null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return { error: `Failed to create: ${await r.text().catch(() => r.status)}` };
    const rows: any[] = await r.json();
    if (GEMINI_API_KEY) rebuildConceptGraph(brainId, GEMINI_API_KEY).catch(() => {});
    enrichInline(id, userId).catch(() => {});
    return rows[0];
  }
  if (name === "update_entry") {
    const entryRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,tags&limit=1`,
      { headers: sbHeaders() },
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
      if (emb) patch.embedding = `[${emb.join(",")}]`;
    }
    const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}`, {
      method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(patch),
    });
    if (!r.ok) return { error: `Update failed: ${await r.text().catch(() => r.status)}` };
    const updated: any[] = await r.json();
    if (GEMINI_API_KEY) rebuildConceptGraph(brainId, GEMINI_API_KEY).catch(() => {});
    enrichInline(args.id, userId).catch(() => {});
    return updated[0];
  }
  if (name === "delete_entry") {
    const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" }, body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    if (!r.ok) return { error: `Delete failed: ${await r.text().catch(() => r.status)}` };
    return { id: args.id, deleted: true };
  }
  return { error: `Unknown tool: ${name}` };
}

async function fetchEntryTitle(entryId: string, brainId: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&brain_id=eq.${encodeURIComponent(brainId)}&select=title&limit=1`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return null;
    const rows: any[] = await r.json();
    return rows[0]?.title ?? null;
  } catch { return null; }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleCompletion(
  res: ApiResponse,
  opts: { messages: any[]; max_tokens?: number; system?: string },
  provider: ProviderConfig,
): Promise<void> {
  const adapter = getAdapter(provider.provider);
  const result = await adapter.completion(opts, provider);
  if (!result.ok) {
    console.error(`[llm/${provider.provider}]`, result.status, JSON.stringify(result.error));
    return res.status(result.status).json(result.error);
  }
  return res.status(200).json({ content: [{ type: "text", text: result.text ?? "" }], model: provider.model });
}

async function auditToolCalls(
  userId: string,
  brainId: string,
  reqId: string,
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>,
): Promise<void> {
  if (!toolCalls.length) return;
  const rows = toolCalls.map((tc) => ({
    user_id: userId,
    action: `chat:${tc.tool}`,
    request_id: reqId,
    metadata: { tool: tc.tool, brain_id: brainId, args_summary: JSON.stringify(tc.args).slice(0, 500) },
  }));
  await fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function handleChat(
  req: ApiRequest,
  res: ApiResponse,
  user: AuthedUser,
  provider: ProviderConfig,
  reqId: string,
  quotaCtx?: { plan: string; hasKey: boolean },
): Promise<void> {
  const log = createLogger(reqId, { user_id: user.id });
  const t0 = Date.now();
  const { message, brain_id, history = [], confirmed = false, pending_action, learnings } = req.body as ChatBody;
  if (!message || typeof message !== "string") { res.status(400).json({ error: "message required" }); return; }
  if (!brain_id || typeof brain_id !== "string") { res.status(400).json({ error: "brain_id required" }); return; }

  const brainAccess = await checkBrainAccess(user.id, brain_id);
  if (!brainAccess) { res.status(403).json({ error: "Forbidden" }); return; }

  const safeHistory = (Array.isArray(history) ? history : [])
    .filter((m: any) => typeof m?.content === "string" && ["user", "assistant"].includes(m?.role))
    .slice(-20);

  const initialMessages = [
    ...safeHistory.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content as string })),
    { role: "user" as const, content: message },
  ];

  // Learnings are client-side (localStorage per brain). Truncate defensively.
  const systemPrompt = typeof learnings === "string" && learnings.trim()
    ? `${SERVER_PROMPTS.CHAT_AGENT}\n\n--- USER LEARNING CONTEXT ---\nThis user's past decisions reveal preferences. Adapt your output accordingly:\n${learnings.slice(0, 4000)}\n--- END LEARNING CONTEXT ---`
    : SERVER_PROMPTS.CHAT_AGENT;

  const confirmPolicy: ConfirmPolicy = {
    requiresConfirmation: (name) => DESTRUCTIVE_TOOLS.has(name),
    buildLabel: async (toolName, args) => {
      const verb = toolName === "delete_entry" ? "Delete" : "Update";
      const title = await fetchEntryTitle(args.id, brain_id);
      return title ? `${verb} "${title}"` : `${verb} entry (${String(args.id).slice(0, 8)}…)`;
    },
    defaultConfirmText: (toolName) =>
      toolName === "delete_entry"
        ? "I'm about to delete this entry. Confirm?"
        : "I'm about to update this entry. Confirm?",
  };

  const isManaged = provider.provider === "gemini-managed";
  const instrumentedExecTool = async (name: string, args: Record<string, any>) => {
    log.info("tool_call", { tool: name, brain_id });
    if (isManaged && quotaCtx) {
      checkAndIncrement(user.id, "chats", quotaCtx.plan, quotaCtx.hasKey).catch(() => {});
    }
    return execTool(name, args, user.id, brain_id);
  };

  const result = await runChat({
    config: provider,
    system: systemPrompt,
    tools: CHAT_TOOLS,
    initialMessages,
    confirmed,
    pendingAction: pending_action ? { tool: pending_action.tool, args: pending_action.args } : null,
    execTool: instrumentedExecTool,
    confirmPolicy,
  });

  auditToolCalls(user.id, brain_id, reqId, result.toolCalls).catch(() => {});

  const debug = {
    provider: provider.provider,
    model: provider.model,
    latency_ms: Date.now() - t0,
    rounds: result.rounds,
    ...(result.error ? { error: `${result.status}: ${JSON.stringify(result.error).slice(0, 500)}` } : {}),
  };

  if (!result.ok) {
    res.status(200).json({ reply: "Sorry, something went wrong. Please try again.", _debug: debug });
    return;
  }

  res.status(200).json({
    reply: result.reply,
    tool_calls: result.toolCalls,
    ...(result.pendingAction ? { pending_action: result.pendingAction } : {}),
    _debug: debug,
  });
}

// ── Server-side split fallback ────────────────────────────────────────────────

function parseServerEntries(raw: string): Array<Record<string, unknown>> {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const m = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  const candidate = m ? m[1] : cleaned;
  try {
    const parsed = JSON.parse(candidate);
    const arr: any[] = Array.isArray(parsed) ? parsed : (parsed?.title ? [parsed] : []);
    return arr
      .filter((e: any) => typeof e?.title === "string" && e.title.trim())
      .map((e: any) => ({
        title: String(e.title).trim().slice(0, 200),
        content: String(e.content || "").slice(0, 10000),
        type: String(e.type || "note").trim(),
        tags: Array.isArray(e.tags) ? e.tags.filter((t: any) => typeof t === "string").slice(0, 20) : [],
        ...(e.metadata && typeof e.metadata === "object" ? { metadata: e.metadata } : {}),
      }));
  } catch {
    return [];
  }
}

async function handleSplit(req: ApiRequest, res: ApiResponse, userId: string): Promise<void> {
  const { content } = req.body || {};
  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "content required" }); return;
  }
  const provider = await resolveProvider(userId);
  if (!provider) { res.status(200).json({ entries: [] }); return; }

  const adapter = getAdapter(provider.provider);
  const result = await adapter.completion(
    { messages: [{ role: "user", content: String(content).slice(0, 8000) }], system: SERVER_PROMPTS.CAPTURE, max_tokens: 2000 },
    provider,
  );
  const entries = result.ok && result.text ? parseServerEntries(result.text) : [];
  res.status(200).json({ entries });
}

// ── File extraction (always Gemini) ──────────────────────────────────────────

const MAX_FILE_B64 = 20 * 1024 * 1024;

async function handleExtractFile(req: ApiRequest, res: ApiResponse, geminiKey: string): Promise<void> {
  const { fileData, mimeType } = req.body as { fileData?: string; mimeType?: string };
  if (!fileData || typeof fileData !== "string") { res.status(400).json({ error: "fileData required" }); return; }
  if (!mimeType) { res.status(400).json({ error: "mimeType required" }); return; }
  if (fileData.length > MAX_FILE_B64) { res.status(413).json({ error: "File too large (max ~15 MB)" }); return; }

  try {
    const result = await geminiExtractFile(
      { fileData, mimeType },
      { model: GEMINI_DEFAULT_MODEL, key: geminiKey, prompt: SERVER_PROMPTS.EXTRACT_FILE },
    );
    if (!result.ok) {
      console.error("[extract-file]", result.status, JSON.stringify(result.error));
      res.status(result.status).json(result.error);
      return;
    }
    res.status(200).json({ text: result.text ?? "" });
  } catch (e: any) {
    console.error("[extract-file]", e);
    res.status(502).json({ error: e.message || "Extraction failed" });
  }
}

// ── Transcription (Groq Whisper) ─────────────────────────────────────────────

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

async function handleTranscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!GROQ_API_KEY) { res.status(500).json({ error: "Voice transcription not configured" }); return; }
  const { audio, mimeType, language } = req.body;
  if (!audio || typeof audio !== "string") { res.status(400).json({ error: "audio (base64 string) required" }); return; }
  if (!mimeType || typeof mimeType !== "string") { res.status(400).json({ error: "mimeType required" }); return; }
  let audioBuffer: Buffer;
  try { audioBuffer = Buffer.from(audio, "base64"); } catch { res.status(400).json({ error: "Invalid base64 audio" }); return; }
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) { res.status(413).json({ error: "Audio too large (max 24 MB)" }); return; }

  const model = "whisper-large-v3-turbo";
  const ext = _mimeToExt(mimeType) || "webm";
  const boundary = `----WebKitFormBoundary${crypto.randomUUID().replace(/-/g, "")}`;
  const CRLF = "\r\n";
  const modelField = `--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}${model}`;
  const langField = language ? `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="language"${CRLF}${CRLF}${language}` : "";
  const responseFormatField = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="response_format"${CRLF}${CRLF}json`;
  const fileHeader = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="audio.${ext}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
  const closingBoundary = `${CRLF}--${boundary}--`;
  const enc = new TextEncoder();
  const bodyParts: Uint8Array[] = [enc.encode(modelField), enc.encode(langField), enc.encode(responseFormatField), enc.encode(fileHeader), audioBuffer, enc.encode(closingBoundary)];
  const totalLength = bodyParts.reduce((sum, p) => sum + p.byteLength, 0);
  const bodyBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of bodyParts) { bodyBytes.set(part, offset); offset += part.byteLength; }

  let whisperRes: Response;
  try {
    whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: bodyBytes,
    });
  } catch (err: any) {
    console.error("[transcribe] network error:", err.message);
    res.status(502).json({ error: "Failed to reach transcription service" });
    return;
  }
  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    console.error(`[transcribe] error ${whisperRes.status}: ${errText}`);
    res.status(whisperRes.status === 401 ? 401 : 502).json({ error: whisperRes.status === 401 ? "Transcription service authentication failed" : "Transcription failed" });
    return;
  }
  const data: any = await whisperRes.json();
  res.status(200).json({ text: data.text || "", audioBytes: audioBuffer.byteLength, provider: "groq", model });
}

function _mimeToExt(mime: string): string | null {
  const m = mime.split(";")[0].trim();
  const map: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/wave": "wav", "audio/x-wav": "wav", "audio/flac": "flac", "audio/m4a": "m4a" };
  return map[m] || null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default withAuth(
  {
    methods: ["POST"],
    rateLimit: (req) => ((req.query.action as string) === "transcribe" ? 10 : 40),
    cacheControl: "no-store",
  },
  async ({ req, res, user }) => {
    const action = (req.query.action as string) || "";
    const reqId = getReqId(req);
    res.setHeader("x-request-id", reqId);

    // Per-action rate limits (separate budget per tool type)
    const actionLimits: Record<string, number> = { chat: 20, split: 15, complete: 30, transcribe: 10, "extract-file": 20 };
    const actionLimit = actionLimits[action];
    if (actionLimit && !(await rateLimit(req, actionLimit, 60_000, action))) {
      return res.status(429).json({ error: "Too many requests", action });
    }

    if (action === "transcribe") return handleTranscribe(req, res);

    if (action === "split") return handleSplit(req, res, user.id);

    if (action === "extract-file") {
      const geminiKey = await resolveGeminiKey(user.id);
      if (!geminiKey) return res.status(500).json({ error: "AI not configured" });
      return handleExtractFile(req, res, geminiKey);
    }

    if (action === "chat") {
      const provider = await resolveProvider(user.id, true);
      if (!provider) return res.status(402).json({ error: "no_ai_provider", message: "Add an API key in Settings or upgrade to Pro." });
      let quotaCtx: { plan: string; hasKey: boolean } | undefined;
      if (provider.provider === "gemini-managed") {
        const { plan, hasKey } = await resolveSettingsRaw(user.id);
        let check: Awaited<ReturnType<typeof checkAndIncrement>>;
        try {
          check = await checkAndIncrement(user.id, "chats", plan, hasKey);
        } catch {
          return void res.status(503).json({ error: "quota_unavailable", retryAfter: 10 });
        }
        if (!check.allowed) {
          return void res.status(429).json({
            error: "monthly_limit_reached",
            action: "chats",
            remaining: 0,
            upgrade_url: "/settings?tab=billing",
          });
        }
        quotaCtx = { plan, hasKey };
      }
      return handleChat(req, res, user, provider, reqId, quotaCtx);
    }

    // Default: text completion (enrichment parsing, insight, etc.)
    const { messages, max_tokens, system } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: "messages must be a non-empty array" });
    if (messages.length > 50) return res.status(400).json({ error: "Too many messages" });
    for (const msg of messages) {
      if (!msg || typeof msg !== "object") return res.status(400).json({ error: "Invalid message format" });
      if (!["user", "assistant"].includes(msg.role)) return res.status(400).json({ error: "Message role must be 'user' or 'assistant'" });
      if (typeof msg.content !== "string") return res.status(400).json({ error: "Message content must be plain text strings only" });
    }
    if (max_tokens !== undefined && (typeof max_tokens !== "number" || max_tokens < 1 || max_tokens > 4096)) {
      return res.status(400).json({ error: "Invalid max_tokens" });
    }

    const provider = await resolveProvider(user.id);
    if (!provider) return res.status(402).json({ error: "no_ai_provider", message: "Add an API key in Settings or upgrade to Pro." });
    return handleCompletion(res, { messages, max_tokens, system }, provider);
  },
);
