import type { ApiRequest } from "./_lib/types";
import {
  withAuth,
  requireBrainAccess,
  requireBrainRole,
  ApiError,
  type HandlerContext,
} from "./_lib/withAuth.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { computeCompletenessScore } from "./_lib/completeness.js";
import { SERVER_PROMPTS } from "./_lib/prompts.js";
import {
  enrichInline,
  enrichBrain,
  backfillPersonaForBrain,
  revertBackfilledPersonaForBrain,
  wipeExtractedPersonaForBrain,
  auditPersonaForBrain,
} from "./_lib/enrich.js";
import { flagsOf } from "./_lib/enrichFlags.js";
import { buildPrompt, loadExtractorContext } from "./_lib/extractPersonaFacts.js";
import { distillRejectedForUser } from "./_lib/distillRejected.js";
import { distillGmailForUser, loadRecentGmailDecisions } from "./_lib/distillGmail.js";
import { recordPatternDecision } from "./_lib/gmailPatternScore.js";
import {
  validateMergeRequest,
  checkMergeQuota,
  generateMergePreview,
  commitMerge,
} from "./_lib/mergeEntries.js";
import {
  buildPrompt as buildGmailPrompt,
  defaultPreferences as defaultGmailPreferences,
  type GmailLearnings,
} from "./_lib/gmailScan.js";
import { googleAiFetch, googleAiModelUrl } from "./_lib/googleAi.js";
import { handleDeleteEntry } from "./_lib/handlers/entryDelete.js";
import { bodyObject } from "./_lib/requestBody.js";
import { GEMINI_BULK_MODEL } from "./_lib/geminiModels.js";

const SB_URL = process.env.SUPABASE_URL;
const ENTRY_FIELDS =
  "id,title,content,type,tags,metadata,brain_id,importance,pinned,created_at,embedded_at,embedding_status,status";

function rateLimitForEntries(req: ApiRequest): number {
  const resource = req.query.resource as string | undefined;
  const action = req.query.action as string | undefined;
  if (resource === "audit") return 10;
  if (req.method === "GET" && !resource) return 60;
  if (action === "bulk-patch") return 30; // each call covers up to 200 ids
  // PATCH covers per-click "mark done", recategorise, pin/unpin. A user
  // clearing today's todos can fire 20-40 quick PATCHes; the old 30/min
  // cap turned a normal interaction into a 429. Bulk operations should
  // use ?action=bulk-patch (one request per N rows).
  if (req.method === "PATCH") return 120;
  return 30;
}

// Per-action rate-limit key suffix. Without this, every ?action=* GET shares
// the bare /api/entries bucket with the memory-feed list call — so opening
// the admin "Live Gmail Prompt" panel after a normal session would 429 on
// the first click. Action and resource queries get their own buckets so
// admin/debug paths don't compete with the feed.
function rateLimitKeyForEntries(req: ApiRequest): string | undefined {
  const action = req.query.action as string | undefined;
  const resource = req.query.resource as string | undefined;
  return action || resource || undefined;
}

