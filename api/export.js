import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = () => ({ "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` });

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, 10)) return res.status(429).json({ error: "Too many requests" });
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { brain_id } = req.query;
  if (!brain_id) return res.status(400).json({ error: "brain_id required" });

  // Check role — viewers cannot export (also covers "not a member" case)
  const roleRes = await fetch(
    `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`,
    { headers: hdrs() }
  );
  if (!roleRes.ok) return res.status(502).json({ error: "Database error" });
  const [membership] = await roleRes.json();
  if (!membership) return res.status(403).json({ error: "Not a member" });
  if (membership.role === 'viewer') return res.status(403).json({ error: "Viewers cannot export" });

  // Fetch brain metadata for owned brains
  const ownedRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
  const owned = await ownedRes.json();

  const brainData = owned[0] || null;

  // Fetch entries
  const entriesRes = await fetch(`${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&order=created_at.asc`, { headers: hdrs() });
  if (!entriesRes.ok) return res.status(502).json({ error: "Failed to fetch entries" });
  const entries = await entriesRes.json();

  // Fetch links for these entries
  const ids = entries.map(e => e.id);
  let links = [];
  if (ids.length > 0) {
    const linksRes = await fetch(`${SB_URL}/rest/v1/entry_links?or=(from_id.in.(${ids.map(encodeURIComponent).join(",")}),to_id.in.(${ids.map(encodeURIComponent).join(",")}))`, { headers: hdrs() });
    if (linksRes.ok) links = await linksRes.json();
  }

  // Strip context-specific fields
  const exportEntries = entries.map(({ id: _id, brain_id: _bid, user_id: _uid, ...rest }) => rest);
  const exportLinks = links.map(({ id: _id, ...rest }) => rest);

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
