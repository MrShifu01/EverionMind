import { verifyAuth } from "./_lib/verifyAuth.js";

const SB_URL = "https://wfvoqpdfzkqnenzjxhui.supabase.co";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const response = await fetch(
    `${SB_URL}/rest/v1/entries?select=*&order=created_at.desc&limit=500`,
    {
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  const data = await response.json();
  res.status(response.status).json(data);
}