// Dispatched via rewrites:
//   /api/delete-entry, /api/update-entry → /api/entries
export default withAuth(
  {
    methods: ["GET", "POST", "PATCH", "DELETE"],
    rateLimit: rateLimitForEntries,
    rateLimitKey: rateLimitKeyForEntries,
  },
  async (ctx) => {
    const resource = ctx.req.query.resource as string | undefined;
    const action = ctx.req.query.action as string | undefined;
    if (resource === "audit" && ctx.req.method === "POST") return handleAudit(ctx);
    if (resource === "graph") return handleGraph(ctx);
    // Action-based routes must be checked BEFORE the catch-all method handlers,
    // otherwise a generic `if (method === "GET") return handleGet(ctx)` shadows
    // any GET-with-action endpoint defined below it.
    if (ctx.req.method === "GET" && action === "enrich-debug") return handleEnrichDebug(ctx);
    if (ctx.req.method === "POST" && action === "enrich-batch") return handleEnrichBatch(ctx);
    if (ctx.req.method === "POST" && action === "backfill-persona")
      return handleBackfillPersona(ctx);
    if (ctx.req.method === "POST" && action === "revert-persona-backfill")
      return handleRevertPersonaBackfill(ctx);
    if (ctx.req.method === "POST" && action === "wipe-persona-extracted")
      return handleWipePersonaExtracted(ctx);
    if (ctx.req.method === "POST" && action === "audit-persona") return handleAuditPersona(ctx);
    if (ctx.req.method === "GET" && action === "persona-prompt") return handlePersonaPrompt(ctx);
    if (ctx.req.method === "POST" && action === "distill-rejected")
      return handleDistillRejected(ctx);
    if (ctx.req.method === "POST" && action === "distill-gmail")
      return handleDistillGmail(ctx);
    if (ctx.req.method === "POST" && action === "gmail-decision")
      return handleGmailDecision(ctx);
    if (ctx.req.method === "GET" && action === "gmail-prompt") return handleGmailPrompt(ctx);
    if (ctx.req.method === "POST" && action === "enrich-clear-backfill")
      return handleClearBackfill(ctx);
    if (ctx.req.method === "POST" && action === "enrich-retry-failed")
      return handleRetryFailed(ctx);
    if (ctx.req.method === "POST" && action === "empty-trash") return handleEmptyTrash(ctx);
    if (ctx.req.method === "POST" && action === "bulk-patch") return handleBulkPatch(ctx);
    if (ctx.req.method === "POST" && action === "merge") return handleMerge(ctx);
    if (ctx.req.method === "POST" && action === "merge-undo") return handleMergeUndo(ctx);
    if (ctx.req.method === "POST" && action === "merge_into") return handleMergeInto(ctx);
    if (ctx.req.method === "POST" && action === "move") return handleMoveEntry(ctx);
    if (ctx.req.method === "POST" && action === "share") return handleShareEntry(ctx);
    if (ctx.req.method === "POST" && action === "unshare") return handleUnshareEntry(ctx);
    if (ctx.req.method === "GET" && action === "shares") return handleListShares(ctx);
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
  const staged = req.query.staged === "true";

  // Targeted fetch by id list — used by the enrichment-progress poller
  // (replaced postgres_changes realtime, see src/hooks/useEntryRealtime.ts).
  // Caller passes ?ids=uuid1,uuid2,...; we filter to entries owned by the
  // requesting user and return the same { entries } shape as a list.
  const idsParam = req.query.ids as string | undefined;
  if (idsParam && typeof idsParam === "string") {
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
      .slice(0, 200);
    if (ids.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ entries: [] });
      return;
    }
    const idList = ids.map((id) => encodeURIComponent(id)).join(",");
    const url = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&user_id=eq.${encodeURIComponent(user.id)}&id=in.(${idList})`;
    const response = await fetch(url, { headers: sbHeadersNoContent() });
    if (!response.ok) throw new ApiError(502, "Database error");
    const rows = (await response.json()) as unknown[];
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ entries: rows });
    return;
  }

  const cursorFilter = cursor ? `&created_at=lt.${encodeURIComponent(cursor)}` : "";
  const deletedFilter = trash ? "&deleted_at=not.is.null" : "&deleted_at=is.null";
  const statusFilter = staged ? "&status=eq.staged" : "&status=eq.active";
  // Optional type filter — used by ProfileTab to fetch only persona entries.
  // Without this, About You loaded every entry and defaulted them all to the
  // "preference" bucket in the UI.
  const rawType = req.query.type as string | undefined;
  const typeFilter =
    rawType && /^[a-z_]+$/i.test(rawType) ? `&type=eq.${encodeURIComponent(rawType)}` : "";

  if (brain_id) {
    await requireBrainAccess(user.id, brain_id);

    // Share-overlay (migration 070): the brain's view = entries owned by
    // this brain UNION entries shared into it via entry_shares. Fetch the
    // share IDs first so we can pass them as an `id.in.(…)` clause to
    // PostgREST; capped to keep the URL short. If a brain ever exceeds
    // SHARES_FETCH_LIMIT shared entries we'll need a join view, but the
    // overlay is meant to be sparse (a handful of contacts per brain).
    const SHARES_FETCH_LIMIT = 500;
    const shareRes = await fetch(
      `${SB_URL}/rest/v1/entry_shares?target_brain_id=eq.${encodeURIComponent(brain_id)}&select=entry_id&limit=${SHARES_FETCH_LIMIT}`,
      { headers: sbHeadersNoContent() },
    );
    const sharedIds: string[] = shareRes.ok
      ? ((await shareRes.json()) as { entry_id: string }[]).map((r) => r.entry_id)
      : [];

    let brainScopeFilter = `&brain_id=eq.${encodeURIComponent(brain_id)}`;
    if (sharedIds.length > 0) {
      const idList = sharedIds.map((id) => encodeURIComponent(id)).join(",");
      brainScopeFilter = `&or=(brain_id.eq.${encodeURIComponent(brain_id)},id.in.(${idList}))`;
    }

    const directUrl = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=${limit + 1}${deletedFilter}${statusFilter}${typeFilter}${brainScopeFilter}${cursorFilter}`;
    const directRes = await fetch(directUrl, { headers: sbHeadersNoContent() });
    if (!directRes.ok) throw new ApiError(502, "Database error");
    const rows: any[] = await directRes.json();
    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? results[results.length - 1].created_at : null;
    // No browser caching — entries get pinned/edited/deleted/restored often
    // and a stale 5-min response causes "ghost" state in the UI (we hit this
    // exact race on pin/unpin and persona reject/restore).
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ entries: results, nextCursor, hasMore });
    return;
  }

  const url = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=${limit + 1}${deletedFilter}${statusFilter}${typeFilter}&user_id=eq.${encodeURIComponent(user.id)}${cursorFilter}`;
  const response = await fetch(url, { headers: sbHeadersNoContent() });
  if (!response.ok) throw new ApiError(502, "Database error");
  const rows: any[] = await response.json();
  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? results[results.length - 1].created_at : null;
  res.status(response.status).json({ entries: results, nextCursor, hasMore });
}

// ── DELETE /api/entries (was /api/delete-entry) — soft delete or hard delete ──
async function handleDelete(ctx: HandlerContext): Promise<void> {
  return handleDeleteEntry(ctx, { stripDeletedFromConceptGraph });
}

// ── PATCH /api/entries (was /api/update-entry) ──
async function handlePatch({ req, res, user, req_id, log }: HandlerContext): Promise<void> {
  const action = req.query.action as string | undefined;
  const body = bodyObject(req.body);

  if (action === "restore") {
    const { id } = body;
    if (!id || typeof id !== "string" || id.length > 100) {
      throw new ApiError(400, "Missing or invalid id");
    }
    const entryRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`,
      {
        headers: sbHeadersNoContent(),
      },
    );
    if (!entryRes.ok) throw new ApiError(502, "Database error");
    const [entryData]: any[] = await entryRes.json();
    if (!entryData) throw new ApiError(404, "Not found");
    await requireBrainRole(user.id, entryData.brain_id, ["owner", "member"]);

    const response = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(entryData.brain_id)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=representation" }),
        body: JSON.stringify({ deleted_at: null }),
      },
    );
    log.info("entry restore", { entry_id: id, ok: response.ok });
    const data: any = await response.json();
    res.status(response.ok ? 200 : 502).json(data);
    return;
  }

  const { id, title, content, type, tags, metadata, brain_id, status } = body;
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
  if (content !== undefined) patch.content = String(content).slice(0, 200_000);
  if (type !== undefined) patch.type = type;
  if (Array.isArray(tags)) patch.tags = tags.filter((t: any) => typeof t === "string").slice(0, 50);
  if (metadata !== undefined && typeof metadata === "object" && !Array.isArray(metadata))
    patch.metadata = metadata;
  if (brain_id !== undefined && typeof brain_id === "string" && brain_id.length <= 100)
    patch.brain_id = brain_id;
  if (status !== undefined) patch.status = status;

  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id,title,content,type,tags,metadata`,
    {
      headers: sbHeadersNoContent(),
    },
  );
  if (!entryRes.ok) throw new ApiError(502, "Database error");
  const [entry]: any[] = await entryRes.json();
  if (!entry) throw new ApiError(404, "Not found");
  await requireBrainRole(user.id, entry.brain_id, ["owner", "member"]);

  if (patch.brain_id !== undefined && patch.brain_id !== entry.brain_id) {
    await requireBrainRole(user.id, patch.brain_id, ["owner", "member"]);
  }

  const mergedTitle = patch.title ?? entry.title ?? "";
  const mergedContent = patch.content ?? entry.content ?? "";
  const mergedType = patch.type ?? entry.type ?? "note";
  const mergedTags = patch.tags ?? entry.tags ?? [];
  const mergedMeta = patch.metadata ?? entry.metadata ?? {};
  const cScore = computeCompletenessScore(
    mergedTitle,
    mergedContent,
    mergedType,
    mergedTags,
    mergedMeta,
  );
  const finalMeta = {
    ...(entry.metadata || {}),
    ...(patch.metadata || {}),
    completeness_score: cScore,
  };

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
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(entry.brain_id)}`,
    {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    },
  );

  log.info("entry patch", { entry_id: id, ok: response.ok });

  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      user_id: user.id,
      action: "entry_update",
      resource_id: id,
      request_id: req_id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  const data: any = await response.json();

  // Run enrichment BEFORE the response so the user sees fully-enriched state
  // on the next render. Previous fire-and-forget pattern was unreliable on
  // Vercel — the function instance gets killed after res.send so the IIFE
  // often never completed (proof: today's accepted Gmail entries had
  // enrichment.parsed=false with no last_error — meaning the step never
  // ran, not that it failed). Trade-off: PATCH is now slower (3-5s with
  // multiple LLM calls) but every entry is fully enriched on first try.
  // Hourly cron sweep (cron-hourly) is the safety net for any path that
  // somehow misses this — but the inline path should now succeed 100% of
  // the time the LLM is reachable.
  const promotedToActive = patch.status === "active";
  if (response.ok && (titleChanged || contentChanged || promotedToActive)) {
    if (promotedToActive && entry?.metadata?.source === "gmail") {
      // Gmail accept: pull attachments first so enrichInline's parse +
      // concept steps see attachment_text in metadata.
      try {
        const mod = await import("./_lib/gmailScan.js");
        await mod.extractGmailAttachmentsForEntry(id, user.id);
      } catch (e) {
        console.error("[entries:patch] attachment extract failed", e);
      }
    }
    try {
      await enrichInline(id, user.id);
    } catch (e) {
      console.error("[entries:patch] enrichInline failed", e);
    }
  }

  res.status(response.ok ? 200 : 502).json(data);
}

