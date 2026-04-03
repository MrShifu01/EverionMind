import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;

const ALLOWED_TYPES = ["note", "person", "place", "idea", "contact", "document", "reminder", "color", "decision"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, 30)) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { p_title, p_content, p_type, p_metadata, p_tags, p_brain_id, p_extra_brain_ids } = req.body;

  if (!p_title || typeof p_title !== "string" || p_title.trim().length === 0) {
    return res.status(400).json({ error: "Missing or invalid title" });
  }
  if (p_type !== undefined && !ALLOWED_TYPES.includes(p_type)) {
    return res.status(400).json({ error: "Invalid type" });
  }

  const safeBody = {
    p_title: p_title.trim().slice(0, 500),
    p_content: p_content ? String(p_content).slice(0, 10000) : "",
    p_type: ALLOWED_TYPES.includes(p_type) ? p_type : "note",
    p_metadata: p_metadata && typeof p_metadata === "object" && !Array.isArray(p_metadata) ? p_metadata : {},
    p_tags: Array.isArray(p_tags) ? p_tags.filter(t => typeof t === "string").slice(0, 50) : [],
    p_user_id: user.id,
    ...(p_brain_id && typeof p_brain_id === "string" ? { p_brain_id } : {}),
  };

  const response = await fetch(`${SB_URL}/rest/v1/rpc/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(safeBody),
  });

  const data = await response.json();

  // Verify user is a member/owner of each extra brain before inserting
  if (Array.isArray(p_extra_brain_ids) && p_extra_brain_ids.length > 0) {
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbHdrs = {
      "Content-Type": "application/json",
      "apikey": sbKey,
      "Authorization": `Bearer ${sbKey}`,
    };
    for (const brainId of p_extra_brain_ids) {
      if (typeof brainId !== "string") continue;
      const memberRes = await fetch(
        `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`,
        { headers: sbHdrs }
      );
      const members = memberRes.ok ? await memberRes.json() : [];
      if (!members.length) {
        return res.status(403).json({ error: `Not a member of brain ${brainId}` });
      }
    }
  }

  // If extra brain IDs provided, share the entry into those brains via entry_brains
  if (response.ok && data?.id && Array.isArray(p_extra_brain_ids) && p_extra_brain_ids.length > 0) {
    const extraIds = p_extra_brain_ids.filter(id => typeof id === "string" && id !== p_brain_id);
    if (extraIds.length > 0) {
      const rows = extraIds.map(brain_id => ({ entry_id: data.id, brain_id }));
      fetch(`${SB_URL}/rest/v1/entry_brains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Prefer": "resolution=ignore-duplicates",
        },
        body: JSON.stringify(rows),
      }).catch(() => {}); // Non-fatal — fire and forget
    }
  }

  res.status(response.status).json(data);
}
