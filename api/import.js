import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (extra = {}) => ({ "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, ...extra });

const MAX_ENTRIES = 500;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 5))) return res.status(429).json({ error: "Too many requests" });
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { brain_id, entries, options = {} } = req.body;
  if (!brain_id || !Array.isArray(entries)) return res.status(400).json({ error: "brain_id and entries array required" });
  if (entries.length > MAX_ENTRIES) return res.status(400).json({ error: `Max ${MAX_ENTRIES} entries per import` });

  // Verify write access (owner or member)
  const [ownedRes, memberRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() }),
    fetch(`${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id)}&user_id=eq.${encodeURIComponent(user.id)}&role=neq.viewer`, { headers: hdrs() }),
  ]);
  const owned = await ownedRes.json();
  const member = await memberRes.json();
  if (!owned.length && !member.length) return res.status(403).json({ error: "No write access to this brain" });

  // Fetch existing entries for duplicate check
  const existingRes = await fetch(`${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&select=title,type`, { headers: hdrs() });
  const existing = existingRes.ok ? await existingRes.json() : [];
  const existingKeys = new Set(existing.map(e => `${e.title?.toLowerCase()}::${e.type}`));

  let imported = 0, skipped = 0, errors = [];

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