// ── POST /api/entries?action=bulk-patch ──
// One request, N rows. Covers cheap field updates (tags, status, pinned)
// without firing N separate PATCHes that hit the per-IP rate limit. Title
// or content changes are intentionally NOT allowed here — those re-trigger
// enrichment and shouldn't be batched silently.
async function handleBulkPatch({ req, res, user, req_id }: HandlerContext): Promise<void> {
  const { ids, patch } = bodyObject(req.body);
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, "ids: non-empty array required");
  }
  if (ids.length > 200) {
    throw new ApiError(400, "ids: max 200 per request");
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanIds = ids.filter((id): id is string => typeof id === "string" && uuidRe.test(id));
  if (cleanIds.length === 0) {
    throw new ApiError(400, "ids: must be UUIDs");
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new ApiError(400, "patch: object required");
  }
  const patchObj = patch as Record<string, unknown>;

  // Whitelist what the bulk path can change. tags + status + pinned cover
  // the real use cases (delete category, mark many done, bulk pin).
  const allowed: Record<string, unknown> = {};
  if (Array.isArray(patchObj.tags)) {
    allowed.tags = patchObj.tags
      .filter((t) => typeof t === "string")
      .slice(0, 50);
  }
  if (typeof patchObj.pinned === "boolean") {
    allowed.pinned = patchObj.pinned;
  }
  // status is per-entry metadata.status — applied via metadata merge below.
  let metadataStatus: string | null = null;
  if (typeof patchObj.status === "string") {
    metadataStatus = patchObj.status.slice(0, 50);
  }
  if (Object.keys(allowed).length === 0 && metadataStatus === null) {
    throw new ApiError(400, "patch: nothing to update (allowed: tags, pinned, status)");
  }

  const idList = cleanIds.map((id) => encodeURIComponent(id)).join(",");

  // metadata.status needs a per-row read-modify-write because PostgREST
  // doesn't expose a JSONB merge operator over a column update. Fetch the
  // current rows, merge, PATCH. Still one round-trip out + one back per
  // batch — drastically cheaper than N sequential network round-trips
  // through the API layer.
  let updated = 0;
  if (metadataStatus !== null) {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?id=in.(${idList})&user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null&select=id,metadata`,
      { headers: sbHeadersNoContent() },
    );
    if (!r.ok) throw new ApiError(502, "Database error");
    const rows: Array<{ id: string; metadata: Record<string, any> | null }> = await r.json();
    // Apply tags + pinned in the same body if present.
    await Promise.all(
      rows.map(async (row) => {
        const nextMeta = { ...(row.metadata ?? {}), status: metadataStatus };
        const body: Record<string, unknown> = { ...allowed, metadata: nextMeta };
        const pr = await fetch(
          `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(user.id)}`,
          {
            method: "PATCH",
            headers: sbHeaders({ Prefer: "return=minimal" }),
            body: JSON.stringify(body),
          },
        );
        if (pr.ok) updated++;
      }),
    );
  } else {
    // Pure tags / pinned bulk update — one PATCH covers everything.
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?id=in.(${idList})&user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=representation" }),
        body: JSON.stringify(allowed),
      },
    );
    if (!r.ok) throw new ApiError(502, "Database error");
    const rows: any[] = await r.json().catch(() => []);
    updated = rows.length;
  }

  // One audit log row per bulk action, not per affected entry — these are
  // the same logical operation from the user's POV.
  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      user_id: user.id,
      action: "entry_bulk_patch",
      resource_id: cleanIds[0], // first id as a representative anchor
      request_id: req_id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  res.status(200).json({ ok: true, updated, requested: cleanIds.length });
}

// ── concept-graph cleanup helper ─────────────────────────────────────────────
// Walks the brain's concept_graph row and strips a deleted entry's UUID from
// every concept's source_entries and every relationship's evidence_entries.
// Concepts whose source_entries become empty are dropped; same for
// relationships whose evidence_entries become empty. Runs as a single
// PATCH so we don't race a graph rebuild.
async function stripDeletedFromConceptGraph(brainId: string, entryId: string): Promise<void> {
  const r = await fetch(
    `${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(brainId)}&select=graph,updated_at&limit=1`,
    { headers: sbHeadersNoContent() },
  );
  if (!r.ok) return;
  const [row]: any[] = await r.json();
  if (!row?.graph) return;

  const concepts: any[] = Array.isArray(row.graph.concepts) ? row.graph.concepts : [];
  const relationships: any[] = Array.isArray(row.graph.relationships)
    ? row.graph.relationships
    : [];

  const cleanedConcepts = concepts
    .map((c) => {
      const sources: string[] = Array.isArray(c?.source_entries) ? c.source_entries : [];
      const next = sources.filter((sid) => sid !== entryId);
      if (next.length === sources.length) return c; // unchanged
      return { ...c, source_entries: next, frequency: next.length };
    })
    .filter((c) => Array.isArray(c.source_entries) && c.source_entries.length > 0);

  const cleanedRels = relationships
    .map((rel) => {
      const ev: string[] = Array.isArray(rel?.evidence_entries) ? rel.evidence_entries : [];
      const next = ev.filter((sid) => sid !== entryId);
      if (next.length === ev.length) return rel;
      return { ...rel, evidence_entries: next };
    })
    .filter((rel) => Array.isArray(rel.evidence_entries) && rel.evidence_entries.length > 0);

  // Skip the PATCH if nothing actually changed — avoids touching updated_at
  // (and triggering re-renders) for entries that were never in the graph.
  if (cleanedConcepts.length === concepts.length && cleanedRels.length === relationships.length) {
    const conceptUnchanged = cleanedConcepts.every((c, i) => c === concepts[i]);
    const relUnchanged = cleanedRels.every((r, i) => r === relationships[i]);
    if (conceptUnchanged && relUnchanged) return;
  }

  await fetch(`${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(brainId)}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      graph: { concepts: cleanedConcepts, relationships: cleanedRels },
      updated_at: new Date().toISOString(),
    }),
  });
}

// ── /api/audit (rewritten to /api/entries?resource=audit) ──
const AUDIT_GEMINI_BATCH = 50;
const AUDIT_MAX_TOKENS = 4096;
const AUDIT_DB_PAGE = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runGeminiBatch(
  lines: string,
  batchSet: Set<string>,
  apiKey: string,
  model: string,
  batchNum: number,
): Promise<any[]> {
  try {
    const r = await googleAiFetch(apiKey, googleAiModelUrl(model, "generateContent"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: lines }] }],
        systemInstruction: { parts: [{ text: SERVER_PROMPTS.ENTRY_AUDIT }] },
        generationConfig: { maxOutputTokens: AUDIT_MAX_TOKENS },
      }),
    });
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch (err: any) {
      console.log(`[audit] batch ${batchNum} parse error:`, String(err?.message ?? err));
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f: any) => f?.entryId && batchSet.has(f.entryId));
  } catch (e) {
    console.log(`[audit] batch ${batchNum} exception:`, e);
    return [];
  }
}

