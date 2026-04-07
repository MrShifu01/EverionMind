import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENTRY_FIELDS = "id,title,content,type,tags,metadata,brain_id,importance,pinned,created_at";
const sbHdrs = (): Record<string, string> => ({ "apikey": SB_KEY!, "Authorization": `Bearer ${SB_KEY}` });
const sbHdrsJson = (extra: Record<string, string> = {}): Record<string, string> => ({ "Content-Type": "application/json", "apikey": SB_KEY!, "Authorization": `Bearer ${SB_KEY}`, ...extra });

// Dispatched via rewrites: /api/delete-entry, /api/update-entry → /api/entries
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
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

  if (brain_id) {
    // SEC-1: Verify the requesting user is a member or owner of this brain
    const access = await checkBrainAccess(user.id, brain_id);
    if (!access) return res.status(403).json({ error: "Forbidden" });

    // Use RPC to get entries visible in this brain (primary + cross-brain shares)
    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/get_entries_for_brain?select=${encodeURIComponent(ENTRY_FIELDS)}`, {
      method: "POST",
      headers: sbHdrsJson(),
      body: JSON.stringify({ p_brain_id: brain_id }),
    });

    if (rpcRes.ok) {
      const data: any = await rpcRes.json();
      return res.status(200).json(data);
    }

    // Fallback: direct query if RPC not yet available (pre-migration)
    // Include entries with matching brain_id OR user's orphan entries (brain_id is null)
    const fallbackRes = await fetch(
      `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=500&or=(brain_id.eq.${encodeURIComponent(brain_id)},and(user_id.eq.${encodeURIComponent(user.id)},brain_id.is.null))`,
      { headers: sbHdrs() }
    );
    const fallbackData: any = await fallbackRes.json();
    return res.status(fallbackRes.status).json(fallbackData);
  }

  // Fallback: user's own entries (pre-migration compatibility)
  const url = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=500&user_id=eq.${encodeURIComponent(user.id)}`;
  const response = await fetch(url, { headers: sbHdrs() });
  const data: any = await response.json();
  res.status(response.status).json(data);
}

// ── DELETE /api/entries (was /api/delete-entry) ──
async function handleDelete(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.body;
  if (!id || typeof id !== "string" || id.length > 100) {
    return res.status(400).json({ error: "Missing or invalid id" });
  }

  // SEC-1: Verify the requesting user is a member or owner of this entry's brain
  const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`, {
    headers: sbHdrs(),
  });
  if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
  const [entry]: any[] = await entryRes.json();
  if (!entry) return res.status(404).json({ error: "Not found" });

  const access = await checkBrainAccess(user.id, entry.brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const response = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: sbHdrs() }
  );

  console.log(`[audit] DELETE entry id=${id} user=${user.id} ok=${response.ok}`);

  // SEC-14: Fire-and-forget audit log write to Supabase
  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: sbHdrsJson({ 'Prefer': 'return=minimal' }),
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
  const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`, {
    headers: sbHdrs(),
  });
  if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
  const [entry]: any[] = await entryRes.json();
  if (!entry) return res.status(404).json({ error: "Not found" });

  const access = await checkBrainAccess(user.id, entry.brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const response = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: sbHdrsJson({ "Prefer": "return=representation" }),
      body: JSON.stringify(patch),
    }
  );

  console.log(`[audit] PATCH entry id=${id} user=${user.id} ok=${response.ok}`);

  // SEC-14: Fire-and-forget audit log write to Supabase
  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: sbHdrsJson({ 'Prefer': 'return=minimal' }),
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
