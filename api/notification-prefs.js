import { verifyAuth } from "./_lib/verifyAuth.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (extra = {}) => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});

const ALLOWED_FIELDS = [
  "daily_enabled", "daily_time", "daily_timezone",
  "nudge_enabled", "nudge_day", "nudge_time", "nudge_timezone",
  "expiry_enabled", "expiry_lead_days",
];

export default async function handler(req, res) {
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // GET — fetch current prefs
  if (req.method === "GET") {
    const r = await fetch(
      `${SB_URL}/rest/v1/notification_prefs?user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    if (!r.ok) return res.status(502).json({ error: "Failed to fetch prefs" });
    const rows = await r.json();
    return res.status(200).json(rows[0] || null);
  }

  // POST — upsert prefs (partial update)
  if (req.method === "POST") {
    const updates = { user_id: user.id, updated_at: new Date().toISOString() };
    for (const k of ALLOWED_FIELDS) {
      if (k in req.body) updates[k] = req.body[k];
    }
    const r = await fetch(`${SB_URL}/rest/v1/notification_prefs`, {
      method: "POST",
      headers: hdrs({ Prefer: "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify(updates),
    });
    if (!r.ok) return res.status(502).json({ error: "Failed to save prefs" });
    const [row] = await r.json();
    return res.status(200).json(row);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
