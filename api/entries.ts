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
import { enrichInline, enrichBrain } from "./_lib/enrich.js";
import { flagsOf } from "./_lib/enrichFlags.js";
import { handleDeleteEntry } from "./_lib/handlers/entryDelete.js";
import {
  handleMerge as handleMergeExtracted,
  handleMergeUndo as handleMergeUndoExtracted,
  handleMergeInto as handleMergeIntoExtracted,
} from "./_lib/handlers/entryMerge.js";
import {
  handleBackfillPersona as handleBackfillPersonaExtracted,
  handleRevertPersonaBackfill as handleRevertPersonaBackfillExtracted,
  handleWipePersonaExtracted as handleWipePersonaExtractedExtracted,
  handleAuditPersona as handleAuditPersonaExtracted,
  handlePersonaPrompt as handlePersonaPromptExtracted,
  handleDistillRejected as handleDistillRejectedExtracted,
} from "./_lib/handlers/entryPersona.js";
import { bodyObject } from "./_lib/requestBody.js";
import { GEMINI_BULK_MODEL } from "./_lib/geminiModels.js";
import { isAdminUser } from "./_lib/adminAuth.js";
import { writeAuditLog } from "./_lib/auditLog.js";
import { callAI, type AICall } from "./_lib/aiProvider.js";
import { resolveProviderForUser } from "./_lib/resolveProvider.js";

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
// the bare /api/entries bucket with the memory-feed list call — so the
// admin debug panels would 429 the first time you opened them after a
// normal session. Action and resource queries get their own buckets so
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
      return handleBackfillPersonaExtracted(ctx);
    if (ctx.req.method === "POST" && action === "revert-persona-backfill")
      return handleRevertPersonaBackfillExtracted(ctx);
    if (ctx.req.method === "POST" && action === "wipe-persona-extracted")
      return handleWipePersonaExtractedExtracted(ctx);
    if (ctx.req.method === "POST" && action === "audit-persona")
      return handleAuditPersonaExtracted(ctx);
    if (ctx.req.method === "GET" && action === "persona-prompt")
      return handlePersonaPromptExtracted(ctx);
    if (ctx.req.method === "POST" && action === "distill-rejected")
      return handleDistillRejectedExtracted(ctx);
    if (ctx.req.method === "POST" && action === "enrich-clear-backfill")
      return handleClearBackfill(ctx);
    if (ctx.req.method === "POST" && action === "enrich-retry-failed")
      return handleRetryFailed(ctx);
    if (ctx.req.method === "POST" && action === "empty-trash") return handleEmptyTrash(ctx);
    if (ctx.req.method === "POST" && action === "bulk-patch") return handleBulkPatch(ctx);
    if (ctx.req.method === "POST" && action === "bulk-delete") return handleBulkDelete(ctx);
    if (ctx.req.method === "POST" && action === "bulk-delete-by-filter")
      return handleBulkDeleteByFilter(ctx);
    if (ctx.req.method === "POST" && action === "merge") return handleMergeExtracted(ctx);
    if (ctx.req.method === "POST" && action === "merge-undo")
      return handleMergeUndoExtracted(ctx);
    if (ctx.req.method === "POST" && action === "merge_into")
      return handleMergeIntoExtracted(ctx, { enrichInline });
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

    // Vault entries are PIN-gated and accessed only via the vault endpoint —
    // never expose them through brain listings, especially the share overlay
    // where another user's secret could surface to a co-member.
    const vaultExcludeFilter = `&type=neq.secret`;

    const directUrl = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=${limit + 1}${deletedFilter}${statusFilter}${typeFilter}${brainScopeFilter}${vaultExcludeFilter}${cursorFilter}`;
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

  writeAuditLog({
    userId: user.id,
    action: "entry_update",
    resourceId: id,
    requestId: req_id,
  });

  const data: any = await response.json();

  // Run enrichment BEFORE the response so the user sees fully-enriched state
  // on the next render. Previous fire-and-forget pattern was unreliable on
  // Vercel — the function instance gets killed after res.send so the IIFE
  // often never completed. Trade-off: PATCH is now slower (3-5s with
  // multiple LLM calls) but every entry is fully enriched on first try.
  // Hourly cron sweep (cron-hourly) is the safety net for any path that
  // somehow misses this — but the inline path should now succeed 100% of
  // the time the LLM is reachable.
  const promotedToActive = patch.status === "active";
  if (response.ok && (titleChanged || contentChanged || promotedToActive)) {
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
    // Apply tags + pinned in the same body if present. Cap concurrency at
    // 8 — Promise.all over up to 200 ids would open 200 parallel PostgREST
    // connections and could exhaust the pool / trip Supabase rate limits.
    const BULK_PATCH_CONCURRENCY = 8;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(BULK_PATCH_CONCURRENCY, rows.length) }, () =>
      (async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= rows.length) return;
          const row = rows[idx];
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
        }
      })(),
    );
    await Promise.all(workers);
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
  writeAuditLog({
    userId: user.id,
    action: "entry_bulk_patch",
    resourceId: cleanIds[0], // first id as a representative anchor
    requestId: req_id,
  });

  res.status(200).json({ ok: true, updated, requested: cleanIds.length });
}

// ── POST /api/entries?action=bulk-delete ──
// Atomic soft-delete of N entries in one round-trip. Existed-as-a-loop bug:
// the client previously fired N parallel handleDelete calls, each scheduling
// a 5-second optimistic-undo timer with shared single-slot pendingDeleteRef
// state. Concurrent commits raced; close-the-tab inside the 5s window dropped
// in-flight DELETEs; users saw entries vanish optimistically, then reappear
// next session because the server never got the writes. This endpoint sets
// deleted_at on every requested id in one PATCH, scoped to the user, so the
// success response means it's persisted — no timer, no lost work.
async function handleBulkDelete({ req, res, user, req_id }: HandlerContext): Promise<void> {
  const { ids } = bodyObject(req.body);
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

  const idList = cleanIds.map((id) => encodeURIComponent(id)).join(",");
  const now = new Date().toISOString();

  // user_id scope blocks cross-account writes even if the caller fabricates
  // ids — RLS would reject anyway, but the explicit eq.user_id keeps the
  // server-side write set tight. deleted_at IS NULL prevents double-deletes
  // from re-stamping a more-recent timestamp on already-trashed rows.
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=in.(${idList})&user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null`,
    {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ deleted_at: now }),
    },
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new ApiError(502, `bulk delete failed: ${txt.slice(0, 200)}`);
  }
  const rows: Array<{ id: string }> = await r.json().catch(() => []);
  const deletedIds = rows.map((row) => row.id);

  // Single audit log row per bulk action — same shape as bulk-patch.
  writeAuditLog({
    userId: user.id,
    action: "entry_bulk_delete",
    resourceId: cleanIds[0],
    requestId: req_id,
    metadata: { count: deletedIds.length, requested: cleanIds.length },
  });

  res.status(200).json({ ok: true, deleted: deletedIds.length, requested: cleanIds.length, ids: deletedIds });
}

