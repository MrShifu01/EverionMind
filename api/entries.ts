import type { ApiRequest } from "./_lib/types";
import { withAuth, requireBrainAccess, ApiError, type HandlerContext } from "./_lib/withAuth.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { computeCompletenessScore } from "./_lib/completeness.js";
import { SERVER_PROMPTS } from "./_lib/prompts.js";
import { enrichInline, enrichBrain } from "./_lib/enrich.js";
import { flagsOf } from "./_lib/enrichFlags.js";

const SB_URL = process.env.SUPABASE_URL;
const ENTRY_FIELDS = "id,title,content,type,tags,metadata,brain_id,importance,pinned,created_at,embedded_at,embedding_status,status";

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
    const action = ctx.req.query.action as string | undefined;
    if (resource === "audit" && ctx.req.method === "POST") return handleAudit(ctx);
    if (resource === "graph") return handleGraph(ctx);
    // Action-based routes must be checked BEFORE the catch-all method handlers,
    // otherwise a generic `if (method === "GET") return handleGet(ctx)` shadows
    // any GET-with-action endpoint defined below it.
    if (ctx.req.method === "GET"  && action === "enrich-debug")          return handleEnrichDebug(ctx);
    if (ctx.req.method === "POST" && action === "enrich-batch")          return handleEnrichBatch(ctx);
    if (ctx.req.method === "POST" && action === "enrich-clear-backfill") return handleClearBackfill(ctx);
    if (ctx.req.method === "POST" && action === "enrich-retry-failed")   return handleRetryFailed(ctx);
    if (ctx.req.method === "POST" && action === "merge_into")            return handleMergeInto(ctx);
    if (ctx.req.method === "GET")    return handleGet(ctx);
    if (ctx.req.method === "DELETE") return handleDelete(ctx);
    if (ctx.req.method === "PATCH")  return handlePatch(ctx);
    throw new ApiError(405, "Method not allowed");
  },
);

// ── GET /api/entries ──
async function handleGet({ req, res, user }: HandlerContext): Promise<void> {
  const brain_id = req.query.brain_id as string | undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || "1000", 10), 1000);
  const cursor = req.query.cursor as string | undefined;
  const trash = req.query.trash === "true";
  const staged = req.query.staged === "true";

  const cursorFilter = cursor ? `&created_at=lt.${encodeURIComponent(cursor)}` : "";
  const deletedFilter = trash ? "&deleted_at=not.is.null" : "&deleted_at=is.null";
  const statusFilter = staged ? "&status=eq.staged" : "&status=eq.active";

  if (brain_id) {
    await requireBrainAccess(user.id, brain_id);

    const directUrl = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=${limit + 1}${deletedFilter}${statusFilter}&brain_id=eq.${encodeURIComponent(brain_id)}${cursorFilter}`;
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

  const url = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=${limit + 1}${deletedFilter}${statusFilter}&user_id=eq.${encodeURIComponent(user.id)}${cursorFilter}`;
  const response = await fetch(url, { headers: sbHeadersNoContent() });
  if (!response.ok) throw new ApiError(502, "Database error");
  const rows: any[] = await response.json();
  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? results[results.length - 1].created_at : null;
  res.status(response.status).json({ entries: results, nextCursor, hasMore });
}

// ── DELETE /api/entries (was /api/delete-entry) — soft delete or hard delete ──
async function handleDelete({ req, res, user, req_id }: HandlerContext): Promise<void> {
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
        request_id: req_id,
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
      request_id: req_id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  res.status(response.ok ? 200 : 502).json({ ok: response.ok });
}

