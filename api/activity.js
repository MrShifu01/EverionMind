import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hdrs = (extra = {}) => ({
  "Content-Type": "application/json",
  "apikey": SB_KEY,
  "Authorization": `Bearer ${SB_KEY}`,
  ...extra,
});

export default async function handler(req, res) {
  if (!(await rateLimit(req, 60))) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // ── GET /api/activity?brain_id=... — fetch activity log (owner only) ──
  if (req.method === "GET") {
    const { brain_id, limit = "50" } = req.query;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });

    // Verify caller owns this brain
    const ownerRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    const ownerData = await ownerRes.json();
    if (!ownerData.length) return res.status(403).json({ error: "Only the brain owner can view activity" });

    const r = await fetch(
      `${SB_URL}/rest/v1/brain_activity?brain_id=eq.${encodeURIComponent(brain_id)}&order=created_at.desc&limit=${Math.min(parseInt(limit) || 50, 500)}`,
      { headers: hdrs() }
    );
    return res.status(r.status).json(await r.json());
  }

  // ── POST /api/activity — log an activity event ──
  if (req.method === "POST") {
    const { brain_id, action, entry_id, details } = req.body;
    if (!brain_id || !action) return res.status(400).json({ error: "brain_id and action required" });

    const validActions = ["created", "updated", "deleted", "connected"];
    if (!validActions.includes(action)) return res.status(400).json({ error: "Invalid action" });

    const r = await fetch(`${SB_URL}/rest/v1/brain_activity`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=minimal" }),
      body: JSON.stringify({
        brain_id,
        user_id: user.id,
        action,
        entry_id: entry_id || null,
        details: details && typeof details === "object" ? details : null,
      }),
    });
    return res.status(r.ok ? 201 : 502).json({ ok: r.ok });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