// ── POST /api/entries?action=bulk-delete-by-filter ──
// "Delete every someday entry" should not depend on the client having every
// id loaded in memory. Phase-2 background loading + virtualisation can leave
// the visible list short — the previous bulk-delete-by-id endpoint then
// silently dropped the rows the client never sent. This filter-based path
// asks the server to soft-delete every active row matching {type, brain_id,
// tag} for the calling user. Optional exclude_ids covers "select all then
// untick a few".
async function handleBulkDeleteByFilter({ req, res, user, req_id }: HandlerContext): Promise<void> {
  const body = bodyObject(req.body) as Record<string, unknown>;
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const brainId = typeof body.brain_id === "string" ? body.brain_id.trim() : "";
  const tag = typeof body.tag === "string" ? body.tag.trim() : "";
  const excludeIds = Array.isArray(body.exclude_ids)
    ? (body.exclude_ids as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  if (!type || type.length > 50) {
    throw new ApiError(400, "type: non-empty string required");
  }
  // Mandatory filter: type must be a real entry type the user can scope to.
  // We deliberately do NOT support "delete every entry the user owns" — the
  // caller must always specify a type so a runaway bug can't wipe a brain.
  let qs = `type=eq.${encodeURIComponent(type)}&user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null`;
  if (brainId) qs += `&brain_id=eq.${encodeURIComponent(brainId)}`;
  if (tag) qs += `&tags=cs.{${encodeURIComponent(tag)}}`;
  if (excludeIds.length > 0) {
    const list = excludeIds.map((id) => encodeURIComponent(id)).join(",");
    qs += `&id=not.in.(${list})`;
  }

  const now = new Date().toISOString();
  const r = await fetch(`${SB_URL}/rest/v1/entries?${qs}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({ deleted_at: now }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new ApiError(502, `bulk delete failed: ${txt.slice(0, 200)}`);
  }
  const rows: Array<{ id: string }> = await r.json().catch(() => []);
  const ids = rows.map((row) => row.id);

  writeAuditLog({
    userId: user.id,
    action: "entry_bulk_delete_by_filter",
    resourceId: ids[0] ?? null,
    requestId: req_id,
    metadata: { type, brain_id: brainId || null, tag: tag || null, count: ids.length },
  });

  res.status(200).json({ ok: true, deleted: ids.length, ids });
}

// ── concept-graph cleanup helper ─────────────────────────────────────────────
// Walks the brain's concept_graph row and strips a deleted entry's UUID from
// every concept's source_entries and every relationship's evidence_entries.
// Concepts whose source_entries become empty are dropped; same for
// relationships whose evidence_entries become empty. Runs as a single
// PATCH so we don't race a graph rebuild.
async function stripDeletedFromConceptGraph(brainId: string, entryId: string): Promise<void> {
  return stripDeletedIdsFromConceptGraph(brainId, [entryId]);
}

// Bulk variant — used by empty-trash where a single user can wipe N entries
// from one brain. Doing N parallel PATCHes against the same concept_graphs
// row races and loses strips (last write wins). One PATCH per brain handles
// the whole set atomically.
async function stripDeletedIdsFromConceptGraph(
  brainId: string,
  entryIds: string[],
): Promise<void> {
  if (!entryIds.length) return;
  const idSet = new Set(entryIds);

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
      const next = sources.filter((sid) => !idSet.has(sid));
      if (next.length === sources.length) return c; // unchanged
      return { ...c, source_entries: next, frequency: next.length };
    })
    .filter((c) => Array.isArray(c.source_entries) && c.source_entries.length > 0);

  const cleanedRels = relationships
    .map((rel) => {
      const ev: string[] = Array.isArray(rel?.evidence_entries) ? rel.evidence_entries : [];
      const next = ev.filter((sid) => !idSet.has(sid));
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

async function runAuditBatch(
  lines: string,
  batchSet: Set<string>,
  cfg: AICall,
  batchNum: number,
): Promise<any[]> {
  // Routed through callAI so the audit step inherits BYOK provider routing
  // and the shared exponential-backoff retry path. Was previously hard-wired
  // to env GEMINI_API_KEY which silently dropped when the key was missing
  // or the user had a BYOK key configured.
  const text = await callAI(cfg, SERVER_PROMPTS.ENTRY_AUDIT, lines, {
    maxTokens: AUDIT_MAX_TOKENS,
    json: true,
  });
  if (!text) return [];
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

  const cfg = await resolveProviderForUser(user.id);
  if (!cfg) {
    res.status(200).json({ flagged: 0, entries: {} });
    return;
  }
  console.log(
    "[audit] provider:",
    cfg.provider,
    "model:",
    cfg.model,
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
    const batchFlags = await runAuditBatch(
      lines,
      batchSet,
      cfg,
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
//
// Drains pending enrichments. Loops enrichBrain back-to-back until the
// claim queue is empty OR the function's wall-clock budget is spent.
// Each call processes batch_size entries with internal concurrency 4
// (see enrichBrain), so a single round-trip can clear a couple hundred
// entries instead of the old "fire 5, poll, fire 5 more" loop.
//
// Use case: free-tier user with a backlog upgrades to paid. Their
// pending rows now resolve a managed provider — one click on Run Now
// drains as many as fit in 300s of wall-clock.
async function handleEnrichBatch({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id, batch_size } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  // Cap raised from 50 → 100 since enrichBrain now runs entries
  // concurrently (4 at a time). 100 entries × 10s/4 ≈ 250s — fits in
  // enrichBrain's per-call 240s budget. Default unchanged at 5 for
  // legacy poll-style callers.
  const batchSize =
    typeof batch_size === "number" && batch_size > 0 ? Math.min(batch_size, 100) : 5;

  // Function-level budget. Vercel default for /api/entries is 300s; we
  // stop ≈ 30s before that so the response definitely lands. Each loop
  // hands enrichBrain whatever time remains (less a 10s margin for
  // PostgREST round-trips) so we don't reserve a full 240s on the last
  // call when only 60s is actually available.
  const fnDeadline = Date.now() + 270_000;
  let totalProcessed = 0;
  let lastRemaining = 0;
  let loops = 0;
  // Hard loop cap belts-and-braces against runaway state. With
  // batch_size=100 + concurrency=4 each loop is ~60-120s of real work,
  // so 8 loops ≈ 16 min worst-case — but the wall-clock guard above
  // exits well before then.
  while (loops < 8) {
    const remaining = fnDeadline - Date.now();
    if (remaining < 30_000) break; // not enough time for a useful batch
    const result = await enrichBrain(
      user.id,
      brain_id,
      batchSize,
      Math.min(remaining - 10_000, 240_000),
    );
    totalProcessed += result.processed;
    lastRemaining = result.remaining;
    loops++;
    // claim_pending_enrichments returned nothing → no more pending. Exit
    // cleanly so we don't spend the remaining function budget on no-ops.
    if (result.processed === 0 && result.remaining === 0) break;
  }
  res.status(200).json({ processed: totalProcessed, remaining: lastRemaining, loops });
}

// Persona handlers (backfill / revert / wipe / audit / persona-prompt /
// distill-rejected) live in _lib/handlers/entryPersona.ts.

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

  // One PATCH per affected brain. Per-entry was a real bug: 100 deleted
  // rows fired 100 parallel PATCHes against the same concept_graphs row,
  // which raced — last write won and earlier strips were lost. Grouping by
  // brain and stripping every id in one merge is correct AND cheaper.
  const byBrain = new Map<string, string[]>();
  for (const row of deleted) {
    const list = byBrain.get(row.brain_id);
    if (list) list.push(row.id);
    else byBrain.set(row.brain_id, [row.id]);
  }
  for (const [brainId, ids] of byBrain) {
    stripDeletedIdsFromConceptGraph(brainId, ids).catch((err: any) =>
      console.error("[empty-trash:concept-graph]", err?.message ?? err),
    );
  }

  writeAuditLog({
    userId: user.id,
    action: "empty_trash",
    requestId: req_id,
    metadata: { count: deleted.length },
  });

  res.status(200).json({ deleted: deleted.length });
}

// Merge handlers (preview/commit/undo + merge_into) live in
// _lib/handlers/entryMerge.ts — kept out of this dispatcher because the
// merge logic is self-contained and benefits from being co-located.

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
  writeAuditLog({
    userId: user.id,
    action: "entry_move",
    resourceId: id,
    requestId: req_id,
    metadata: { from: sourceBrainId, to: dest },
  });

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

  writeAuditLog({
    userId: user.id,
    action: "entry_share",
    resourceId: id,
    requestId: req_id,
    metadata: { source: entry.brain_id, target },
  });

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

  writeAuditLog({
    userId: user.id,
    action: "entry_unshare",
    resourceId: id,
    requestId: req_id,
    metadata: { target },
  });

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
