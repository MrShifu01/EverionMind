// Merge handlers extracted from api/entries.ts as part of the
// resource-dispatch decomposition (audit task 1315 / CONSOLIDATED-AUDIT
// line 5313). The dispatcher in entries.ts now imports these instead of
// hosting ~180 lines of merge logic inline. Keeps merge semantics
// (preview/commit/undo/merge_into) co-located so future changes touch one
// file, not the 1900-line dispatcher.
import { ApiError, requireBrainAccess, type HandlerContext } from "../withAuth.js";
import { bodyObject } from "../requestBody.js";
import { sbHeaders, sbHeadersNoContent } from "../sbHeaders.js";
import { writeAuditLog } from "../auditLog.js";
import {
  validateMergeRequest,
  checkMergeQuota,
  generateMergePreview,
  commitMerge,
} from "../mergeEntries.js";

const SB_URL = process.env.SUPABASE_URL;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EntryMergeDeps {
  // enrichInline returns a boolean (success flag) but the dispatcher only
  // fires-and-forgets after responding, so either return shape is fine.
  enrichInline: (entryId: string, userId: string) => Promise<unknown>;
}

// ── POST /api/entries?action=merge ──────────────────────────────────────────
// Two-phase via `preview` flag:
//   preview=true  → LLM generates {title,content,type,tags}, no DB writes.
//   preview=false → caller re-POSTs with the (possibly edited) fields, server
//                   inserts merged entry, awaits enrichInline up to 60s, then
//                   soft-deletes sources, writes audit_log.
// Validation (in mergeEntries.ts): all ids UUID, owned by caller, same brain,
// no vault entries, 2-8 entries.
export async function handleMerge({ req, res, user }: HandlerContext): Promise<void> {
  const body = bodyObject(req.body);
  const validation = await validateMergeRequest(user.id, body.ids);
  await checkMergeQuota(user.id);

  const isPreview = body.preview === true;

  if (isPreview) {
    const fields = await generateMergePreview(validation.sources, user.id);
    res.status(200).json({
      preview: true,
      ...fields,
      source_count: validation.sources.length,
    });
    return;
  }

  const body_ = body as { title?: unknown; content?: unknown; type?: unknown; tags?: unknown };
  const fields = {
    title: typeof body_.title === "string" ? body_.title : "",
    content: typeof body_.content === "string" ? body_.content : "",
    type: typeof body_.type === "string" ? body_.type : "note",
    tags: Array.isArray(body_.tags)
      ? body_.tags.filter((t): t is string => typeof t === "string")
      : [],
  };
  const result = await commitMerge(user.id, validation, { fields });
  res.status(200).json({ ok: true, ...result });
}

// ── POST /api/entries?action=merge-undo ─────────────────────────────────────
// Hard-deletes the merged entry and resurrects the sources by clearing
// deleted_at. metadata.merged_from check prevents undoing arbitrary entries.
export async function handleMergeUndo({ req, res, user }: HandlerContext): Promise<void> {
  const body = bodyObject(req.body);
  const mergedId: unknown = body.merged_id;
  const sourceIds: unknown = body.source_ids;
  if (typeof mergedId !== "string" || !UUID_RE.test(mergedId)) {
    throw new ApiError(400, "merged_id must be a valid uuid");
  }
  if (!Array.isArray(sourceIds) || sourceIds.length < 2 || sourceIds.length > 8) {
    throw new ApiError(400, "source_ids must be 2-8 valid uuids");
  }
  const cleanSourceIds: string[] = [];
  for (const raw of sourceIds) {
    if (typeof raw !== "string" || !UUID_RE.test(raw)) {
      throw new ApiError(400, "source_ids must be valid uuids");
    }
    cleanSourceIds.push(raw);
  }

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
  const sameSet =
    expectSet.size === actualSet.size && [...expectSet].every((id) => actualSet.has(id));
  if (!sameSet) {
    throw new ApiError(400, "merged_from mismatch — refusing to undo");
  }

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

  writeAuditLog({
    userId: user.id,
    action: "entries_merge_undone",
    resourceId: mergedId,
    metadata: { source_ids: cleanSourceIds },
  });

  res.status(200).json({ ok: true, restored: cleanSourceIds.length });
}

// ── POST /api/entries?action=merge_into — merge source into target ──────────
// Stamps merged_from on the target so handleMergeUndo can reverse it.
export async function handleMergeInto(
  { req, res, user, req_id, log }: HandlerContext,
  deps: EntryMergeDeps,
): Promise<void> {
  const source_id = req.query.id as string | undefined;
  const { target_id } = bodyObject(req.body);
  if (!source_id || typeof source_id !== "string" || source_id.length > 100)
    throw new ApiError(400, "Missing or invalid id");
  if (!target_id || typeof target_id !== "string" || target_id.length > 100)
    throw new ApiError(400, "Missing or invalid target_id");
  if (source_id === target_id) throw new ApiError(400, "source and target must differ");

  const ENTRY_SELECT = "id,brain_id,content,tags,metadata";
  const [sourceRes, targetRes] = await Promise.all([
    fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(source_id)}&select=${encodeURIComponent(ENTRY_SELECT)}`,
      { headers: sbHeadersNoContent() },
    ),
    fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(target_id)}&select=${encodeURIComponent(ENTRY_SELECT)}`,
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

  const existingMeta =
    target.metadata && typeof target.metadata === "object" ? target.metadata : {};
  const mergedFromList = Array.isArray(existingMeta.merged_from) ? existingMeta.merged_from : [];
  const mergedMeta = {
    ...existingMeta,
    merged_from: [...mergedFromList, { id: source_id, merged_at: new Date().toISOString() }],
  };

  const patchRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(target_id)}`,
    {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ content: mergedContent, tags: mergedTags, metadata: mergedMeta }),
    },
  );
  if (!patchRes.ok) throw new ApiError(502, "Failed to update target entry");

  await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(source_id)}`, {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });

  log.info("entry merge_into", { source_id, target_id });
  writeAuditLog({
    userId: user.id,
    action: "merge_into",
    resourceId: target_id,
    requestId: req_id,
    metadata: { source_id },
  });

  const [updated] = await patchRes.json();
  res.status(200).json(updated ?? { ok: true });
  deps.enrichInline(target_id, user.id).catch(() => {});
}
