import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({ "Content-Type": "application/json", "apikey": SB_KEY!, "Authorization": `Bearer ${SB_KEY}`, ...extra });

const MAX_ENTRIES = 500;

// Dispatched via rewrites: /api/export, /api/import → /api/transfer
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method === "GET") return handleExport(req, res);
  if (req.method === "POST") return handleImport(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

// ── GET /api/export (rewritten to /api/transfer) ──
async function handleExport(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 10))) return res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { brain_id } = req.query;
  if (!brain_id) return res.status(400).json({ error: "brain_id required" });

  // Check role — viewers cannot export
  const access = await checkBrainAccess(user.id, brain_id as string);
  if (!access) return res.status(403).json({ error: "Not a member" });
  if (access.role === 'viewer') return res.status(403).json({ error: "Viewers cannot export" });

  // Fetch brain metadata for owned brains
  const ownedRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id as string)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
  const owned: any[] = await ownedRes.json();
  const brainData: any = owned[0] || null;

  // Fetch entries
  const entriesRes = await fetch(`${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id as string)}&order=created_at.asc`, { headers: hdrs() });
  if (!entriesRes.ok) return res.status(502).json({ error: "Failed to fetch entries" });
  const entries: any[] = await entriesRes.json();

  // Fetch links for these entries
  const ids: string[] = entries.map((e: any) => e.id);
  let links: any[] = [];
  if (ids.length > 0) {
    const linksRes = await fetch(`${SB_URL}/rest/v1/entry_links?or=(from_id.in.(${ids.map(encodeURIComponent).join(",")}),to_id.in.(${ids.map(encodeURIComponent).join(",")}))`, { headers: hdrs() });
    if (linksRes.ok) links = await linksRes.json();
  }

  // Strip context-specific fields
  const exportEntries = entries.map(({ id: _id, brain_id: _bid, user_id: _uid, ...rest }: any) => rest);
  const exportLinks = links.map(({ id: _id, ...rest }: any) => rest);

  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    brain: { name: brainData?.name || "brain", type: brainData?.type || "personal" },
    entries: exportEntries,
    links: exportLinks,
  };

  const filename = `openbrain-${(brainData?.name || "brain").replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(payload);
}

// ── POST /api/import (rewritten to /api/transfer) ──
async function handleImport(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 5))) return res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { brain_id, entries, options = {} } = req.body;
  if (!brain_id || !Array.isArray(entries)) return res.status(400).json({ error: "brain_id and entries array required" });
  if (entries.length > MAX_ENTRIES) return res.status(400).json({ error: `Max ${MAX_ENTRIES} entries per import` });

  // Verify write access (owner or member)
  const [ownedRes, memberRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() }),
    fetch(`${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id)}&user_id=eq.${encodeURIComponent(user.id)}&role=neq.viewer`, { headers: hdrs() }),
  ]);
  const owned: any[] = await ownedRes.json();
  const member: any[] = await memberRes.json();
  if (!owned.length && !member.length) return res.status(403).json({ error: "No write access to this brain" });

  // Fetch existing entries for duplicate check
  const existingRes = await fetch(`${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&select=title,type`, { headers: hdrs() });
  const existing: any[] = existingRes.ok ? await existingRes.json() : [];
  const existingKeys = new Set(existing.map((e: any) => `${e.title?.toLowerCase()}::${e.type}`));

  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    if (!entry.title || typeof entry.title !== "string") { errors.push(`Invalid entry: missing title`); continue; }
    const key = `${entry.title.toLowerCase()}::${entry.type || "note"}`;
    if (options.skip_duplicates && existingKeys.has(key)) { skipped++; continue; }

    const r = await fetch(`${SB_URL}/rest/v1/entries`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=minimal" }),
      body: JSON.stringify({
        id: crypto.randomUUID(),
        brain_id,
        title: entry.title.slice(0, 200),
        content: entry.content || "",
        type: entry.type || "note",
        tags: entry.tags || [],
        metadata: entry.metadata || {},
        importance: entry.importance || 0,
        pinned: entry.pinned || false,
        created_at: entry.created_at || new Date().toISOString(),
      }),
    });

    if (r.ok) { imported++; existingKeys.add(key); }
    else { errors.push(`Failed to import: ${entry.title}`); }
  }

  return res.status(200).json({ imported, skipped, errors: errors.slice(0, 20) });
}
