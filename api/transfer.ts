/**
 * /api/export → GET  — download all entries for a brain as JSON
 * /api/import → POST — bulk-import entries into a brain
 *
 * Both routes are rewritten to /api/transfer via vercel.json.
 *
 * Idempotency: when a request entry has metadata.import_hash, the server
 * dedupes against existing rows in the same brain that carry the same hash.
 * Re-running the same Google Takeout zip becomes a no-op rather than
 * doubling every note.
 */
import { withAuth, requireBrainAccess, ApiError, type HandlerContext } from "./_lib/withAuth.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { enrichBrain } from "./_lib/enrich.js";

// 25 MB upload covers ~500 Keep notes per batch even when several have long
// list content + labels + timestamps. Vercel's default 4.5 MB silently
// 413'd large Keep imports.
export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

const SB_URL = process.env.SUPABASE_URL;
const EXPORT_FIELDS = "id,title,content,type,tags,metadata,importance,pinned,created_at";
const IMPORT_LIMIT = 2000;

export default withAuth(
  {
    methods: ["GET", "POST"],
    // Per-user rate limit. 30/min lets a 10K-entry import (20 batches at
    // size 500) finish without throttling, with headroom for retries.
    rateLimit: (req) => (req.method === "POST" ? 30 : 10),
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

  // Normalise + clamp the rows. created_at is honoured when the client
  // supplies an ISO timestamp (Google Takeout has the original Keep
  // timestamps), otherwise Supabase fills in the default.
  const rows = entries
    .filter((e: any) => e && typeof e === "object" && e.title)
    .map((e: any) => {
      const created = typeof e.created_at === "string" && !Number.isNaN(Date.parse(e.created_at))
        ? new Date(e.created_at).toISOString()
        : null;
      return {
        user_id: user.id,
        brain_id,
        title: String(e.title || "").slice(0, 500),
        content: String(e.content || "").slice(0, 50000),
        type: typeof e.type === "string" ? e.type.slice(0, 100) : "note",
        tags: Array.isArray(e.tags) ? e.tags.filter((t: any) => typeof t === "string").slice(0, 20) : [],
        metadata: e.metadata && typeof e.metadata === "object" ? e.metadata : {},
        importance: typeof e.importance === "number" ? Math.min(5, Math.max(0, e.importance)) : 0,
        pinned: Boolean(e.pinned),
        ...(created ? { created_at: created } : {}),
      };
    });

  if (rows.length === 0) throw new ApiError(400, "No valid entries to import");

  // ── Idempotency: dedupe against existing rows by metadata.import_hash ──
  // Client computes a stable hash per source note (e.g. SHA256 of
  // title|content_prefix|original_timestamp truncated to 16 chars). Repeat
  // imports of the same Takeout zip become no-ops here instead of doubling
  // every note in the brain.
  const incomingHashes = rows
    .map((r) => (r.metadata as Record<string, unknown>)?.import_hash)
    .filter((h): h is string => typeof h === "string" && h.length > 0);

  const dedupedRows = await dedupeByImportHash(rows, brain_id, incomingHashes);
  const skipped = rows.length - dedupedRows.length;

  if (dedupedRows.length === 0) {
    res.status(200).json({ ok: true, imported: 0, failed: 0, skipped, errors: [] });
    return;
  }

  // Chunked insert — partial success reporting instead of all-or-nothing.
  // Smaller chunks (100) keep each request well under PostgREST's request
  // budget and surface failures earlier in the loop.
  const CHUNK = 100;
  let succeeded = 0;
  const batchErrors: string[] = [];
  for (let i = 0; i < dedupedRows.length; i += CHUNK) {
    const chunk = dedupedRows.slice(i, i + CHUNK);
    const r = await fetch(`${SB_URL}/rest/v1/entries`, {
      method: "POST",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify(chunk),
    });
    if (r.ok) {
      succeeded += chunk.length;
    } else {
      const err = await r.text().catch(() => String(r.status));
      console.error(`[transfer:import] batch ${Math.floor(i / CHUNK) + 1}`, err);
      batchErrors.push(`Batch ${Math.floor(i / CHUNK) + 1}: HTTP ${r.status}`);
    }
  }

  const failed = dedupedRows.length - succeeded;
  res.status(200).json({ ok: succeeded > 0, imported: succeeded, failed, skipped, errors: batchErrors });
  // Background enrichment kicks off but no longer caps at 10 — the client
  // also polls /api/entries?action=enrich-batch in waves to drain the
  // remainder. This call just gets the first batch flowing immediately.
  enrichBrain(user.id, brain_id, 30).catch(() => {});
}

/**
 * Filter rows whose import_hash already exists for this brain.
 * Long hash lists are queried in chunks so the URL stays under PostgREST's
 * effective query-string limit.
 */
async function dedupeByImportHash(
  rows: Array<Record<string, unknown>>,
  brainId: string,
  hashes: string[],
): Promise<Array<Record<string, unknown>>> {
  if (hashes.length === 0) return rows;

  const existing = new Set<string>();
  const QUERY_CHUNK = 200;
  for (let i = 0; i < hashes.length; i += QUERY_CHUNK) {
    const slice = hashes.slice(i, i + QUERY_CHUNK);
    const inList = slice.map(encodeURIComponent).join(",");
    const url =
      `${SB_URL}/rest/v1/entries` +
      `?brain_id=eq.${encodeURIComponent(brainId)}` +
      `&metadata->>import_hash=in.(${inList})` +
      `&select=metadata->>import_hash`;
    const r = await fetch(url, { headers: sbHeadersNoContent() });
    if (!r.ok) {
      // Best-effort: if the dedup query fails we don't block the import,
      // we just skip dedup for this slice.
      console.warn("[transfer:import] dedup query failed", r.status);
      continue;
    }
    const json: Array<Record<string, string>> = await r.json();
    for (const row of json) {
      const h = row?.["import_hash"] ?? row?.["?column?"];
      if (typeof h === "string") existing.add(h);
    }
  }

  if (existing.size === 0) return rows;
  return rows.filter((r) => {
    const h = (r.metadata as Record<string, unknown>)?.import_hash;
    return !(typeof h === "string" && existing.has(h));
  });
}
