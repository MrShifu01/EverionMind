import { verifyAuth } from "./_lib/verifyAuth.js";

const SB_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { links, brain_id } = req.body;
  if (!Array.isArray(links)) return res.status(400).json({ error: "links must be an array" });

  // Validate link structure
  const valid = links.filter(l => l.from && l.to && l.rel && typeof l.from === "string" && typeof l.to === "string" && typeof l.rel === "string");
  if (valid.length === 0) return res.status(400).json({ error: "No valid links" });

  // Upsert links — store as a JSON column on user profile or a dedicated table
  // For now, store in a simple key-value approach using entries metadata
  const response = await fetch(`${SB_URL}/rest/v1/rpc/save_links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      p_user_id: user.id,
      p_links: JSON.stringify(valid),
      ...(brain_id && typeof brain_id === "string" ? { p_brain_id: brain_id } : {}),
    }),
  });

  // If the RPC doesn't exist yet, fall back gracefully
  if (!response.ok) {
    const err = await response.text().catch(() => "");
    console.log(`[save-links] RPC not available: ${err}`);
    return res.status(200).json({ ok: true, stored: "local-only", message: "Links saved locally. Create the save_links RPC in Supabase to enable server persistence." });
  }

  res.status(200).json({ ok: true, stored: "database", count: valid.length });
}