// ── PATCH /api/entries (was /api/update-entry) ──
async function handlePatch({ req, res, user, req_id }: HandlerContext): Promise<void> {
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

  const { id, title, content, type, tags, metadata, brain_id, status } = req.body;
  if (!id || typeof id !== "string" || id.length > 100) {
    throw new ApiError(400, "Missing or invalid id");
  }
  if (title !== undefined && (typeof title !== "string" || title.length > 500)) {
    throw new ApiError(400, "Invalid title");
  }
  if (type !== undefined && (typeof type !== "string" || type.length > 50)) {
    throw new ApiError(400, "Invalid type");
  }
  if (status !== undefined && status !== "active" && status !== "staged") {
    throw new ApiError(400, "Invalid status");
  }

  const patch: Record<string, any> = {};
  if (title !== undefined) patch.title = title;
  if (content !== undefined) patch.content = String(content).slice(0, 10000);
  if (type !== undefined) patch.type = type;
  if (Array.isArray(tags)) patch.tags = tags.filter((t: any) => typeof t === "string").slice(0, 50);
  if (metadata !== undefined && typeof metadata === "object" && !Array.isArray(metadata)) patch.metadata = metadata;
  if (brain_id !== undefined && typeof brain_id === "string" && brain_id.length <= 100) patch.brain_id = brain_id;
  if (status !== undefined) patch.status = status;

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
    // Clear the explicit flags so the next enrichInline pass re-runs every
    // step against the new content. embedded_at is cleared via column update
    // by the embed step itself when it runs.
    (finalMeta as any).enrichment = {
      ...((finalMeta as any).enrichment ?? {}),
      parsed: false,
      has_insight: false,
      concepts_extracted: false,
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
      request_id: req_id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  const data: any = await response.json();
  res.status(response.ok ? 200 : 502).json(data);

  if (response.ok && (titleChanged || contentChanged)) {
    enrichInline(id, user.id).catch(() => {});
  }
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

// ── POST /api/entries?action=enrich-batch ──
async function handleEnrichBatch({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id, batch_size } = req.body;
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const batchSize = typeof batch_size === "number" && batch_size > 0 ? Math.min(batch_size, 10) : 5;
  const result = await enrichBrain(user.id, brain_id, batchSize);
  res.status(200).json(result);
}

function isAdminUser(user: { email?: string }): boolean {
  // Accept either ADMIN_EMAIL or VITE_ADMIN_EMAIL — the latter is what the
  // frontend uses (Vite-prefixed envs leak into the bundle), so projects often
  // only have that one set on Vercel.
  const adminEmail = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL;
  if (!adminEmail) return false;
  return !!user.email && user.email === adminEmail;
}

// ── GET /api/entries?action=enrich-debug — admin only ──
// Returns provider status, entry-flag counts, and recent entries with their
// enrichment flags so the user can see what the server is doing without
// needing Vercel function logs.
async function handleEnrichDebug({ req, res, user }: HandlerContext): Promise<void> {
  if (!isAdminUser(user)) throw new ApiError(403, "Forbidden");
  const brain_id = req.query.brain_id as string | undefined;
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&deleted_at=is.null&select=id,title,type,created_at,metadata,embedded_at,embedding_status&order=created_at.desc&limit=200`,
    { headers: sbHeadersNoContent() },
  );
  if (!r.ok) throw new ApiError(502, "Database error");
  const all: any[] = await r.json();

  // Single source of truth — same flagsOf the runtime pipeline uses, so the
  // diagnostic always agrees with what the next enrichment pass will treat
  // as "done."
  const counts = {
    total: all.length,
    secrets: all.filter((e) => e.type === "secret").length,
    missing_parsed: all.filter((e) => e.type !== "secret" && !flagsOf(e).parsed).length,
    missing_insight: all.filter((e) => e.type !== "secret" && !flagsOf(e).has_insight).length,
    missing_concepts: all.filter((e) => e.type !== "secret" && !flagsOf(e).concepts_extracted).length,
    missing_embedding: all.filter((e) => e.type !== "secret" && !flagsOf(e).embedded && flagsOf(e).embedding_status !== "failed").length,
    failed_embedding: all.filter((e) => e.type !== "secret" && flagsOf(e).embedding_status === "failed").length,
    fully_pending: all.filter((e) => {
      if (e.type === "secret") return false;
      const f = flagsOf(e);
      return !f.parsed || !f.has_insight || !f.concepts_extracted || !f.embedded;
    }).length,
    backfilled: all.filter((e) => flagsOf(e).backfilled).length,
  };

  const recent = all.slice(0, 12).map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    created_at: e.created_at,
    flags: flagsOf(e),
  }));

  res.status(200).json({
    providers: {
      gemini: !!process.env.GEMINI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gemini_model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    },
    brain_id,
    counts,
    recent,
    server_time: new Date().toISOString(),
  });
}

// ── POST /api/entries?action=enrich-clear-backfill — admin only ──
// Strips the {parsed,has_insight,concepts_extracted} flags from entries that
// were marked via the backfill so a Run-now pass actually finds them. Useful
// when the user wants to re-run the (now Gemini-powered) pipeline against
// rows that were stamped enriched purely to silence the loading dot.
async function handleClearBackfill({ req, res, user }: HandlerContext): Promise<void> {
  if (!isAdminUser(user)) throw new ApiError(403, "Forbidden");
  const { brain_id } = req.body;
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);

  // Pull all backfilled entries in this brain — we need the full metadata to
  // patch in place since PostgREST can't do a SET-difference on jsonb.
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&deleted_at=is.null&select=id,metadata&metadata->enrichment->>backfilled_at=not.is.null`,
    { headers: sbHeadersNoContent() },
  );
  if (!r.ok) throw new ApiError(502, "Database error");
  const rows: any[] = await r.json();

  let cleared = 0;
  for (const row of rows) {
    const meta = { ...(row.metadata ?? {}) };
    const enr = { ...(meta.enrichment ?? {}) };
    delete enr.parsed;
    delete enr.has_insight;
    delete enr.concepts_extracted;
    delete enr.backfilled_at;
    meta.enrichment = enr;

    const patch = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({ metadata: meta }),
      },
    );
    if (patch.ok) cleared++;
  }

  res.status(200).json({ cleared, scanned: rows.length });
}

