import type { ApiRequest } from "./_lib/types";
import { withAuth, requireBrainAccess, ApiError, type HandlerContext } from "./_lib/withAuth.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { computeCompletenessScore } from "./_lib/completeness.js";
import { SERVER_PROMPTS } from "./_lib/prompts.js";

const SB_URL = process.env.SUPABASE_URL;
const ENTRY_FIELDS = "id,title,content,type,tags,metadata,brain_id,importance,pinned,created_at,embedded_at";

function rateLimitForEntries(req: ApiRequest): number {
  const resource = req.query.resource as string | undefined;
  if (resource === "audit") return 10;
  if (req.method === "GET" && !resource) return 60;
  return 30;
}

// Dispatched via rewrites:
//   /api/delete-entry, /api/update-entry → /api/entries
export default withAuth(
  { methods: ["GET", "POST", "PATCH", "DELETE"], rateLimit: rateLimitForEntries },
  async (ctx) => {
    const resource = ctx.req.query.resource as string | undefined;
    if (resource === "entry-brains") return handleEntryBrains(ctx);
    if (resource === "audit" && ctx.req.method === "POST") return handleAudit(ctx);
    if (resource === "graph") return handleGraph(ctx);
    if (ctx.req.method === "GET") return handleGet(ctx);
    if (ctx.req.method === "DELETE") return handleDelete(ctx);
    if (ctx.req.method === "PATCH") return handlePatch(ctx);
    throw new ApiError(405, "Method not allowed");
  },
);

// ── GET /api/entries ──
async function handleGet({ req, res, user }: HandlerContext): Promise<void> {
  const brain_id = req.query.brain_id as string | undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || "1000", 10), 1000);
  const cursor = req.query.cursor as string | undefined;
  const trash = req.query.trash === "true";

  const cursorFilter = cursor ? `&created_at=lt.${encodeURIComponent(cursor)}` : "";
  const deletedFilter = trash ? "&deleted_at=not.is.null" : "&deleted_at=is.null";

  if (brain_id) {
    await requireBrainAccess(user.id, brain_id);

    const sharedRes = await fetch(
      `${SB_URL}/rest/v1/entry_brains?brain_id=eq.${encodeURIComponent(brain_id)}&select=entry_id`,
      { headers: sbHeadersNoContent() }
    );
    const sharedRows: any[] = sharedRes.ok ? await sharedRes.json() : [];
    const sharedIds: string[] = sharedRows.map((r: any) => r.entry_id).filter(Boolean);

    const sharedIdFilter = sharedIds.length > 0
      ? `,id.in.(${sharedIds.map(encodeURIComponent).join(",")})`
      : "";
    const orFilter = `&or=(brain_id.eq.${encodeURIComponent(brain_id)}${sharedIdFilter})`;

    const directUrl = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=${limit + 1}${deletedFilter}${orFilter}${cursorFilter}`;
    const directRes = await fetch(directUrl, { headers: sbHeadersNoContent() });
    if (!directRes.ok) throw new ApiError(502, "Database error");
    const rows: any[] = await directRes.json();
    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? results[results.length - 1].created_at : null;
    res.setHeader("Cache-Control", "private, max-age=300");
    res.status(200).json({ entries: results, nextCursor, hasMore });
    return;
  }

  const url = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=${limit + 1}${deletedFilter}&user_id=eq.${encodeURIComponent(user.id)}${cursorFilter}`;
  const response = await fetch(url, { headers: sbHeadersNoContent() });
  if (!response.ok) throw new ApiError(502, "Database error");
  const rows: any[] = await response.json();
  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? results[results.length - 1].created_at : null;
  res.status(response.status).json({ entries: results, nextCursor, hasMore });
}

