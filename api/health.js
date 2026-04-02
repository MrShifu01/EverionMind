import { verifyAuth } from "./_lib/verifyAuth.js";

const SB_URL = "https://wfvoqpdfzkqnenzjxhui.supabase.co";

export default async function handler(req, res) {
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const response = await fetch(`${SB_URL}/rest/v1/entries?select=id&limit=1`, {
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    res.status(response.ok ? 200 : 502).json({ ok: response.ok });
  } catch {
    res.status(500).json({ ok: false });
  }
}
