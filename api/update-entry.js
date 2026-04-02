import { verifyAuth } from "./_lib/verifyAuth.js";

const SB_URL = "https://wfvoqpdfzkqnenzjxhui.supabase.co";

export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id, title, content, type, tags } = req.body;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const response = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ title, content, type, tags }),
  });

  const data = await response.json();
  res.status(response.ok ? 200 : 502).json(data);
}