async function handleAudit({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id, pace } = bodyObject(req.body);
  if (typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
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
  const GEMINI_MODEL = GEMINI_BULK_MODEL;
  console.log(
    "[audit] model:",
    GEMINI_MODEL,
    "key set:",
    !!GEMINI_API_KEY,
    "total entries:",
    cappedEntries.length,
  );

  const numBatches = Math.ceil(cappedEntries.length / AUDIT_GEMINI_BATCH);
  const batchDelay = pace ? Math.max(2000, Math.floor(60000 / numBatches)) : 0;

  const allFlags: any[] = [];
  for (let i = 0; i < cappedEntries.length; i += AUDIT_GEMINI_BATCH) {
    if (i > 0 && batchDelay > 0) await sleep(batchDelay);
    const batch = cappedEntries.slice(i, i + AUDIT_GEMINI_BATCH);
    const batchSet = new Set(batch.map((e: any) => e.id));
    const lines = batch
      .map(
        (e: any) =>
          `ID: ${e.id}\nTitle: ${e.title}\nType: ${e.type}\nTags: ${(e.tags || []).join(", ")}\nContent: ${String(e.content || "").slice(0, 500)}\nMetadata: ${JSON.stringify(e.metadata || {})}`,
      )
      .join("\n\n---\n\n");
    const batchFlags = await runGeminiBatch(
      lines,
      batchSet,
      GEMINI_API_KEY,
      GEMINI_MODEL,
      Math.floor(i / AUDIT_GEMINI_BATCH) + 1,
    );
    allFlags.push(...batchFlags);
  }

  const flagsByEntry: Record<string, any[]> = {};
  for (const flag of allFlags) {
    if (!flagsByEntry[flag.entryId]) flagsByEntry[flag.entryId] = [];
    flagsByEntry[flag.entryId].push({
      type: flag.type,
      field: flag.field,
      currentValue: flag.currentValue ?? "",
      suggestedValue: flag.suggestedValue ?? "",
      reason: String(flag.reason || "").slice(0, 90),
    });
  }

  await Promise.all(
    cappedEntries.map(async (entry: any) => {
      const newFlags = flagsByEntry[entry.id] ?? null;
      const oldFlags = (entry.metadata as any)?.audit_flags ?? null;
      if (!newFlags?.length && !oldFlags?.length) return;
      const newMeta = { ...(entry.metadata || {}), audit_flags: newFlags };
      await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({ metadata: newMeta }),
      }).catch(() => {});
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
  const { brain_id, batch_size } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  // Cap raised from 10 → 50 so post-import enrichment (Keep / Takeout
  // bulk imports) drains in a reasonable number of polling rounds.
  const batchSize = typeof batch_size === "number" && batch_size > 0 ? Math.min(batch_size, 50) : 5;
  const result = await enrichBrain(user.id, brain_id, batchSize);
  res.status(200).json(result);
}

// ── POST /api/entries?action=backfill-persona ──
// Walks every entry in the brain, asks Gemini to extract 0..N short facts
// about the user, writes each as a NEW type='persona' entry linked back via
// metadata.derived_from. Source entries are never modified beyond stamping
// enrichment.persona_extracted=true. Capped per call so the function stays
// well under the Vercel timeout; the UI loops on `remaining > 0`.
async function handleBackfillPersona({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id, batch_size } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const batchSize =
    typeof batch_size === "number" && batch_size > 0 ? Math.min(batch_size, 100) : 50;
  const result = await backfillPersonaForBrain(user.id, brain_id, batchSize);
  res.status(200).json(result);
}

// ── POST /api/entries?action=revert-persona-backfill ──
// One-time cleanup: undoes the first-iteration backfill that wrongly flipped
// whole entries to type='persona'. Targets only entries the backfill itself
// produced (source != manual/chat, no derived_from) and best-guesses the
// original type from surviving tag/metadata signals. Idempotent.
async function handleRevertPersonaBackfill({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const result = await revertBackfilledPersonaForBrain(user.id, brain_id);
  res.status(200).json(result);
}

// ── POST /api/entries?action=wipe-persona-extracted ──
// Hard-deletes all auto-extracted persona child entries in the brain (the
// ones with metadata.derived_from set and source != manual/chat) and clears
// the persona_extracted flag from source entries so the next scan starts
// fresh. Manual / chat / pinned facts are preserved.
async function handleWipePersonaExtracted({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const result = await wipeExtractedPersonaForBrain(user.id, brain_id);
  res.status(200).json(result);
}

// ── POST /api/entries?action=audit-persona ──
// Walks every active persona fact and bulk-rejects ones that:
//   1. Duplicate another active fact (cosine ≥ 0.85 / normalized title match)
//   2. Match a previously-rejected pattern (cosine ≥ 0.85 vs rejected pool)
//   3. Are already covered by the user's About-You text (cosine ≥ 0.72)
// User-confirmed sources (manual / chat / pinned) are NEVER touched. The
// rejected-status preserves provenance so the user can un-reject if wrong.
async function handleAuditPersona({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const result = await auditPersonaForBrain(user.id, brain_id);
  res.status(200).json(result);
}

// ── GET /api/entries?action=persona-prompt — admin only ──
// Returns the live extractor context (name / pronouns / About You / confirmed
// facts / rejected patterns) plus the fully-rendered prompt that would be
// sent to Gemini for THIS user. Powers the bottom-of-Personal debug panel
// so the admin can watch the prompt evolve as they reject/confirm facts.
async function handlePersonaPrompt({ req, res, user }: HandlerContext): Promise<void> {
  if (!isAdminUser(user)) throw new ApiError(403, "Forbidden");
  const brain_id = req.query.brain_id as string | undefined;
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const ctx = await loadExtractorContext(user.id, brain_id);
  const prompt = buildPrompt(ctx);
  res.status(200).json({ context: ctx, prompt });
}

// ── POST /api/entries?action=distill-rejected — admin only ──
// On-demand refresh of the user's rejected-pattern summary. Same logic that
// runs weekly via runPersonaWeeklyPass, but exposed here so the admin can
// watch the summary update in real time after rejecting new facts.
async function handleDistillRejected({ res, user }: HandlerContext): Promise<void> {
  if (!isAdminUser(user)) throw new ApiError(403, "Forbidden");
  const result = await distillRejectedForUser(user.id);
  res.status(result.ok ? 200 : 502).json(result);
}

// ── POST /api/entries?action=distill-gmail — admin only ──
// On-demand Gmail accept/reject distillation. Same shape as the persona
// version; refreshes accepted_summary + rejected_summary on gmail_integrations.
async function handleDistillGmail({ res, user }: HandlerContext): Promise<void> {
  if (!isAdminUser(user)) throw new ApiError(403, "Forbidden");
  const result = await distillGmailForUser(user.id);
  res.status(result.ok ? 200 : 502).json(result);
}

// ── POST /api/entries?action=gmail-decision ──
// Records a user's accept/reject of a staged Gmail entry. The decision row
// becomes part of the learning set the classifier prompt reads from on the
// next scan. After every 20 decisions we fire a fire-and-forget distill so
// the rules stay current without manual intervention.
async function handleGmailDecision({ req, res, user }: HandlerContext): Promise<void> {
  const { decision, subject, from_email, from_name, snippet, reason, source_id, cluster_size } =
    bodyObject(req.body);
  if (decision !== "accept" && decision !== "reject") {
    throw new ApiError(400, "decision must be 'accept' or 'reject'");
  }
  // Clamp cluster weight to [1, 50]. Cap=50 prevents a runaway scanner
  // from poisoning a pattern in one tap; floor=1 keeps non-cluster rows
  // sane.
  const clusterWeight =
    typeof cluster_size === "number" && Number.isFinite(cluster_size)
      ? Math.max(1, Math.min(50, Math.round(cluster_size)))
      : 1;
  const row: Record<string, unknown> = {
    user_id: user.id,
    decision,
    subject: typeof subject === "string" ? subject.slice(0, 500) : null,
    from_email: typeof from_email === "string" ? from_email.slice(0, 200) : null,
    from_name: typeof from_name === "string" ? from_name.slice(0, 200) : null,
    snippet: typeof snippet === "string" ? snippet.slice(0, 600) : null,
    reason: typeof reason === "string" ? reason.slice(0, 200) : null,
    source_id: typeof source_id === "string" ? source_id.slice(0, 100) : null,
  };
  const insert = await fetch(`${SB_URL}/rest/v1/gmail_decisions`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(row),
  });
  if (!insert.ok) {
    const body = await insert.text().catch(() => "");
    throw new ApiError(502, `gmail_decisions insert HTTP ${insert.status}: ${body.slice(0, 200)}`);
  }

  // Auto-fire distill at multiples of 20. Fire-and-forget so the user's
  // accept/reject roundtrip stays snappy.
  const countRes = await fetch(
    `${SB_URL}/rest/v1/gmail_decisions?user_id=eq.${encodeURIComponent(user.id)}&select=id`,
    { headers: sbHeaders({ Prefer: "count=exact" }) },
  ).catch(() => null);
  const total = parseInt(
    countRes?.headers.get("content-range")?.split("/")[1] || "0",
    10,
  );
  if (total > 0 && total % 20 === 0) {
    distillGmailForUser(user.id).catch(() => {});
  }

  // Pattern-rule scoring (Alt 1 — see api/_lib/gmailPatternScore.ts). Embeds
  // the email, finds nearest pattern at cosine ≥ 0.82, bumps accept/reject
  // score capped at 10, and starts a 7-day probation when accept_score first
  // crosses 8. Fire-and-forget so the staging-inbox tap stays snappy.
  recordPatternDecision({
    userId: user.id,
    decision,
    subject: row.subject as string | null,
    from_email: row.from_email as string | null,
    from_name: row.from_name as string | null,
    snippet: row.snippet as string | null,
    reason: row.reason as string | null,
    weight: clusterWeight,
  }).catch((e) => console.error("[gmail-pattern] decision recorder failed:", e));

  res.status(200).json({ ok: true, total });
}

// ── GET /api/entries?action=gmail-prompt — admin only ──
// Returns the live Gmail classifier learnings + a sample rendered prompt so
// the admin debug panel can show the same "watch it learn" view we have
// for persona.
async function handleGmailPrompt({ res, user }: HandlerContext): Promise<void> {
  if (!isAdminUser(user)) throw new ApiError(403, "Forbidden");

  // Single parallel wave for everything the panel needs. The previous shape
  // was 7 sequential round-trips: integration → dynamic import → recent
  // decisions → count(accept) → count(reject) → loadGmailLearnings (which
  // calls recent decisions A SECOND TIME) → buildPrompt. On a cold lambda
  // that easily took 1.5–3 s. Now: one wave of 4 fetches in parallel, then
  // CPU-only prompt assembly with the recent decisions already in hand.
  const userIdEnc = encodeURIComponent(user.id);
  const [integRes, recent, cAcc, cRej] = await Promise.all([
    fetch(
      `${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${userIdEnc}&select=accepted_summary,rejected_summary,summary_updated_at,preferences&limit=1`,
      { headers: sbHeadersNoContent() },
    ),
    loadRecentGmailDecisions(user.id, 5).catch(() => ({ accepts: [], rejects: [] })),
    fetch(
      `${SB_URL}/rest/v1/gmail_decisions?user_id=eq.${userIdEnc}&decision=eq.accept&select=id&limit=1`,
      { headers: sbHeaders({ Prefer: "count=exact" }) },
    ),
    fetch(
      `${SB_URL}/rest/v1/gmail_decisions?user_id=eq.${userIdEnc}&decision=eq.reject&select=id&limit=1`,
      { headers: sbHeaders({ Prefer: "count=exact" }) },
    ),
  ]);

  if (!integRes.ok) throw new ApiError(502, `gmail_integrations HTTP ${integRes.status}`);
  const rows: any[] = await integRes.json();
  const integ = rows[0] ?? null;
  if (!integ) {
    res.status(200).json({
      connected: false,
      acceptedSummary: null,
      rejectedSummary: null,
      summaryUpdatedAt: null,
      recentAccepts: [],
      recentRejects: [],
      counts: { accepts: 0, rejects: 0 },
      prompt: null,
    });
    return;
  }

  const accepts = parseInt(cAcc.headers.get("content-range")?.split("/")[1] || "0", 10);
  const rejects = parseInt(cRej.headers.get("content-range")?.split("/")[1] || "0", 10);

  // Catch-up distill — the auto-trigger in the staging endpoint only fires
  // every 20 decisions, which leaves a gap when a user crosses the
  // MIN_FOR_DISTILL threshold (3) for the first time. If we have enough
  // signal for a side but no summary yet, fire-and-forget so the panel
  // populates on the next refresh (or the auto-reload below).
  const MIN_FOR_DISTILL = 3;
  const acceptedSummary = (integ.accepted_summary ?? "").trim() || null;
  const rejectedSummary = (integ.rejected_summary ?? "").trim() || null;
  const acceptsNeedDistill = accepts >= MIN_FOR_DISTILL && !acceptedSummary;
  const rejectsNeedDistill = rejects >= MIN_FOR_DISTILL && !rejectedSummary;
  const pending_distill = acceptsNeedDistill || rejectsNeedDistill;
  if (pending_distill) {
    distillGmailForUser(user.id).catch((e) =>
      console.error("[gmail-prompt] catch-up distill failed:", e?.message ?? e),
    );
  }

  // Render the literal classifier prompt template the live scan uses, with
  // a placeholder block instead of real email threads. Same buildPrompt the
  // runtime calls — what you see is exactly what Gemini sees, minus the
  // per-scan thread data. We assemble GmailLearnings inline from what we
  // already fetched, instead of calling loadGmailLearnings (which would
  // trigger a second loadRecentGmailDecisions round-trip).
  let prompt: string | null = null;
  try {
    const learnings: GmailLearnings = {
      acceptedSummary: (integ.accepted_summary ?? "").trim() || null,
      rejectedSummary: (integ.rejected_summary ?? "").trim() || null,
      recentAccepts: recent.accepts.map((a) => ({
        subject: a.subject,
        from: a.from,
        reason: a.reason,
      })),
      recentRejects: recent.rejects.map((r) => ({
        subject: r.subject,
        from: r.from,
        reason: r.reason,
      })),
      // Admin debug panel doesn't fetch scored rules; the template just
      // shows the static prompt skeleton. Live scans assemble this via
      // loadGmailLearnings which queries gmail_pattern_rules.
      scoredRulesBlock: "",
    };
    const prefs = integ.preferences ?? defaultGmailPreferences();
    const placeholder: any = {
      messages: [
        {
          from: "<sender will appear here at scan time>",
          subject: "<subject>",
          date: "<date>",
          body: "<email body, up to 400 chars>",
          attachments: [],
        },
      ],
      participants: ["<all participants>"],
    };
    prompt = buildGmailPrompt([placeholder], prefs, learnings);
  } catch (e: any) {
    console.error("[gmail-prompt] template render failed:", e?.message ?? e);
  }

  res.status(200).json({
    connected: true,
    acceptedSummary: integ.accepted_summary ?? null,
    rejectedSummary: integ.rejected_summary ?? null,
    summaryUpdatedAt: integ.summary_updated_at ?? null,
    recentAccepts: recent.accepts,
    recentRejects: recent.rejects,
    counts: { accepts, rejects },
    preferences: integ.preferences ?? null,
    prompt,
    pending_distill,
  });
}

function isAdminUser(user: { app_metadata?: Record<string, unknown> }): boolean {
  // Multi-admin via auth.users.raw_app_meta_data.is_admin (set in Supabase
  // dashboard / SQL). Replaces the older single-email env-var gate. The flag
  // rides in the JWT — server reads it from the verified token, no extra
  // DB hit needed. To grant admin: see Docs/Components/auth.md.
  return user.app_metadata?.is_admin === true;
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
    missing_concepts: all.filter((e) => e.type !== "secret" && !flagsOf(e).concepts_extracted)
      .length,
    missing_embedding: all.filter(
      (e) =>
        e.type !== "secret" && !flagsOf(e).embedded && flagsOf(e).embedding_status !== "failed",
    ).length,
    failed_embedding: all.filter(
      (e) => e.type !== "secret" && flagsOf(e).embedding_status === "failed",
    ).length,
    fully_pending: all.filter((e) => {
      if (e.type === "secret") return false;
      const f = flagsOf(e);
      return !f.parsed || !f.has_insight || !f.concepts_extracted || !f.embedded;
    }).length,
    backfilled: all.filter((e) => flagsOf(e).backfilled).length,
  };

  // Sort by missing-flag count desc so stuck entries surface first. The
  // chronological list was less useful — fully-enriched entries dominated
  // the top slots and the actual outliers got buried. Tiebreak by created_at
  // desc to keep recent ordering within an equivalence class.
  const missingCount = (e: any): number => {
    if (e.type === "secret") return 0;
    const f = flagsOf(e);
    let n = 0;
    if (!f.parsed) n++;
    if (!f.has_insight) n++;
    if (!f.concepts_extracted) n++;
    if (!f.embedded && f.embedding_status !== "failed") n++;
    if (f.embedding_status === "failed") n++;
    return n;
  };
  const ranked = [...all].sort((a, b) => {
    const diff = missingCount(b) - missingCount(a);
    if (diff !== 0) return diff;
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  const recent = ranked.slice(0, 12).map((e) => {
    const enr = ((e.metadata as any) ?? {}).enrichment ?? {};
    return {
      id: e.id,
      title: e.title,
      type: e.type,
      created_at: e.created_at,
      flags: flagsOf(e),
      // Surface the per-run breadcrumbs the pipeline now stamps so admins can
      // tell "transient 429" from "never attempted" without having to query SQL.
      last_error: typeof enr.last_error === "string" ? enr.last_error : null,
      attempts: typeof enr.attempts === "number" ? enr.attempts : 0,
      last_attempt_at: typeof enr.last_attempt_at === "string" ? enr.last_attempt_at : null,
    };
  });

  res.status(200).json({
    providers: {
      gemini: !!process.env.GEMINI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gemini_chat_model: process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash",
      gemini_bulk_model: GEMINI_BULK_MODEL,
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
  const { brain_id } = bodyObject(req.body);
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
  const { brain_id } = bodyObject(req.body);
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

// ── POST /api/entries?action=empty-trash ──
// Hard-deletes every soft-deleted entry the user owns. Returns the deleted
// IDs so the client (and the audit log) can confirm the count. FK cascades
// take care of links / tags / collection memberships; the brain-level
// concept_graphs row isn't a foreign key target, so we strip the deleted
// IDs from there in a follow-up pass per affected brain.
async function handleEmptyTrash({ res, user, req_id }: HandlerContext): Promise<void> {
  // Pull the soon-to-be-deleted ids first so we can clean concept_graphs
  // afterwards. PostgREST DELETE with `Prefer: return=representation`
  // returns the deleted rows so we don't need a separate select.
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(user.id)}&deleted_at=not.is.null&select=id,brain_id`,
    {
      method: "DELETE",
      headers: sbHeaders({ Prefer: "return=representation" }),
    },
  );
  if (!r.ok) {
    const err = await r.text().catch(() => String(r.status));
    console.error(`[empty-trash] HTTP ${r.status}: ${err}`);
    throw new ApiError(502, "Failed to clear trash");
  }
  const deleted: { id: string; brain_id: string }[] = await r.json();

  // One pass per affected brain — concept_graphs is keyed by brain_id, and
  // a single PATCH per brain is cheaper than per-entry. Group ids first.
  const byBrain = new Map<string, string[]>();
  for (const row of deleted) {
    const list = byBrain.get(row.brain_id);
    if (list) list.push(row.id);
    else byBrain.set(row.brain_id, [row.id]);
  }
  for (const [brainId, ids] of byBrain) {
    for (const entryId of ids) {
      stripDeletedFromConceptGraph(brainId, entryId).catch((err: any) =>
        console.error("[empty-trash:concept-graph]", err?.message ?? err),
      );
    }
  }

  console.log(`[audit] EMPTY_TRASH user=${user.id} count=${deleted.length}`);
  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      user_id: user.id,
      action: "empty_trash",
      resource_id: null,
      request_id: req_id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  res.status(200).json({ deleted: deleted.length });
}

// ── POST /api/entries?action=merge ──────────────────────────────────────────
// Combine 2-8 user-selected entries into a single LLM-generated merged entry,
// then soft-delete the sources. Two-phase via the `preview` flag in the body:
//
//   preview=true  → LLM generates {title, content, type, tags}, NO DB writes.
//                   Frontend shows it in a modal, user can edit.
//   preview=false → frontend re-POSTs with the (possibly edited) fields,
//                   server inserts merged entry, awaits enrichInline up to
//                   60s, then soft-deletes sources, writes audit_log row.
//
// Validation: all ids must be UUIDs, must belong to caller, must share a
// brain_id, none can be vault (type='secret') — vault contents can't be sent
// to LLM. Range: 2 ≤ N ≤ 8 (above 8 the merge LLM context starts dropping
// fidelity AND cost balloons).
//
// Quota: 1 credit per merge (the inline enrichInline call consumes one).
// We peek upfront so over-quota free users get a clean 429 instead of a
// half-merged state.
async function handleMerge({ req, res, user }: HandlerContext): Promise<void> {
  const body = bodyObject(req.body);
  const validation = await validateMergeRequest(user.id, body.ids);
  await checkMergeQuota(user.id);

  const isPreview = body.preview === true;

  // ── Preview mode — call LLM, return merged shape, no DB writes
  if (isPreview) {
    const fields = await generateMergePreview(validation.sources, user.id);
    res.status(200).json({
      preview: true,
      ...fields,
      source_count: validation.sources.length,
    });
    return;
  }

  // ── Commit mode — caller passes the (possibly user-edited) fields.
  const body_ = body as { title?: unknown; content?: unknown; type?: unknown; tags?: unknown };
  const fields = {
    title: typeof body_.title === "string" ? body_.title : "",
    content: typeof body_.content === "string" ? body_.content : "",
    type: typeof body_.type === "string" ? body_.type : "note",
    tags: Array.isArray(body_.tags)
      ? (body_.tags.filter((t): t is string => typeof t === "string"))
      : [],
  };
  const result = await commitMerge(user.id, validation, { fields });
  res.status(200).json({ ok: true, ...result });
}

// ── POST /api/entries?action=merge-undo ─────────────────────────────────────
// Reverses a recent merge — hard-deletes the merged entry and resurrects
// the sources by clearing deleted_at. Used by the post-merge Undo toast
// (10-second window). Defends with metadata.merged_from check so a caller
// can't undo arbitrary entries by guessing IDs.
async function handleMergeUndo({ req, res, user }: HandlerContext): Promise<void> {
  const body = bodyObject(req.body);
  const mergedId: unknown = body.merged_id;
  const sourceIds: unknown = body.source_ids;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof mergedId !== "string" || !uuidRe.test(mergedId)) {
    throw new ApiError(400, "merged_id must be a valid uuid");
  }
  if (!Array.isArray(sourceIds) || sourceIds.length < 2 || sourceIds.length > 8) {
    throw new ApiError(400, "source_ids must be 2-8 valid uuids");
  }
  const cleanSourceIds: string[] = [];
  for (const raw of sourceIds) {
    if (typeof raw !== "string" || !uuidRe.test(raw)) {
      throw new ApiError(400, "source_ids must be valid uuids");
    }
    cleanSourceIds.push(raw);
  }

  // Verify the merged entry exists, belongs to the user, and was created
  // by a merge of EXACTLY these source ids. The merged_from check stops
  // a malicious caller from undoing arbitrary entries.
  const mergedRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(mergedId)}&user_id=eq.${encodeURIComponent(user.id)}&select=metadata`,
    { headers: sbHeadersNoContent() },
  );
  if (!mergedRes.ok) throw new ApiError(502, "Database error");
  const [mergedRow]: any[] = await mergedRes.json();
  if (!mergedRow) throw new ApiError(404, "Merged entry not found");
  const mergedFrom: string[] = Array.isArray(mergedRow.metadata?.merged_from)
    ? mergedRow.metadata.merged_from
    : [];
  const expectSet = new Set(cleanSourceIds);
  const actualSet = new Set(mergedFrom);
  const sameSet = expectSet.size === actualSet.size && [...expectSet].every((id) => actualSet.has(id));
  if (!sameSet) {
    throw new ApiError(400, "merged_from mismatch — refusing to undo");
  }

  // Resurrect sources, hard-delete merged
  const sourceIdList = cleanSourceIds.map((id) => encodeURIComponent(id)).join(",");
  await Promise.all([
    fetch(
      `${SB_URL}/rest/v1/entries?id=in.(${sourceIdList})&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({ deleted_at: null }),
      },
    ),
    fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(mergedId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      { method: "DELETE", headers: sbHeaders({ Prefer: "return=minimal" }) },
    ),
  ]);

  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      user_id: user.id,
      action: "entries_merge_undone",
      resource_id: mergedId,
      metadata: { source_ids: cleanSourceIds },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  res.status(200).json({ ok: true, restored: cleanSourceIds.length });
}

// ── POST /api/entries?action=merge_into — merge source entry into target, then soft-delete source ──
async function handleMergeInto({ req, res, user }: HandlerContext): Promise<void> {
  const source_id = req.query.id as string | undefined;
  const { target_id } = bodyObject(req.body);
  if (!source_id || typeof source_id !== "string" || source_id.length > 100)
    throw new ApiError(400, "Missing or invalid id");
  if (!target_id || typeof target_id !== "string" || target_id.length > 100)
    throw new ApiError(400, "Missing or invalid target_id");
  if (source_id === target_id) throw new ApiError(400, "source and target must differ");

  const [sourceRes, targetRes] = await Promise.all([
    fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(source_id)}&select=${encodeURIComponent(ENTRY_FIELDS)}`,
      { headers: sbHeadersNoContent() },
    ),
    fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(target_id)}&select=${encodeURIComponent(ENTRY_FIELDS)}`,
      { headers: sbHeadersNoContent() },
    ),
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
  const mergedTags = Array.from(new Set([...(target.tags ?? []), ...(source.tags ?? [])])).slice(
    0,
    50,
  );

  const patchRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(target_id)}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({ content: mergedContent, tags: mergedTags }),
  });
  if (!patchRes.ok) throw new ApiError(502, "Failed to update target entry");

  await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(source_id)}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });

  console.log(`[audit] MERGE_INTO source=${source_id} target=${target_id} user=${user.id}`);

  const [updated] = await patchRes.json();
  res.status(200).json(updated ?? { ok: true });
  enrichInline(target_id, user.id).catch(() => {});
}

// ── POST /api/entries?action=move&id=<entry>&brain_id=<dest> — move entry between brains ──
//
// Phase 1 of multi-brain. Caller must own both source and destination brains
// (no sharing yet in phase 1, so cross-user moves are impossible by RLS anyway).
// Side effects:
//   1. UPDATE entries SET brain_id = <dest>
//   2. Strip the entry from the SOURCE brain's concept_graph snapshot — graph
//      view in the source brain immediately stops referencing the moved entry.
//   3. Mark embedding_status = 'pending' so the destination brain's enrichment
//      pass re-derives concepts and similarity in its own context.
async function handleMoveEntry({ req, res, user, req_id }: HandlerContext): Promise<void> {
  const id = req.query.id as string | undefined;
  const dest = req.query.brain_id as string | undefined;
  if (!id || typeof id !== "string" || id.length > 100)
    throw new ApiError(400, "Missing or invalid id");
  if (!dest || typeof dest !== "string" || dest.length > 100)
    throw new ApiError(400, "Missing or invalid brain_id");

  // Load the entry to discover the source brain.
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=id,brain_id,user_id,metadata`,
    { headers: sbHeadersNoContent() },
  );
  if (!entryRes.ok) throw new ApiError(502, "Database error");
  const [entry]: any[] = await entryRes.json();
  if (!entry) throw new ApiError(404, "Entry not found");
  if (entry.user_id !== user.id) throw new ApiError(403, "Forbidden");

  // Caller must own both brains. Source check guards the read; dest check
  // prevents moving an entry into a brain the user doesn't own.
  await Promise.all([
    requireBrainAccess(user.id, entry.brain_id),
    requireBrainAccess(user.id, dest),
  ]);

  if (entry.brain_id === dest) {
    return void res.status(200).json({ ok: true, unchanged: true });
  }

  const sourceBrainId: string = entry.brain_id;

  const upd = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      brain_id: dest,
      // Force re-enrichment in the new brain context.
      embedding_status: "pending",
      embedded_at: null,
      metadata: clearContextEnrichmentFlags(entry.metadata),
    }),
  });
  if (!upd.ok) throw new ApiError(502, "Failed to move entry");

  // If the entry was previously shared into the destination brain, that
  // share row is now redundant (the entry IS in that brain). Drop it so
  // the brain doesn't list the entry twice via OR logic in handleGet.
  fetch(
    `${SB_URL}/rest/v1/entry_shares?entry_id=eq.${encodeURIComponent(id)}&target_brain_id=eq.${encodeURIComponent(dest)}`,
    { method: "DELETE", headers: sbHeaders({ Prefer: "return=minimal" }) },
  ).catch(() => {});

  // Strip from source brain's concept graph snapshot. Don't await — fire and
  // forget; failure here just leaves a dangling reference until next rebuild.
  stripDeletedFromConceptGraph(sourceBrainId, id).catch((err: any) =>
    console.error("[move:concept-graph]", err?.message ?? err),
  );

  // Audit trail
  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      user_id: user.id,
      action: "entry_move",
      resource_id: id,
      request_id: req_id,
      details: { from: sourceBrainId, to: dest },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  // Re-enrich in destination brain context. Best-effort; user sees move
  // immediately even if enrichment is slow.
  enrichInline(id, user.id).catch(() => {});

  res.status(200).json({ ok: true, brain_id: dest });
}

function clearContextEnrichmentFlags(metadata: unknown): Record<string, unknown> {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const enrichment =
    meta.enrichment && typeof meta.enrichment === "object" && !Array.isArray(meta.enrichment)
      ? { ...(meta.enrichment as Record<string, unknown>) }
      : {};
  delete enrichment.has_insight;
  delete enrichment.insight;
  delete enrichment.concepts_extracted;
  delete enrichment.concepts;
  delete enrichment.parsed;
  meta.enrichment = enrichment;
  delete meta.summary;
  delete meta.concepts;
  return meta;
}

// ── /api/entries?action=share — overlay an entry into another brain ──
//
// Share-overlay model (migration 070): the entry stays owned by its
// source brain (entries.brain_id) and a row in entry_shares makes it
// visible inside the target brain too. No duplication, no separate
// enrichment cost — edits in the source reflect everywhere.
async function handleShareEntry({ req, res, user, req_id }: HandlerContext): Promise<void> {
  const id = req.query.id as string | undefined;
  const target = req.query.brain_id as string | undefined;
  if (!id || typeof id !== "string" || id.length > 100)
    throw new ApiError(400, "Missing or invalid id");
  if (!target || typeof target !== "string" || target.length > 100)
    throw new ApiError(400, "Missing or invalid brain_id");

  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=id,brain_id,user_id`,
    { headers: sbHeadersNoContent() },
  );
  if (!entryRes.ok) throw new ApiError(502, "Database error");
  const [entry]: any[] = await entryRes.json();
  if (!entry) throw new ApiError(404, "Entry not found");
  if (entry.user_id !== user.id) throw new ApiError(403, "Forbidden");
  if (entry.brain_id === target) {
    return void res.status(200).json({ ok: true, unchanged: true, reason: "same_brain" });
  }
  await Promise.all([
    requireBrainAccess(user.id, entry.brain_id),
    requireBrainAccess(user.id, target),
  ]);

  const ins = await fetch(`${SB_URL}/rest/v1/entry_shares`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal,resolution=ignore-duplicates" }),
    body: JSON.stringify({
      entry_id: id,
      target_brain_id: target,
      shared_by: user.id,
    }),
  });
  if (!ins.ok && ins.status !== 409) throw new ApiError(502, "Failed to share entry");

  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      user_id: user.id,
      action: "entry_share",
      resource_id: id,
      request_id: req_id,
      details: { source: entry.brain_id, target },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  res.status(200).json({ ok: true, target_brain_id: target });
}

async function handleUnshareEntry({ req, res, user, req_id }: HandlerContext): Promise<void> {
  const id = req.query.id as string | undefined;
  const target = req.query.brain_id as string | undefined;
  if (!id || typeof id !== "string" || id.length > 100)
    throw new ApiError(400, "Missing or invalid id");
  if (!target || typeof target !== "string" || target.length > 100)
    throw new ApiError(400, "Missing or invalid brain_id");

  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id,user_id`,
    { headers: sbHeadersNoContent() },
  );
  if (!entryRes.ok) throw new ApiError(502, "Database error");
  const [entry]: any[] = await entryRes.json();
  if (!entry) throw new ApiError(404, "Entry not found");
  if (entry.user_id !== user.id) throw new ApiError(403, "Forbidden");

  const del = await fetch(
    `${SB_URL}/rest/v1/entry_shares?entry_id=eq.${encodeURIComponent(id)}&target_brain_id=eq.${encodeURIComponent(target)}`,
    { method: "DELETE", headers: sbHeaders({ Prefer: "return=minimal" }) },
  );
  if (!del.ok) throw new ApiError(502, "Failed to unshare entry");

  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      user_id: user.id,
      action: "entry_unshare",
      resource_id: id,
      request_id: req_id,
      details: { target },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});

  res.status(200).json({ ok: true });
}

