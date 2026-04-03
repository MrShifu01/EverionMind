import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENTRY_FIELDS = "id,title,content,type,tags,metadata,brain_id,importance,pinned,created_at";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, 60)) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const brain_id = req.query.brain_id;

  if (brain_id) {
    // SEC-1: Verify the requesting user is a member of this brain
    const memberRes = await fetch(
      `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`,
      { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
    );
    const [member] = await memberRes.json();
    if (!member) return res.status(403).json({ error: "Forbidden" });

    // Use RPC to get entries visible in this brain (primary + cross-brain shares)
    // The ?select= param on a PostgREST RPC endpoint filters the returned columns.
    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/get_entries_for_brain?select=${encodeURIComponent(ENTRY_FIELDS)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify({ p_brain_id: brain_id }),
    });

    if (rpcRes.ok) {
      const data = await rpcRes.json();
      return res.status(200).json(data);
    }

    // Fallback: direct query if RPC not yet available (pre-migration)
    const fallbackRes = await fetch(
      `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=500&brain_id=eq.${encodeURIComponent(brain_id)}`,
      { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
    );
    const fallbackData = await fallbackRes.json();
    return res.status(fallbackRes.status).json(fallbackData);
  }

  // Fallback: user's own entries (pre-migration compatibility)
  const url = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=500&user_id=eq.${encodeURIComponent(user.id)}`;
  const response = await fetch(url, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
  });
  const data = await response.json();
  res.status(response.status).json(data);
}