// ── DELETE /api/entries (was /api/delete-entry) — soft delete or hard delete ──
async function handleDelete({ req, res, user }: HandlerContext): Promise<void> {
  const { id } = req.body;
  if (!id || typeof id !== "string" || id.length > 100) {
    throw new ApiError(400, "Missing or invalid id");
  }

  const permanent = req.query.permanent === "true";

  const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`, {
    headers: sbHeadersNoContent(),
  });
  if (!entryRes.ok) throw new ApiError(502, "Database error");
  const [entry]: any[] = await entryRes.json();
  if (!entry) throw new ApiError(404, "Not found");
  await requireBrainAccess(user.id, entry.brain_id);

  if (permanent) {
    const response = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
      { method: "DELETE", headers: sbHeaders({ "Prefer": "return=minimal" }) },
    );

    console.log(`[audit] HARD_DELETE entry id=${id} user=${user.id} ok=${response.ok}`);

    fetch(`${SB_URL}/rest/v1/audit_log`, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        user_id: user.id,
        action: 'entry_permanent_delete',
        resource_id: id,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});

    res.status(response.ok ? 200 : 502).json({ ok: response.ok });
    return;
  }

  // Soft delete
  const response = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: sbHeaders({ "Prefer": "return=minimal" }),
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    },
  );

  console.log(`[audit] SOFT_DELETE entry id=${id} user=${user.id} ok=${response.ok}`);

  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify({
      user_id: user.id,
      action: 'entry_delete',
      resource_id: id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  res.status(response.ok ? 200 : 502).json({ ok: response.ok });
}

// ── PATCH /api/entries (was /api/update-entry) ──
async function handlePatch({ req, res, user }: HandlerContext): Promise<void> {
  const action = req.query.action as string | undefined;

  if (action === "restore") {
    const { id } = req.body;
    if (!id || typeof id !== "string" || id.length > 100) {
      throw new ApiError(400, "Missing or invalid id");
    }
    const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`, {
      headers: sbHeadersNoContent(),
    });
    if (!entryRes.ok) throw new ApiError(502, "Database error");
    const [entryData]: any[] = await entryRes.json();
    if (!entryData) throw new ApiError(404, "Not found");
    await requireBrainAccess(user.id, entryData.brain_id);

    const response = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ "Prefer": "return=representation" }),
        body: JSON.stringify({ deleted_at: null }),
      },
    );
    console.log(`[audit] RESTORE entry id=${id} user=${user.id} ok=${response.ok}`);
    const data: any = await response.json();
    res.status(response.ok ? 200 : 502).json(data);
    return;
  }

  const { id, title, content, type, tags, metadata, brain_id } = req.body;
  if (!id || typeof id !== "string" || id.length > 100) {
    throw new ApiError(400, "Missing or invalid id");
  }
  if (title !== undefined && (typeof title !== "string" || title.length > 500)) {
    throw new ApiError(400, "Invalid title");
  }
  if (type !== undefined && (typeof type !== "string" || type.length > 50)) {
    throw new ApiError(400, "Invalid type");
  }

  const patch: Record<string, any> = {};
  if (title !== undefined) patch.title = title;
  if (content !== undefined) patch.content = String(content).slice(0, 10000);
  if (type !== undefined) patch.type = type;
  if (Array.isArray(tags)) patch.tags = tags.filter((t: any) => typeof t === "string").slice(0, 50);
  if (metadata !== undefined && typeof metadata === "object" && !Array.isArray(metadata)) patch.metadata = metadata;
  if (brain_id !== undefined && typeof brain_id === "string" && brain_id.length <= 100) patch.brain_id = brain_id;

  const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id,title,content,type,tags,metadata`, {
    headers: sbHeadersNoContent(),
  });
  if (!entryRes.ok) throw new ApiError(502, "Database error");
  const [entry]: any[] = await entryRes.json();
  if (!entry) throw new ApiError(404, "Not found");
  await requireBrainAccess(user.id, entry.brain_id);

  if (patch.brain_id !== undefined && patch.brain_id !== entry.brain_id) {
    await requireBrainAccess(user.id, patch.brain_id);
  }

  const mergedTitle = patch.title ?? entry.title ?? "";
  const mergedContent = patch.content ?? entry.content ?? "";
  const mergedType = patch.type ?? entry.type ?? "note";
  const mergedTags = patch.tags ?? entry.tags ?? [];
  const mergedMeta = patch.metadata ?? entry.metadata ?? {};
  const cScore = computeCompletenessScore(mergedTitle, mergedContent, mergedType, mergedTags, mergedMeta);
  const finalMeta = { ...(entry.metadata || {}), ...(patch.metadata || {}), completeness_score: cScore };

  const titleChanged = patch.title !== undefined && patch.title !== (entry.title ?? "");
  const contentChanged = patch.content !== undefined && patch.content !== (entry.content ?? "");
  const typeChanged = patch.type !== undefined && patch.type !== (entry.type ?? "note");
  if (titleChanged || contentChanged) {
    (finalMeta as any).enrichment = {
      ...((finalMeta as any).enrichment ?? {}),
      embedded: false,
      concepts_count: 0,
      has_insight: false,
      parsed: false,
    };
  }
  if (titleChanged || contentChanged || typeChanged) {
    (finalMeta as any).audit_flags = null;
  }

  patch.metadata = finalMeta;

  const response = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: sbHeaders({ "Prefer": "return=representation" }),
      body: JSON.stringify(patch),
    },
  );

  console.log(`[audit] PATCH entry id=${id} user=${user.id} ok=${response.ok}`);

  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify({
      user_id: user.id,
      action: 'entry_update',
      resource_id: id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  const data: any = await response.json();
  res.status(response.ok ? 200 : 502).json(data);
}

// ── /api/audit (rewritten to /api/entries?resource=audit) ──
const AUDIT_GEMINI_BATCH = 50;
const AUDIT_MAX_TOKENS  = 4096;
const AUDIT_DB_PAGE     = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runGeminiBatch(
  lines: string,
  batchSet: Set<string>,
  apiKey: string,
  model: string,
  batchNum: number,
): Promise<any[]> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: lines }] }],
          systemInstruction: { parts: [{ text: SERVER_PROMPTS.ENTRY_AUDIT }] },
          generationConfig: { maxOutputTokens: AUDIT_MAX_TOKENS },
        }),
      },
    );
    if (!r.ok) {
      const err = await r.text().catch(() => "");
      console.log(`[audit] batch ${batchNum} error:`, r.status, err.slice(0, 200));
      return [];
    }
    const data = await r.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log(`[audit] batch ${batchNum} text:`, text.slice(0, 200));
    const cleaned = text.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f: any) => f?.entryId && batchSet.has(f.entryId));
  } catch (e) {
    console.log(`[audit] batch ${batchNum} exception:`, e);
    return [];
  }
}

async function handleAudit({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id, pace } = req.body;
  await requireBrainAccess(user.id, brain_id);

  const AUDIT_ENTRY_CAP = 500;
  const cappedEntries: any[] = [];
  let offset = 0;
  while (cappedEntries.length < AUDIT_ENTRY_CAP) {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&select=id,title,content,type,tags,metadata&order=created_at.desc&limit=${AUDIT_DB_PAGE}&offset=${offset}`,
      { headers: sbHeadersNoContent() },
    );
    if (!r.ok) throw new ApiError(502, "Database error");
    const page: any[] = await r.json();
    cappedEntries.push(...page);
    if (page.length < AUDIT_DB_PAGE || cappedEntries.length >= AUDIT_ENTRY_CAP) break;
    offset += AUDIT_DB_PAGE;
  }
  if (cappedEntries.length > AUDIT_ENTRY_CAP) cappedEntries.length = AUDIT_ENTRY_CAP;

  if (!cappedEntries.length) {
    res.status(200).json({ flagged: 0, entries: {} });
    return;
  }

  const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
  const GEMINI_MODEL   = (process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();
  console.log("[audit] model:", GEMINI_MODEL, "key set:", !!GEMINI_API_KEY, "total entries:", cappedEntries.length);

  const numBatches = Math.ceil(cappedEntries.length / AUDIT_GEMINI_BATCH);
  const batchDelay = pace ? Math.max(2000, Math.floor(60000 / numBatches)) : 0;

  const allFlags: any[] = [];
  for (let i = 0; i < cappedEntries.length; i += AUDIT_GEMINI_BATCH) {
    if (i > 0 && batchDelay > 0) await sleep(batchDelay);
    const batch = cappedEntries.slice(i, i + AUDIT_GEMINI_BATCH);
    const batchSet = new Set(batch.map((e: any) => e.id));
    const lines = batch
      .map((e: any) =>
        `ID: ${e.id}\nTitle: ${e.title}\nType: ${e.type}\nTags: ${(e.tags || []).join(", ")}\nContent: ${String(e.content || "").slice(0, 500)}\nMetadata: ${JSON.stringify(e.metadata || {})}`,
      )
      .join("\n\n---\n\n");
    const batchFlags = await runGeminiBatch(lines, batchSet, GEMINI_API_KEY, GEMINI_MODEL, Math.floor(i / AUDIT_GEMINI_BATCH) + 1);
    allFlags.push(...batchFlags);
  }

  const flagsByEntry: Record<string, any[]> = {};
  for (const flag of allFlags) {
    if (!flagsByEntry[flag.entryId]) flagsByEntry[flag.entryId] = [];
    flagsByEntry[flag.entryId].push({
      type:           flag.type,
      field:          flag.field,
      currentValue:   flag.currentValue ?? "",
      suggestedValue: flag.suggestedValue ?? "",
      reason:         String(flag.reason || "").slice(0, 90),
    });
  }

  await Promise.all(
    cappedEntries.map(async (entry: any) => {
      const newFlags = flagsByEntry[entry.id] ?? null;
      const oldFlags = (entry.metadata as any)?.audit_flags ?? null;
      if (!newFlags?.length && !oldFlags?.length) return;
      const newMeta = { ...(entry.metadata || {}), audit_flags: newFlags };
      await fetch(
        `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`,
        {
          method: "PATCH",
          headers: sbHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify({ metadata: newMeta }),
        },
      ).catch(() => {});
    }),
  );

  const responseEntries: Record<string, any[] | null> = {};
  for (const entry of cappedEntries) {
    responseEntries[entry.id] = flagsByEntry[entry.id] ?? null;
  }

  res.status(200).json({ flagged: Object.keys(flagsByEntry).length, entries: responseEntries });
}

