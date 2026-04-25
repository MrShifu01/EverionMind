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
import { withApiKey, ApiError } from "./_lib/withAuth.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
import { retrieveEntries } from "./_lib/retrievalCore.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";
import { enrichInline } from "./_lib/enrich.js";
import {
  reserveIdempotency,
  finalizeIdempotency,
  releaseIdempotency,
  normalizeIdempotencyKey,
  IdempotencyError,
} from "./_lib/idempotency.js";
import { checkAndIncrement } from "./_lib/usage.js";
import { getReqId, createLogger } from "./_lib/logger.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});

type Auth = { userId: string; brainId: string };

// ── /v1/context ───────────────────────────────────────────────────────────────

async function handleContext({ brainId }: Auth, body: any) {
  const { query, limit = 5 } = body;
  if (!query || typeof query !== "string") throw { status: 400, message: "query is required" };
  if (!GEMINI_API_KEY) throw { status: 500, message: "Embedding not configured on server" };

  const safeLimit = Math.min(Math.max(1, Number(limit) || 15), 50);
  const { entries, concepts } = await retrieveEntries(query, brainId, GEMINI_API_KEY, safeLimit);
  return { results: entries, concepts };
}

// ── /v1/answer ────────────────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, provider: string, modelName: string, system: string, query: string): Promise<string> {
  const baseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta/openai",
  };
  const r = await fetch(`${baseUrls[provider] ?? "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "system", content: system }, { role: "user", content: query }],
      max_tokens: 1000,
    }),
  });
  if (!r.ok) throw { status: 502, message: `LLM provider error: ${await r.text().catch(() => String(r.status))}` };
  const data: any = await r.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callAnthropic(apiKey: string, modelName: string, system: string, query: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: modelName || "claude-haiku-4-5-20251001",
      system,
      messages: [{ role: "user", content: query }],
      max_tokens: 1000,
    }),
  });
  if (!r.ok) throw { status: 502, message: `LLM provider error: ${await r.text().catch(() => String(r.status))}` };
  const data: any = await r.json();
  return data.content?.[0]?.text?.trim() ?? "";
}

async function handleAnswer({ brainId }: Auth, body: any) {
  const { query, model, api_key, limit = 5 } = body;
  if (!query || typeof query !== "string") throw { status: 400, message: "query is required" };
  if (!model || typeof model !== "string") throw { status: 400, message: "model is required (e.g. openai/gpt-4o)" };
  if (!api_key || typeof api_key !== "string") throw { status: 400, message: "api_key is required" };
  if (!GEMINI_API_KEY) throw { status: 500, message: "Embedding not configured on server" };

  const safeLimit = Math.min(Math.max(1, Number(limit) || 15), 50);
  const { entries } = await retrieveEntries(query, brainId, GEMINI_API_KEY, safeLimit);

  const contextBlock = entries.map((e) => `### ${e.title}\n${e.content}`).join("\n\n");
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

async function handleIngest({ userId, brainId }: Auth, body: any) {
  const { title, content, type = "note", tags = [] } = body;
  if (!title || typeof title !== "string") throw { status: 400, message: "title is required" };
  if (!content || typeof content !== "string") throw { status: 400, message: "content is required" };

  // Quota enforcement for external API ingest
  const settingsRes = await fetch(
    `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(userId)}&select=plan,anthropic_key,gemini_key,openai_key&limit=1`,
    { headers: hdrs() },
  );
  const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
  const settings = settingsRows[0] ?? {};
  const plan = settings.plan ?? "starter";
  const hasByok = !!(settings.anthropic_key || settings.gemini_key || settings.openai_key);
  let quota: Awaited<ReturnType<typeof checkAndIncrement>>;
  try {
    quota = await checkAndIncrement(userId, "captures", plan, hasByok);
  } catch {
    throw { status: 503, message: "Quota service unavailable — try again shortly" };
  }
  if (!quota.allowed) throw { status: 429, message: `Monthly capture limit reached (${plan} plan)` };

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
      embedding: embedding ? `[${embedding.join(",")}]` : null, created_at: now, updated_at: now,
    }),
  });
  if (!r.ok) throw new Error(`Failed to create entry: ${await r.text().catch(() => String(r.status))}`);
  const rows: any[] = await r.json();
  enrichInline(id, userId).catch(() => {});
  return { id: rows[0].id, title: rows[0].title, created_at: rows[0].created_at };
}