// GET ?action=shares&id=X — list brains the entry is currently shared into.
async function handleListShares({ req, res, user }: HandlerContext): Promise<void> {
  const id = req.query.id as string | undefined;
  if (!id || typeof id !== "string" || id.length > 100)
    throw new ApiError(400, "Missing or invalid id");

  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id,user_id`,
    { headers: sbHeadersNoContent() },
  );
  if (!entryRes.ok) throw new ApiError(502, "Database error");
  const [entry]: any[] = await entryRes.json();
  if (!entry) throw new ApiError(404, "Entry not found");
  if (entry.user_id !== user.id) throw new ApiError(403, "Forbidden");

  const r = await fetch(
    `${SB_URL}/rest/v1/entry_shares?entry_id=eq.${encodeURIComponent(id)}&select=target_brain_id,shared_at`,
    { headers: sbHeadersNoContent() },
  );
  if (!r.ok) throw new ApiError(502, "Database error");
  const rows: any[] = await r.json();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ shares: rows });
}

// ── /api/graph (rewritten to /api/entries?resource=graph) ──
async function handleGraph({ req, res, user }: HandlerContext): Promise<void> {
  // No browser caching — entries get added/deleted regularly, and an hour-stale
  // graph hides new connections from the user. Cost is one extra fetch when
  // GraphView re-mounts.
  res.setHeader("Cache-Control", "no-store");
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
  const { brain_id, graph } = bodyObject(req.body);
  if (typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  if (!graph || typeof graph !== "object" || Array.isArray(graph))
    throw new ApiError(400, "graph required");
  const graphObj = graph as Record<string, unknown>;
  await requireBrainAccess(user.id, brain_id);

  const safeGraph = {
    concepts: Array.isArray(graphObj.concepts) ? graphObj.concepts.slice(0, 500) : [],
    relationships: Array.isArray(graphObj.relationships)
      ? graphObj.relationships.slice(0, 500)
      : [],
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