// ── POST /api/entries?action=enrich-retry-failed — admin only ──
// Resets `embedding_status` from 'failed' back to NULL on every entry in the
// brain so the new pipeline's `!f.embedded && f.embedding_status !== 'failed'`
// filter picks them up again. Then runs one batch through enrichBrain so the
// retry actually starts before the user closes the dialog.
async function handleRetryFailed({ req, res, user }: HandlerContext): Promise<void> {
  if (!isAdminUser(user)) throw new ApiError(403, "Forbidden");
  const { brain_id } = req.body;
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&deleted_at=is.null&embedding_status=eq.failed`,
    {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ embedding_status: null }),
    },
  );
  if (!r.ok) throw new ApiError(502, "Failed to reset embedding status");
  const reset: any[] = await r.json();
  const result = await enrichBrain(user.id, brain_id, 10);
  res.status(200).json({ reset: reset.length, ...result });
}

// ── POST /api/entries?action=merge_into — merge source entry into target, then soft-delete source ──
async function handleMergeInto({ req, res, user }: HandlerContext): Promise<void> {
  const source_id = req.query.id as string | undefined;
  const { target_id } = req.body;
  if (!source_id || typeof source_id !== "string" || source_id.length > 100) throw new ApiError(400, "Missing or invalid id");
  if (!target_id || typeof target_id !== "string" || target_id.length > 100) throw new ApiError(400, "Missing or invalid target_id");
  if (source_id === target_id) throw new ApiError(400, "source and target must differ");

  const [sourceRes, targetRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(source_id)}&select=${encodeURIComponent(ENTRY_FIELDS)}`, { headers: sbHeadersNoContent() }),
    fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(target_id)}&select=${encodeURIComponent(ENTRY_FIELDS)}`, { headers: sbHeadersNoContent() }),
  ]);
  if (!sourceRes.ok || !targetRes.ok) throw new ApiError(502, "Database error");
  const [source]: any[] = await sourceRes.json();
  const [target]: any[] = await targetRes.json();
  if (!source) throw new ApiError(404, "Source entry not found");
  if (!target) throw new ApiError(404, "Target entry not found");

  await Promise.all([
    requireBrainAccess(user.id, source.brain_id),
    requireBrainAccess(user.id, target.brain_id),
  ]);

  const mergedContent = [target.content, source.content].filter(Boolean).join("\n\n---\n\n");
  const mergedTags = Array.from(new Set([...(target.tags ?? []), ...(source.tags ?? [])])).slice(0, 50);

  const patchRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(target_id)}`,
    {
      method: "PATCH",
      headers: sbHeaders({ "Prefer": "return=representation" }),
      body: JSON.stringify({ content: mergedContent, tags: mergedTags }),
    },
  );
  if (!patchRes.ok) throw new ApiError(502, "Failed to update target entry");

  await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(source_id)}`,
    {
      method: "PATCH",
      headers: sbHeaders({ "Prefer": "return=minimal" }),
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    },
  );

  console.log(`[audit] MERGE_INTO source=${source_id} target=${target_id} user=${user.id}`);

  const [updated] = await patchRes.json();
  res.status(200).json(updated ?? { ok: true });
  enrichInline(target_id, user.id).catch(() => {});
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
