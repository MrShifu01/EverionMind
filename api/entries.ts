import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { computeCompletenessScore } from "./_lib/completeness.js";
import { SERVER_PROMPTS } from "./_lib/prompts.js";

const SB_URL = process.env.SUPABASE_URL;
const ENTRY_FIELDS = "id,title,content,type,tags,metadata,brain_id,importance,pinned,created_at,embedded_at";

// Dispatched via rewrites:
//   /api/delete-entry, /api/update-entry → /api/entries
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.query.resource === "audit" && req.method === "POST") return handleAudit(req, res);
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "DELETE") return handleDelete(req, res);
  if (req.method === "PATCH") return handlePatch(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

// ── GET /api/entries ──
async function handleGet(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 60))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const brain_id = req.query.brain_id as string | undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || "1000", 10), 1000);
  const cursor = req.query.cursor as string | undefined;
  const trash = req.query.trash === "true";

  // Build cursor + trash filters for direct REST queries
  const cursorFilter = cursor ? `&created_at=lt.${encodeURIComponent(cursor)}` : "";
  const deletedFilter = trash
    ? "&deleted_at=not.is.null"
    : "&deleted_at=is.null";

  if (brain_id) {
    // SEC-1: Verify the requesting user is a member or owner of this brain
    const access = await checkBrainAccess(user.id, brain_id);
    if (!access) return res.status(403).json({ error: "Forbidden" });

    // Fetch entry IDs shared into this brain via entry_brains junction table
    const sharedRes = await fetch(
      `${SB_URL}/rest/v1/entry_brains?brain_id=eq.${encodeURIComponent(brain_id)}&select=entry_id`,
      { headers: sbHeadersNoContent() }
    );
    const sharedRows: any[] = sharedRes.ok ? await sharedRes.json() : [];
    const sharedIds: string[] = sharedRows.map((r: any) => r.entry_id).filter(Boolean);

    // Build OR filter: primary brain_id match OR shared via entry_brains
    const sharedIdFilter = sharedIds.length > 0
      ? `,id.in.(${sharedIds.map(encodeURIComponent).join(",")})`
      : "";
    const orFilter = `&or=(brain_id.eq.${encodeURIComponent(brain_id)}${sharedIdFilter})`;

    // Direct query: includes primary brain entries + shared entries from entry_brains.
    // Uses PostgREST directly so we always get the deleted_at filter applied — the
    // get_entries_for_brain RPC did not filter soft-deletes, causing ghost-return.
    const directUrl = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=${limit + 1}${deletedFilter}${orFilter}${cursorFilter}`;
    const directRes = await fetch(directUrl, { headers: sbHeadersNoContent() });
    if (!directRes.ok) return res.status(502).json({ error: "Database error" });
    const rows: any[] = await directRes.json();
    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? results[results.length - 1].created_at : null;
    return res.status(200).json({ entries: results, nextCursor, hasMore });
  }

  // Fallback: user's own entries (pre-migration compatibility)
  const url = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=${limit + 1}${deletedFilter}&user_id=eq.${encodeURIComponent(user.id)}${cursorFilter}`;
  const response = await fetch(url, { headers: sbHeadersNoContent() });
  const rows: any[] = await response.json();
  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? results[results.length - 1].created_at : null;
  res.status(response.status).json({ entries: results, nextCursor, hasMore });
}

