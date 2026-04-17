/**
 * POST /v1/context  — retrieve relevant memories
 * POST /v1/answer   — AI-synthesized answer using user-supplied key + model
 * POST /v1/ingest   — add a new entry
 * POST /v1/update   — edit an existing entry
 * POST /v1/delete   — soft-delete an entry
 *
 * Auth: Authorization: Bearer em_<raw_key>
 * Routed via vercel.json: /v1/:action → /api/v1?action=:action
 */
import { randomUUID } from "crypto";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { resolveApiKey, getUserBrainId } from "./_lib/resolveApiKey.js";
import { retrieveEntries } from "./_lib/retrievalCore.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});

// ── /v1/context ───────────────────────────────────────────────────────────────

async function handleContext(userId: string, body: any) {
  const { query, limit = 5 } = body;
  if (!query || typeof query !== "string") throw { status: 400, message: "query is required" };
  if (!GEMINI_API_KEY) throw { status: 500, message: "Embedding not configured on server" };

  const brainId = await getUserBrainId(userId);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 5), 50);
  const results = await retrieveEntries(query, brainId, GEMINI_API_KEY, safeLimit);
  return { results };
}

// ── /v1/answer ────────────────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, provider: string, modelName: string, system: string, query: string): Promise<string> {
  const baseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta/openai",
  };
  const baseUrl = baseUrls[provider] ?? "https://api.openai.com/v1";

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "system", content: system }, { role: "user", content: query }],
      max_tokens: 1000,
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => String(r.status));
    throw { status: 502, message: `LLM provider error: ${text}` };
  }
  const data: any = await r.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callAnthropic(apiKey: string, modelName: string, system: string, query: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelName || "claude-haiku-4-5-20251001",
      system,
      messages: [{ role: "user", content: query }],
      max_tokens: 1000,
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => String(r.status));
    throw { status: 502, message: `LLM provider error: ${text}` };
  }
  const data: any = await r.json();
  return data.content?.[0]?.text?.trim() ?? "";
}

async function handleAnswer(userId: string, body: any) {
  const { query, model, api_key, limit = 5 } = body;
  if (!query || typeof query !== "string") throw { status: 400, message: "query is required" };
  if (!model || typeof model !== "string") throw { status: 400, message: "model is required (e.g. openai/gpt-4o)" };
  if (!api_key || typeof api_key !== "string") throw { status: 400, message: "api_key is required" };
  if (!GEMINI_API_KEY) throw { status: 500, message: "Embedding not configured on server" };

  const brainId = await getUserBrainId(userId);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 5), 50);
  const entries = await retrieveEntries(query, brainId, GEMINI_API_KEY, safeLimit);

  const contextBlock = entries
    .map((e) => `### ${e.title}\n${e.content}`)
    .join("\n\n");
  const systemPrompt = `You are a helpful assistant with access to the user's personal knowledge base. Answer using ONLY the context below. If the context is insufficient, say so clearly.\n\nContext:\n${contextBlock}`;

  const slashIdx = model.indexOf("/");
  const provider = slashIdx > -1 ? model.slice(0, slashIdx) : "openai";
  const modelName = slashIdx > -1 ? model.slice(slashIdx + 1) : model;

  const answerText = provider === "anthropic"
    ? await callAnthropic(api_key, modelName, systemPrompt, query)
    : await callOpenAI(api_key, provider, modelName, systemPrompt, query);

  return {
    answer: answerText,
    sources: entries.map((e) => ({ id: e.id, title: e.title, similarity: e.similarity })),
  };
}

// ── /v1/ingest ────────────────────────────────────────────────────────────────

