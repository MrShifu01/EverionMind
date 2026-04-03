import { verifyAuth } from "./_lib/verifyAuth.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (extra = {}) => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});

export default async function handler(req, res) {
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // POST — store subscription
  if (req.method === "POST") {
    const { endpoint, keys, userAgent } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "endpoint, keys.p256dh, and keys.auth required" });
    }

    // Validate endpoint is a valid HTTPS URL
    let parsedEndpoint;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch {
      return res.status(400).json({ error: "Invalid push endpoint" });
    }
    if (parsedEndpoint.protocol !== 'https:') {
      return res.status(400).json({ error: "Push endpoint must be HTTPS" });
    }
    const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions`, {
      method: "POST",
      headers: hdrs({ Prefer: "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify({
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent || null,
      }),
    });
    if (!r.ok) return res.status(502).json({ error: "Failed to store subscription" });
    return res.status(200).json({ ok: true });
  }

  // DELETE — remove subscription
  if (req.method === "DELETE") {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&endpoint=eq.${encodeURIComponent(endpoint)}`,
      { method: "DELETE", headers: hdrs() }
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
