/**
 * /api/export → GET  — download all entries for a brain as JSON
 * /api/import → POST — bulk-import entries into a brain
 *
 * Both routes are rewritten to /api/transfer via vercel.json.
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const EXPORT_FIELDS = "id,title,content,type,tags,metadata,importance,pinned,created_at";
const IMPORT_LIMIT = 2000;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method === "GET") return handleExport(req, res);
  if (req.method === "POST") return handleImport(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

// ── GET /api/export?brain_id=<id> ──
async function handleExport(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 10))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const brain_id = req.query.brain_id as string | undefined;
  if (!brain_id || typeof brain_id !== "string" || brain_id.length > 100) {
    return res.status(400).json({ error: "brain_id required" });
  }

  const access = await checkBrainAccess(user.id, brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&select=${EXPORT_FIELDS}&order=created_at.asc&limit=10000`,
    { headers: sbHeadersNoContent() },
  );
  if (!r.ok) return res.status(502).json({ error: "Database error" });

  const entries = await r.json();
  return res.status(200).json({ entries, exported_at: new Date().toISOString(), brain_id });
}

// ── POST /api/import ──
async function handleImport(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 5))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { brain_id, entries } = req.body || {};

  if (!brain_id || typeof brain_id !== "string" || brain_id.length > 100) {
    return res.status(400).json({ error: "brain_id required" });
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: "entries array required" });
  }
  if (entries.length > IMPORT_LIMIT) {
    return res.status(400).json({ error: `Too many entries — max ${IMPORT_LIMIT} per import` });
  }

  const access = await checkBrainAccess(user.id, brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

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

  if (rows.length === 0) {
    return res.status(400).json({ error: "No valid entries to import" });
  }

  const r = await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(rows),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => String(r.status));
    console.error("[transfer:import]", err);
    return res.status(502).json({ error: "Import failed" });
  }

  return res.status(200).json({ ok: true, imported: rows.length });
}
