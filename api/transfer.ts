/**
 * /api/export → GET  — download all entries for a brain as JSON
 * /api/import → POST — bulk-import entries into a brain
 *
 * Both routes are rewritten to /api/transfer via vercel.json.
 */
import { withAuth, requireBrainAccess, ApiError, type HandlerContext } from "./_lib/withAuth.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { runEnrichBatchForUser } from "./_lib/enrichBatch.js";

const SB_URL = process.env.SUPABASE_URL;
const EXPORT_FIELDS = "id,title,content,type,tags,metadata,importance,pinned,created_at";
const IMPORT_LIMIT = 2000;

export default withAuth(
  {
    methods: ["GET", "POST"],
    rateLimit: (req) => (req.method === "POST" ? 5 : 10),
  },
  async (ctx) => {
    if (ctx.req.method === "GET") return handleExport(ctx);
    return handleImport(ctx);
  },
);

// ── GET /api/export?brain_id=<id> ──
async function handleExport({ req, res, user }: HandlerContext): Promise<void> {
  const brain_id = req.query.brain_id as string | undefined;
  await requireBrainAccess(user.id, brain_id);

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id!)}&select=${EXPORT_FIELDS}&order=created_at.asc&limit=10000`,
    { headers: sbHeadersNoContent() },
  );
  if (!r.ok) throw new ApiError(502, "Database error");

  const entries = await r.json();
  res.status(200).json({ entries, exported_at: new Date().toISOString(), brain_id });
}

// ── POST /api/import ──
async function handleImport({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id, entries } = req.body || {};

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ApiError(400, "entries array required");
  }
  if (entries.length > IMPORT_LIMIT) {
    throw new ApiError(400, `Too many entries — max ${IMPORT_LIMIT} per import`);
  }

  await requireBrainAccess(user.id, brain_id);

  const rows = entries
    .filter((e: any) => e && typeof e === "object" && e.title)
    .map((e: any) => ({
      user_id: user.id,
      brain_id,
      title: String(e.title || "").slice(0, 500),
      content: String(e.content || "").slice(0, 50000),
      type: typeof e.type === "string" ? e.type.slice(0, 100) : "note",
      tags: Array.isArray(e.tags) ? e.tags.filter((t: any) => typeof t === "string").slice(0, 20) : [],
      metadata: e.metadata && typeof e.metadata === "object" ? e.metadata : {},
      importance: typeof e.importance === "number" ? Math.min(5, Math.max(0, e.importance)) : 0,
      pinned: Boolean(e.pinned),
    }));

  if (rows.length === 0) throw new ApiError(400, "No valid entries to import");

  const r = await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(rows),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => String(r.status));
    console.error("[transfer:import]", err);
    throw new ApiError(502, "Import failed");
  }

  res.status(200).json({ ok: true, imported: rows.length });
  runEnrichBatchForUser(user.id, brain_id, 10).catch(() => {});
}