// ── DELETE /api/entries (was /api/delete-entry) — soft delete or hard delete ──
async function handleDelete(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.body;
  if (!id || typeof id !== "string" || id.length > 100) {
    return res.status(400).json({ error: "Missing or invalid id" });
  }

  const permanent = req.query.permanent === "true";

  // SEC-1: Verify the requesting user is a member or owner of this entry's brain
  const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`, {
    headers: sbHeadersNoContent(),
  });
  if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
  const [entry]: any[] = await entryRes.json();
  if (!entry) return res.status(404).json({ error: "Not found" });

  const access = await checkBrainAccess(user.id, entry.brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  if (permanent) {
    // Hard delete: permanently remove the entry (no recovery)
    const response = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: sbHeaders({ "Prefer": "return=minimal" }),
      }
    );

    console.log(`[audit] HARD_DELETE entry id=${id} user=${user.id} ok=${response.ok}`);

    // SEC-14: Fire-and-forget audit log write to Supabase
    fetch(`${SB_URL}/rest/v1/audit_log`, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        user_id: user.id,
        action: 'entry_permanent_delete',
        resource_id: id,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {}); // best-effort, never blocks

    return res.status(response.ok ? 200 : 502).json({ ok: response.ok });
  }

  // Soft delete: set deleted_at instead of hard deleting (recoverable within 30 days)
  const response = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: sbHeaders({ "Prefer": "return=minimal" }),
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    }
  );

  console.log(`[audit] SOFT_DELETE entry id=${id} user=${user.id} ok=${response.ok}`);

  // SEC-14: Fire-and-forget audit log write to Supabase
  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify({
      user_id: user.id,
      action: 'entry_delete',
      resource_id: id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {}); // best-effort, never blocks

  res.status(response.ok ? 200 : 502).json({ ok: response.ok });
}

// ── PATCH /api/entries (was /api/update-entry) ──
async function handlePatch(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const action = req.query.action as string | undefined;

  // ── PATCH ?action=restore — restore a soft-deleted entry ──
  if (action === "restore") {
    const { id } = req.body;
    if (!id || typeof id !== "string" || id.length > 100) {
      return res.status(400).json({ error: "Missing or invalid id" });
    }

    // SEC-1: Verify the requesting user is a member or owner of this entry's brain
    const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`, {
      headers: sbHeadersNoContent(),
    });
    if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
    const [entryData]: any[] = await entryRes.json();
    if (!entryData) return res.status(404).json({ error: "Not found" });

    const access = await checkBrainAccess(user.id, entryData.brain_id);
    if (!access) return res.status(403).json({ error: "Forbidden" });

    const response = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ "Prefer": "return=representation" }),
        body: JSON.stringify({ deleted_at: null }),
      }
    );
    console.log(`[audit] RESTORE entry id=${id} user=${user.id} ok=${response.ok}`);
    const data: any = await response.json();
    return res.status(response.ok ? 200 : 502).json(data);
  }

  const { id, title, content, type, tags, metadata, brain_id } = req.body;
  if (!id || typeof id !== "string" || id.length > 100) {
    return res.status(400).json({ error: "Missing or invalid id" });
  }
  if (title !== undefined && (typeof title !== "string" || title.length > 500)) {
    return res.status(400).json({ error: "Invalid title" });
  }
  if (type !== undefined && (typeof type !== "string" || type.length > 50)) {
    return res.status(400).json({ error: "Invalid type" });
  }

  const patch: Record<string, any> = {};
  if (title !== undefined) patch.title = title;
  if (content !== undefined) patch.content = String(content).slice(0, 10000);
  if (type !== undefined) patch.type = type;
  if (Array.isArray(tags)) patch.tags = tags.filter((t: any) => typeof t === "string").slice(0, 50);
  if (metadata !== undefined && typeof metadata === "object" && !Array.isArray(metadata)) patch.metadata = metadata;
  if (brain_id !== undefined && typeof brain_id === "string" && brain_id.length <= 100) patch.brain_id = brain_id;

  // SEC-1: Verify the requesting user is a member or owner of this entry's brain
  const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id,title,content,type,tags,metadata`, {
    headers: sbHeadersNoContent(),
  });
  if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
  const [entry]: any[] = await entryRes.json();
  if (!entry) return res.status(404).json({ error: "Not found" });

  const access = await checkBrainAccess(user.id, entry.brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  // Recalculate completeness score with merged values
  const mergedTitle = patch.title ?? entry.title ?? "";
  const mergedContent = patch.content ?? entry.content ?? "";
  const mergedType = patch.type ?? entry.type ?? "note";
  const mergedTags = patch.tags ?? entry.tags ?? [];
  const mergedMeta = patch.metadata ?? entry.metadata ?? {};
  const cScore = computeCompletenessScore(mergedTitle, mergedContent, mergedType, mergedTags, mergedMeta);
  const finalMeta = { ...(entry.metadata || {}), ...(patch.metadata || {}), completeness_score: cScore };

  // Reset enrichment flags when substantive content changes so the client re-enriches
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
  // Clear audit flags when content, title, or type changes — stale flags no longer apply
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
    }
  );

  console.log(`[audit] PATCH entry id=${id} user=${user.id} ok=${response.ok}`);

  // SEC-14: Fire-and-forget audit log write to Supabase
  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify({
      user_id: user.id,
      action: 'entry_update',
      resource_id: id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {}); // best-effort, never blocks

  const data: any = await response.json();
  res.status(response.ok ? 200 : 502).json(data);
}

// ── /api/audit (rewritten to /api/entries?resource=audit) ──
const AUDIT_GEMINI_BATCH = 50;  // entries per Gemini call
const AUDIT_MAX_TOKENS  = 4096; // output tokens per batch (2 flags × 50 entries × ~40 tokens)
const AUDIT_DB_PAGE     = 500;  // rows per Supabase fetch
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

async function handleAudit(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 10))) return res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { brain_id, pace } = req.body;
  if (!brain_id || typeof brain_id !== "string" || brain_id.length > 100) {
    return res.status(400).json({ error: "Missing or invalid brain_id" });
  }

  const access = await checkBrainAccess(user.id, brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  // Fetch ALL entries for this brain (paginated)
  const allEntries: any[] = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&select=id,title,content,type,tags,metadata&order=created_at.desc&limit=${AUDIT_DB_PAGE}&offset=${offset}`,
      { headers: sbHeadersNoContent() },
    );
    if (!r.ok) return res.status(502).json({ error: "Database error" });
    const page: any[] = await r.json();
    allEntries.push(...page);
    if (page.length < AUDIT_DB_PAGE) break;
    offset += AUDIT_DB_PAGE;
  }

  if (!allEntries.length) return res.status(200).json({ flagged: 0, entries: {} });

  const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
  const GEMINI_MODEL   = (process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();
  console.log("[audit] model:", GEMINI_MODEL, "key set:", !!GEMINI_API_KEY, "total entries:", allEntries.length);

  // Run Gemini sequentially over batches of AUDIT_GEMINI_BATCH entries.
  // When pace=true (auto background run), space batches evenly over 60s.
  const numBatches = Math.ceil(allEntries.length / AUDIT_GEMINI_BATCH);
  const batchDelay = pace ? Math.max(2000, Math.floor(60000 / numBatches)) : 0;

  const allFlags: any[] = [];
  for (let i = 0; i < allEntries.length; i += AUDIT_GEMINI_BATCH) {
    if (i > 0 && batchDelay > 0) await sleep(batchDelay);
    const batch = allEntries.slice(i, i + AUDIT_GEMINI_BATCH);
    const batchSet = new Set(batch.map((e: any) => e.id));
    const lines = batch
      .map((e: any) =>
        `ID: ${e.id}\nTitle: ${e.title}\nType: ${e.type}\nTags: ${(e.tags || []).join(", ")}\nContent: ${String(e.content || "").slice(0, 500)}\nMetadata: ${JSON.stringify(e.metadata || {})}`,
      )
      .join("\n\n---\n\n");
    const batchFlags = await runGeminiBatch(lines, batchSet, GEMINI_API_KEY, GEMINI_MODEL, Math.floor(i / AUDIT_GEMINI_BATCH) + 1);
    allFlags.push(...batchFlags);
  }

  // Group flags by entryId
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

  // PATCH only entries whose flags changed to avoid unnecessary writes
  await Promise.all(
    allEntries.map(async (entry: any) => {
      const newFlags = flagsByEntry[entry.id] ?? null;
      const oldFlags = (entry.metadata as any)?.audit_flags ?? null;
      if (!newFlags?.length && !oldFlags?.length) return; // no change — skip
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

  // Return full flag map for client to update local state without a re-fetch
  const responseEntries: Record<string, any[] | null> = {};
  for (const entry of allEntries) {
    responseEntries[entry.id] = flagsByEntry[entry.id] ?? null;
  }

  return res.status(200).json({ flagged: Object.keys(flagsByEntry).length, entries: responseEntries });
}
