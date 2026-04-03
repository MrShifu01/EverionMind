import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, 30)) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id, title, content, type, tags, metadata } = req.body;
  if (!id || typeof id !== "string" || id.length > 100) {
    return res.status(400).json({ error: "Missing or invalid id" });
  }
  if (title !== undefined && (typeof title !== "string" || title.length > 500)) {
    return res.status(400).json({ error: "Invalid title" });
  }
  if (type !== undefined && (typeof type !== "string" || type.length > 50)) {
    return res.status(400).json({ error: "Invalid type" });
  }

  const patch = {};
  if (title !== undefined) patch.title = title;
  if (content !== undefined) patch.content = String(content).slice(0, 10000);
  if (type !== undefined) patch.type = type;
  if (Array.isArray(tags)) patch.tags = tags.filter(t => typeof t === "string").slice(0, 50);
  if (metadata !== undefined && typeof metadata === "object" && !Array.isArray(metadata)) patch.metadata = metadata;

  // SEC-1: Verify the requesting user is a member of this entry's brain
  const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`, {
    headers: {
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
  const [entry] = await entryRes.json();
  if (!entry) return res.status(404).json({ error: "Not found" });

  const memberRes = await fetch(
    `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(entry.brain_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`,
    {
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!memberRes.ok) return res.status(502).json({ error: "Database error" });
  const [member] = await memberRes.json();
  if (!member) return res.status(403).json({ error: "Forbidden" });

  const response = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(patch),
    }
  );

  console.log(`[audit] PATCH entry id=${id} user=${user.id} ok=${response.ok}`);
  const data = await response.json();
  res.status(response.ok ? 200 : 502).json(data);
}
