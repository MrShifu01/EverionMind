import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;

const ALLOWED_TYPES = ["note", "person", "place", "idea", "contact", "document", "reminder", "color", "decision"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, 30)) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { p_title, p_content, p_type, p_metadata, p_tags, p_brain_id } = req.body;

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
  res.status(response.status).json(data);
}