// ── /api/entry-brains — multi-brain assignment management ──
async function handleEntryBrains({ req, res, user }: HandlerContext): Promise<void> {
  if (req.method === "GET") {
    const entry_id = req.query.entry_id as string | undefined;
    if (!entry_id || typeof entry_id !== "string") throw new ApiError(400, "Missing entry_id");
    const r = await fetch(
      `${SB_URL}/rest/v1/entry_brains?entry_id=eq.${encodeURIComponent(entry_id)}&select=brain_id`,
      { headers: sbHeadersNoContent() },
    );
    if (!r.ok) throw new ApiError(502, "Database error");
    const rows: any[] = await r.json();
    res.status(200).json(rows.map((row: any) => row.brain_id));
    return;
  }

  if (req.method === "POST") {
    const { entry_id, brain_id } = req.body;
    if (!entry_id || !brain_id) throw new ApiError(400, "Missing entry_id or brain_id");
    const entryRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}&select=brain_id`,
      { headers: sbHeadersNoContent() },
    );
    if (!entryRes.ok) throw new ApiError(502, "Database error");
    const [entry]: any[] = await entryRes.json();
    if (!entry) throw new ApiError(404, "Not found");
    await requireBrainAccess(user.id, entry.brain_id);

    const r = await fetch(`${SB_URL}/rest/v1/entry_brains`, {
      method: "POST",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ entry_id, brain_id }),
    });
    if (!r.ok) throw new ApiError(502, "Database error");
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const entry_id = req.query.entry_id as string | undefined;
    const brain_id = req.query.brain_id as string | undefined;
    if (!entry_id || !brain_id) throw new ApiError(400, "Missing entry_id or brain_id");
    const entryRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}&select=brain_id`,
      { headers: sbHeadersNoContent() },
    );
    if (!entryRes.ok) throw new ApiError(502, "Database error");
    const [entry]: any[] = await entryRes.json();
    if (!entry) throw new ApiError(404, "Not found");
    await requireBrainAccess(user.id, entry.brain_id);

    const r = await fetch(
      `${SB_URL}/rest/v1/entry_brains?entry_id=eq.${encodeURIComponent(entry_id)}&brain_id=eq.${encodeURIComponent(brain_id)}`,
      { method: "DELETE", headers: sbHeadersNoContent() },
    );
    if (!r.ok) throw new ApiError(502, "Database error");
    res.status(200).json({ ok: true });
    return;
  }

  throw new ApiError(405, "Method not allowed");
}

