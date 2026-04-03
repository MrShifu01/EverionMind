import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(req, 60)) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const brain_id = req.query.brain_id;
  let url = `${SB_URL}/rest/v1/entries?select=*&order=created_at.desc&limit=500`;
  if (brain_id) {
    url += `&brain_id=eq.${encodeURIComponent(brain_id)}`;
  } else {
    // Fallback: user's own entries (pre-migration compatibility)
    url += `&user_id=eq.${encodeURIComponent(user.id)}`;
  }

  const response = await fetch(url, {
    headers: {
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
