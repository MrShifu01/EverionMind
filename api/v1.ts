/**
 * POST /v1/context  — retrieve relevant memories
 * POST /v1/answer   — AI-synthesized answer using user-supplied key + model
 * POST /v1/ingest   — add a new entry
 * POST /v1/update   — edit an existing entry
 * POST /v1/delete   — soft-delete an entry
 * POST /v1/merge    — combine 2-8 entries into one (one-shot LLM merge)
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
import { mergeEntriesOneShot } from "./_lib/mergeEntries.js";
import {
  reserveIdempotency,
  finalizeIdempotency,
  releaseIdempotency,
  normalizeIdempotencyKey,
  IdempotencyError,
} from "./_lib/idempotency.js";
import { checkAndIncrement } from "./_lib/usage.js";
import { getReqId, createLogger } from "./_lib/logger.js";
import { optionalBodyObject } from "./_lib/requestBody.js";
import { loadUserAiContext } from "./_lib/loadUserAiContext.js";
import { sbHeaders } from "./_lib/sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

const hdrs = sbHeaders;

type Auth = { userId: string; brainId: string };

// ── /v1/context ───────────────────────────────────────────────────────────────

async function handleContext(auth: Auth, body: any) {
  const { query, limit = 5 } = body;
  if (!query || typeof query !== "string") throw { status: 400, message: "query is required" };
  if (!GEMINI_API_KEY) throw { status: 500, message: "Embedding not configured on server" };

  const safeLimit = Math.min(Math.max(1, Number(limit) || 15), 50);
  const { entries, concepts, importantMemories } = await retrieveEntries(
    query,
    auth.brainId,
    GEMINI_API_KEY,
    safeLimit,
    { userId: auth.userId, brainId: auth.brainId, surface: "v1-context" },
  );
  return { results: entries, concepts, importantMemories };
}

// ── /v1/answer ────────────────────────────────────────────────────────────────

async function callOpenAI(
  apiKey: string,
  provider: string,
  modelName: string,
  system: string,
  query: string,
): Promise<string> {
  const baseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta/openai",
  };
  const r = await fetch(`${baseUrls[provider] ?? "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: "system", content: system },
        { role: "user", content: query },
      ],
      max_tokens: 1000,
    }),
  });
  if (!r.ok)
    throw {
      status: 502,
      message: `LLM provider error: ${await r.text().catch(() => String(r.status))}`,
    };
  const data: any = await r.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callAnthropic(
  apiKey: string,
  modelName: string,
  system: string,
  query: string,
): Promise<string> {
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
  if (!r.ok)
    throw {
      status: 502,
      message: `LLM provider error: ${await r.text().catch(() => String(r.status))}`,
    };
  const data: any = await r.json();
  return data.content?.[0]?.text?.trim() ?? "";
}

async function handleAnswer(auth: Auth, body: any) {
  const { query, model, api_key, limit = 5 } = body;
  if (!query || typeof query !== "string") throw { status: 400, message: "query is required" };
  if (!model || typeof model !== "string")
    throw { status: 400, message: "model is required (e.g. openai/gpt-4o)" };
  if (!api_key || typeof api_key !== "string")
    throw { status: 400, message: "api_key is required" };
  if (!GEMINI_API_KEY) throw { status: 500, message: "Embedding not configured on server" };

  const safeLimit = Math.min(Math.max(1, Number(limit) || 15), 50);
  const { entries, importantMemories } = await retrieveEntries(
    query,
    auth.brainId,
    GEMINI_API_KEY,
    safeLimit,
    { userId: auth.userId, brainId: auth.brainId, surface: "v1-answer" },
  );

  const importantBlock = importantMemories
    .map((m) => `### ${m.title}\n${m.summary}`)
    .join("\n\n");
  const entriesBlock = entries.map((e) => `### ${e.title}\n${e.content}`).join("\n\n");
  const contextBlock = [
    importantBlock ? `Canonical facts:\n${importantBlock}` : "",
    entriesBlock ? `Retrieved entries:\n${entriesBlock}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const systemPrompt = `You are a helpful assistant with access to the user's personal knowledge base. Answer using ONLY the context below. If the context is insufficient, say so clearly.\n\nContext:\n${contextBlock}`;

  const slashIdx = model.indexOf("/");
  const provider = slashIdx > -1 ? model.slice(0, slashIdx) : "openai";
  const modelName = slashIdx > -1 ? model.slice(slashIdx + 1) : model;

  const answerText =
    provider === "anthropic"
      ? await callAnthropic(api_key, modelName, systemPrompt, query)
      : await callOpenAI(api_key, provider, modelName, systemPrompt, query);

  return {
    answer: answerText,
    importantMemories,
    sources: entries.map((e) => ({ id: e.id, title: e.title, similarity: e.similarity })),
  };
}

// ── /v1/ingest ────────────────────────────────────────────────────────────────

async function handleIngest({ userId, brainId }: Auth, body: any) {
  const { title, content, type = "note", tags = [], metadata, importance } = body;
  if (!title || typeof title !== "string") throw { status: 400, message: "title is required" };
  if (!content || typeof content !== "string")
    throw { status: 400, message: "content is required" };
  if (
    metadata !== undefined &&
    metadata !== null &&
    (typeof metadata !== "object" || Array.isArray(metadata))
  ) {
    throw { status: 400, message: "metadata must be an object" };
  }
  if (metadata && JSON.stringify(metadata).length > 64_000) {
    throw { status: 400, message: "metadata too large — max 64 KB" };
  }
  if (importance !== undefined && importance !== null) {
    const n = Number(importance);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw { status: 400, message: "importance must be a number between 0 and 100" };
    }
  }

  // Quota enforcement for external API ingest. Tier from user_profiles.tier
  // (canonical billing); BYOK presence from user_ai_settings keys.
  const { tier, settings } = await loadUserAiContext(userId);
  const hasByok = !!(settings.anthropic_key || settings.gemini_key || settings.openai_key);
  let quota: Awaited<ReturnType<typeof checkAndIncrement>>;
  try {
    quota = await checkAndIncrement(userId, "captures", tier, hasByok);
  } catch {
    throw { status: 503, message: "Quota service unavailable — try again shortly" };
  }
  if (!quota.allowed)
    throw { status: 429, message: `Monthly capture limit reached (${tier} plan)` };

  const safeTitle = title.trim().slice(0, 200);
  const safeContent = content.slice(0, 200_000);
  const safeType = String(type).trim().slice(0, 50).toLowerCase() || "note";
  if (safeType === "secret") {
    throw {
      status: 400,
      message: "Cannot create vault entries via API — use the in-app Vault to encrypt secrets",
    };
  }
  const safeTags = Array.isArray(tags)
    ? tags.slice(0, 20).map((t: any) => String(t).slice(0, 50))
    : [];

  let embedding: number[] | null = null;
  if (GEMINI_API_KEY) {
    embedding = await generateEmbedding(
      buildEntryText({ title: safeTitle, content: safeContent, tags: safeTags }),
      GEMINI_API_KEY,
    );
  }

  const id = (randomUUID as () => string)();
  const now = new Date().toISOString();
  const insertBody: Record<string, unknown> = {
    id,
    user_id: userId,
    brain_id: brainId,
    title: safeTitle,
    content: safeContent,
    type: safeType,
    tags: safeTags,
    embedding: embedding ? `[${embedding.join(",")}]` : null,
    created_at: now,
    updated_at: now,
  };
  if (metadata && typeof metadata === "object") insertBody.metadata = metadata;
  if (importance !== undefined && importance !== null) insertBody.importance = Number(importance);
  const r = await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: hdrs({ Prefer: "return=representation" }),
    body: JSON.stringify(insertBody),
  });
  if (!r.ok)
    throw new Error(`Failed to create entry: ${await r.text().catch(() => String(r.status))}`);
  const rows: any[] = await r.json();
  // AWAIT enrichInline so the v1 API returns a fully-enriched entry on
  // first call. Fire-and-forget on Vercel was unreliable — function
  // instance gets killed before the IIFE finishes, leaving entries with
  // parsed=false forever.
  try {
    await enrichInline(id, userId);
  } catch (err) {
    console.error("[v1:create:enrich]", id, err);
  }
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
  if (content !== undefined) patch.content = String(content).slice(0, 200_000);
  if (type !== undefined) {
    const newType = String(type).trim().slice(0, 50).toLowerCase();
    if (newType === "secret") {
      throw {
        status: 400,
        message: "Cannot retype an entry to 'secret' via API — use the in-app Vault flow",
      };
    }
    patch.type = newType;
  }
  if (tags !== undefined)
    patch.tags = Array.isArray(tags)
      ? tags.slice(0, 20).map((t: any) => String(t).slice(0, 50))
      : [];

  if (GEMINI_API_KEY && (title !== undefined || content !== undefined || tags !== undefined)) {
    const embedding = await generateEmbedding(
      buildEntryText({
        title: (patch.title ?? rows[0].title) as string,
        content: (patch.content ?? rows[0].content) as string,
        tags: (patch.tags ?? rows[0].tags ?? []) as string[],
      }),
      GEMINI_API_KEY,
    );
    if (embedding) patch.embedding = `[${embedding.join(",")}]`;
  }

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}`,
    {
      method: "PATCH",
      headers: hdrs({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    },
  );
  if (!r.ok) throw new Error(`Update failed: ${await r.text().catch(() => String(r.status))}`);
  const updated: any[] = await r.json();
  // AWAIT — see create above.
  try {
    await enrichInline(id, userId);
  } catch (err) {
    console.error("[v1:update:enrich]", id, err);
  }
  return {
    id: updated[0].id,
    title: updated[0].title,
    content: updated[0].content,
    updated_at: updated[0].updated_at,
  };
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

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}`,
    {
      method: "PATCH",
      headers: hdrs({ Prefer: "return=minimal" }),
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    },
  );
  if (!r.ok) throw new Error(`Delete failed: ${await r.text().catch(() => String(r.status))}`);
  return { id, deleted: true };
}

// ── /v1/merge ─────────────────────────────────────────────────────────────────

async function handleMerge({ userId }: Auth, body: any) {
  const { ids } = body;
  // mergeEntriesOneShot validates length, uuid format, ownership, same brain,
  // vault guard, quota peek. Errors thrown as ApiError surface as 4xx/5xx
  // via withApiKey's error handler.
  return mergeEntriesOneShot(userId, ids);
}

// ── Main handler ──────────────────────────────────────────────────────────────

const HANDLERS: Record<string, (auth: Auth, body: any) => Promise<any>> = {
  context: handleContext,
  answer: handleAnswer,
  ingest: handleIngest,
  update: handleUpdate,
  delete: handleDelete,
  merge: handleMerge,
};

export default withApiKey({ methods: ["POST"], rateLimit: 30 }, async ({ req, res, auth }) => {
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
    result = await fn({ userId: auth.userId, brainId: auth.brainId }, optionalBodyObject(req.body));
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
});