// ── /v1/update ────────────────────────────────────────────────────────────────

async function handleUpdate({ brainId, userId }: Auth, body: any) {
  const { id, title, content, type, tags } = body;
  if (!id) throw { status: 400, message: "id is required" };
  if (title === undefined && content === undefined && type === undefined && tags === undefined) {
    throw { status: 400, message: "At least one of title, content, type, tags is required" };
  }

  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,tags&limit=1`,
    { headers: hdrs() },
  );
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw { status: 404, message: "Entry not found" };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) patch.title = String(title).trim().slice(0, 200);
  if (content !== undefined) patch.content = String(content).slice(0, 10000);
  if (type !== undefined) patch.type = String(type).trim().slice(0, 50).toLowerCase();
  if (tags !== undefined) patch.tags = Array.isArray(tags) ? tags.slice(0, 20).map((t: any) => String(t).slice(0, 50)) : [];

  if (GEMINI_API_KEY && (title !== undefined || content !== undefined || tags !== undefined)) {
    const embedding = await generateEmbedding(buildEntryText({
      title: (patch.title ?? rows[0].title) as string,
      content: (patch.content ?? rows[0].content) as string,
      tags: (patch.tags ?? rows[0].tags ?? []) as string[],
    }), GEMINI_API_KEY);
    if (embedding) patch.embedding = `[${embedding.join(",")}]`;
  }

  const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: hdrs({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`Update failed: ${await r.text().catch(() => String(r.status))}`);
  const updated: any[] = await r.json();
  enrichInline(id, userId).catch(() => {});
  return { id: updated[0].id, title: updated[0].title, content: updated[0].content, updated_at: updated[0].updated_at };
}

// ── /v1/delete ────────────────────────────────────────────────────────────────

async function handleDelete({ brainId }: Auth, body: any) {
  const { id } = body;
  if (!id) throw { status: 400, message: "id is required" };

  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id&limit=1`,
    { headers: hdrs() },
  );
  const rows: any[] = await entryRes.json();
  if (!rows.length) throw { status: 404, message: "Entry not found" };

  const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: hdrs({ Prefer: "return=minimal" }),
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Delete failed: ${await r.text().catch(() => String(r.status))}`);
  return { id, deleted: true };
}

// ── Main handler ──────────────────────────────────────────────────────────────

const HANDLERS: Record<string, (auth: Auth, body: any) => Promise<any>> = {
  context: handleContext,
  answer: handleAnswer,
  ingest: handleIngest,
  update: handleUpdate,
  delete: handleDelete,
};

export default withApiKey(
  { methods: ["POST"], rateLimit: 30 },
  async ({ req, res, auth }) => {
    const reqId = getReqId(req);
    res.setHeader("x-request-id", reqId);
    const log = createLogger(reqId, { user_id: auth.userId, action: req.query.action });

    const fn = HANDLERS[req.query.action as string];
    if (!fn) throw new ApiError(404, `Unknown action: ${req.query.action}`);

    const isIngest = req.query.action === "ingest";
    let iKey: string | null = null;
    try {
      iKey = normalizeIdempotencyKey(req.headers["idempotency-key"]);
    } catch (e) {
      if (e instanceof IdempotencyError) throw new ApiError(e.status, e.publicMessage);
      throw e;
    }

    let reservationOwned = false;
    if (iKey && isIngest) {
      const reserve = await reserveIdempotency(auth.userId, iKey);
      if (reserve.kind === "replay") {
        return void res.status(200).json({ id: reserve.entryId, idempotent_replay: true });
      }
      if (reserve.kind === "in_flight") {
        return void res.status(409).json({ error: "duplicate_in_flight", idempotent_replay: true });
      }
      reservationOwned = true;
    }

    let result: any;
    try {
      result = await fn({ userId: auth.userId, brainId: auth.brainId }, req.body ?? {});
    } catch (err) {
      if (reservationOwned && iKey) releaseIdempotency(auth.userId, iKey).catch(() => {});
      throw err;
    }

    if (reservationOwned && iKey) {
      if (result?.id) finalizeIdempotency(auth.userId, iKey, result.id).catch(() => {});
      else releaseIdempotency(auth.userId, iKey).catch(() => {});
    }

    log.info("ok");
    res.status(200).json(result);
  },
);