// ── /api/graph (rewritten to /api/entries?resource=graph) ──
async function handleGraph({ req, res, user }: HandlerContext): Promise<void> {
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (req.method !== "GET" && req.method !== "POST") throw new ApiError(405, "Method not allowed");

  if (req.method === "GET") {
    const brainId = req.query.brain_id as string;
    await requireBrainAccess(user.id, brainId);

    const r = await fetch(
      `${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(brainId)}&select=graph,updated_at`,
      { headers: sbHeadersNoContent() },
    );
    if (!r.ok) throw new ApiError(502, "Database error");
    const rows: any[] = await r.json();
    if (!rows.length) {
      res.status(200).json({ graph: { concepts: [], relationships: [] }, updated_at: null });
      return;
    }
    res.status(200).json(rows[0]);
    return;
  }

  // POST — save graph
  const { brain_id, graph } = req.body || {};
  if (!graph || typeof graph !== "object") throw new ApiError(400, "graph required");
  await requireBrainAccess(user.id, brain_id);

  const safeGraph = {
    concepts: Array.isArray(graph.concepts) ? graph.concepts.slice(0, 500) : [],
    relationships: Array.isArray(graph.relationships) ? graph.relationships.slice(0, 500) : [],
  };
  const r = await fetch(`${SB_URL}/rest/v1/concept_graphs`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ brain_id, graph: safeGraph, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => String(r.status));
    console.error("[graph:save]", r.status, err);
    throw new ApiError(502, "Failed to save graph");
  }
  res.status(200).json({ ok: true });
}
