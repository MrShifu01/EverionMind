import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (extra = {}) => ({ "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, ...extra });

const MAX_CHARS = 8000;

export default async function handler(req, res) {
  if (!rateLimit(req, 30)) return res.status(429).json({ error: "Too many requests" });
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const r = await fetch(`${SB_URL}/rest/v1/user_memory?user_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    const data = await r.json();
    return res.status(200).json(data[0] || { content: "", updated_at: null });
  }

  if (req.method === "POST" || req.method === "PATCH") {
    const { content } = req.body;
    if (typeof content !== "string") return res.status(400).json({ error: "content must be a string" });
    const trimmed = content.slice(0, MAX_CHARS);
    const r = await fetch(`${SB_URL}/rest/v1/user_memory`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify({ user_id: user.id, content: trimmed, updated_at: new Date().toISOString() }),
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : 502).json(r.ok ? (data[0] || {}) : { error: "Failed to save memory" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