async function handleIngest(userId: string, body: any) {
  const { title, content, type = "note", tags = [] } = body;
  if (!title || typeof title !== "string") throw { status: 400, message: "title is required" };
  if (!content || typeof content !== "string") throw { status: 400, message: "content is required" };

  const brainId = await getUserBrainId(userId);
  const safeTitle = title.trim().slice(0, 200);
  const safeContent = content.slice(0, 10000);
  const safeType = String(type).trim().slice(0, 50).toLowerCase() || "note";
  const safeTags = Array.isArray(tags) ? tags.slice(0, 20).map((t: any) => String(t).slice(0, 50)) : [];

  let embedding: number[] | null = null;
  if (GEMINI_API_KEY) {
    embedding = await generateEmbedding(
      buildEntryText({ title: safeTitle, content: safeContent, tags: safeTags }),
      GEMINI_API_KEY,
    );
  }

  const id = (randomUUID as () => string)();
  const now = new Date().toISOString();
  const r = await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: hdrs({ Prefer: "return=representation" }),
    body: JSON.stringify({
      id, user_id: userId, brain_id: brainId,
      title: safeTitle, content: safeContent, type: safeType, tags: safeTags,
      embedding, created_at: now, updated_at: now,
    }),
  });
  if (!r.ok) throw new Error(`Failed to create entry: ${await r.text().catch(() => String(r.status))}`);
  const rows: any[] = await r.json();
  return { id: rows[0].id, title: rows[0].title, created_at: rows[0].created_at };
}

// ── /v1/update ────────────────────────────────────────────────────────────────

async function handleUpdate(userId: string, body: any) {
  const { id, title, content, type, tags } = body;
  if (!id) throw { status: 400, message: "id is required" };
  if (title === undefined && content === undefined && type === undefined && tags === undefined) {
    throw { status: 400, message: "At least one of title, content, type, tags is required" };
  }

  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,brain_id,title,content,tags&limit=1`,
    { headers: hdrs() },
  );
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw { status: 404, message: "Entry not found" };

  const brainCheck = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(rows[0].brain_id)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  if (!(await brainCheck.json() as any[]).length) throw { status: 404, message: "Entry not found" };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) patch.title = String(title).trim().slice(0, 200);
  if (content !== undefined) patch.content = String(content).slice(0, 10000);
  if (type !== undefined) patch.type = String(type).trim().slice(0, 50).toLowerCase();
  if (tags !== undefined) patch.tags = Array.isArray(tags) ? tags.slice(0, 20).map((t: any) => String(t).slice(0, 50)) : [];

  if (GEMINI_API_KEY && (title !== undefined || content !== undefined || tags !== undefined)) {
    const merged = {
      title: (patch.title ?? rows[0].title) as string,
      content: (patch.content ?? rows[0].content) as string,
      tags: (patch.tags ?? rows[0].tags ?? []) as string[],
    };
    const embedding = await generateEmbedding(buildEntryText(merged), GEMINI_API_KEY);
    if (embedding) patch.embedding = embedding;
  }

  const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: hdrs({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`Update failed: ${await r.text().catch(() => String(r.status))}`);
  const updated: any[] = await r.json();
  return { id: updated[0].id, title: updated[0].title, content: updated[0].content, updated_at: updated[0].updated_at };
}

// ── /v1/delete ────────────────────────────────────────────────────────────────

async function handleDelete(userId: string, body: any) {
  const { id } = body;
  if (!id) throw { status: 400, message: "id is required" };

  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,brain_id&limit=1`,
    { headers: hdrs() },
  );
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw { status: 404, message: "Entry not found" };

  const brainCheck = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(rows[0].brain_id)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  if (!(await brainCheck.json() as any[]).length) throw { status: 404, message: "Entry not found" };

  const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: hdrs({ Prefer: "return=minimal" }),
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Delete failed: ${await r.text().catch(() => String(r.status))}`);
  return { id, deleted: true };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const authHeader = (req.headers["authorization"] as string) ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!rawKey) return res.status(401).json({ error: "Missing Authorization header" });

  const auth = await resolveApiKey(rawKey);
  if (!auth) return res.status(401).json({ error: "Invalid or revoked API key" });

  const action = req.query.action as string;
  const handlers: Record<string, (userId: string, body: any) => Promise<any>> = {
    context: handleContext,
    answer: handleAnswer,
    ingest: handleIngest,
    update: handleUpdate,
    delete: handleDelete,
  };

  const fn = handlers[action];
  if (!fn) return res.status(404).json({ error: `Unknown action: ${action}` });

  try {
    const result = await fn(auth.userId, req.body ?? {});
    return res.status(200).json(result);
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json({ error: e.message });
    return res.status(500).json({ error: e?.message ?? "Internal error" });
  }
}
