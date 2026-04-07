import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHdrs = (): Record<string, string> => ({
  apikey: SB_KEY!,
  Authorization: `Bearer ${SB_KEY}`,
});
const sbHdrsJson = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  apikey: SB_KEY!,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method === "GET")    return handleGet(req, res);
  if (req.method === "POST")   return handlePost(req, res);
  if (req.method === "DELETE") return handleDelete(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}

/** GET /api/entry-brains?entry_id=X → string[] of extra brain_ids */
async function handleGet(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 60))) return res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const entry_id = req.query.entry_id as string | undefined;
  if (!entry_id || typeof entry_id !== "string" || entry_id.length > 100) {
    return res.status(400).json({ error: "Missing or invalid entry_id" });
  }

  const r = await fetch(
    `${SB_URL}/rest/v1/entry_brains?entry_id=eq.${encodeURIComponent(entry_id)}&select=brain_id`,
    { headers: sbHdrs() },
  );
  if (!r.ok) return res.status(502).json({ error: "Database error" });
  const rows: any[] = await r.json();
  return res.status(200).json(rows.map((row) => row.brain_id));
}

/** POST /api/entry-brains { entry_id, brain_id } → add assignment */
async function handlePost(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { entry_id, brain_id } = req.body;
  if (
    !entry_id || typeof entry_id !== "string" || entry_id.length > 100 ||
    !brain_id  || typeof brain_id  !== "string" || brain_id.length  > 100
  ) {
    return res.status(400).json({ error: "Missing or invalid entry_id / brain_id" });
  }

  // Verify the user has access to the entry's primary brain
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}&select=brain_id`,
    { headers: sbHdrs() },
  );
  if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
  const [entry]: any[] = await entryRes.json();
  if (!entry) return res.status(404).json({ error: "Entry not found" });

  const access = await checkBrainAccess(user.id, entry.brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const r = await fetch(`${SB_URL}/rest/v1/entry_brains`, {
    method: "POST",
    headers: sbHdrsJson({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify({ entry_id, brain_id }),
  });
  if (!r.ok) return res.status(502).json({ error: "Database error" });
  return res.status(200).json({ ok: true });
}

/** DELETE /api/entry-brains?entry_id=X&brain_id=Y → remove assignment */
async function handleDelete(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const entry_id = req.query.entry_id as string | undefined;
  const brain_id = req.query.brain_id as string | undefined;
  if (
    !entry_id || typeof entry_id !== "string" || entry_id.length > 100 ||
    !brain_id  || typeof brain_id  !== "string" || brain_id.length  > 100
  ) {
    return res.status(400).json({ error: "Missing or invalid entry_id / brain_id" });
  }

  // Verify the user has access to the entry's primary brain
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry_id)}&select=brain_id`,
    { headers: sbHdrs() },
  );
  if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
  const [entry]: any[] = await entryRes.json();
  if (!entry) return res.status(404).json({ error: "Entry not found" });

  const access = await checkBrainAccess(user.id, entry.brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const r = await fetch(
    `${SB_URL}/rest/v1/entry_brains?entry_id=eq.${encodeURIComponent(entry_id)}&brain_id=eq.${encodeURIComponent(brain_id)}`,
    { method: "DELETE", headers: sbHdrs() },
  );
  if (!r.ok) return res.status(502).json({ error: "Database error" });
  return res.status(200).json({ ok: true });
}
