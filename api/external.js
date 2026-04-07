import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENTRY_FIELDS = "id,title,content,type,tags,metadata,brain_id,importance,pinned,created_at";

const hdrs = (extra = {}) => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});

/**
 * Verify a brain API key and return { brain_id, user_id } or null.
 * Also updates last_used_at for the key.
 */
async function verifyBrainApiKey(apiKey) {
  if (!apiKey || !apiKey.startsWith("ob_")) return null;

  const res = await fetch(
    `${SB_URL}/rest/v1/brain_api_keys?api_key=eq.${encodeURIComponent(apiKey)}&is_active=eq.true&select=id,brain_id,user_id`,
    { headers: hdrs() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows.length) return null;

  const row = rows[0];

  // Fire-and-forget: update last_used_at
  fetch(`${SB_URL}/rest/v1/brain_api_keys?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    headers: hdrs({ Prefer: "return=minimal" }),
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch(() => {});

  return { brain_id: row.brain_id, user_id: row.user_id };
}

/**
 * External API — authenticate via brain API key (X-Brain-Api-Key header)
 *
 * GET /api/external?action=entries    — list all entries in the brain
 * GET /api/external?action=entries&type=reminder  — filter by type
 * GET /api/external?action=entries&since=2024-01-01  — entries created after date
 * GET /api/external?action=links      — list all links/relationships
 * GET /api/external?action=brain      — brain metadata (name, type)
 */
export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  if (!(await rateLimit(req, 30)))
    return res.status(429).json({ error: "Too many requests" });

  // Authenticate via header or query param
  const apiKey =
    req.headers["x-brain-api-key"] || req.query.api_key || "";
  const auth = await verifyBrainApiKey(apiKey.trim());
  if (!auth) return res.status(401).json({ error: "Invalid or revoked API key" });

  const { brain_id } = auth;
  const action = req.query.action;

  // ── Entries ──
  if (action === "entries") {
    let url = `${SB_URL}/rest/v1/entries?select=${encodeURIComponent(ENTRY_FIELDS)}&brain_id=eq.${encodeURIComponent(brain_id)}&order=created_at.desc`;

    // Optional type filter
    if (req.query.type) url += `&type=eq.${encodeURIComponent(req.query.type)}`;

    // Optional since filter
    if (req.query.since) url += `&created_at=gte.${encodeURIComponent(req.query.since)}`;

    // Optional limit (default 500, max 1000)
    const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
    url += `&limit=${limit}`;

    const r = await fetch(url, { headers: hdrs() });
    if (!r.ok) return res.status(502).json({ error: "Failed to fetch entries" });
    const entries = await r.json();
    return res.status(200).json({ brain_id, count: entries.length, entries });
  }

  // ── Links ──
  if (action === "links") {
    // Get entry IDs for this brain first
    const idsRes = await fetch(
      `${SB_URL}/rest/v1/entries?select=id&brain_id=eq.${encodeURIComponent(brain_id)}&limit=1000`,
      { headers: hdrs() }
    );
    if (!idsRes.ok) return res.status(502).json({ error: "Failed to fetch entries" });
    const ids = (await idsRes.json()).map(e => e.id);
    if (ids.length === 0) return res.status(200).json({ brain_id, count: 0, links: [] });

    // Fetch links where either from or to is in this brain
    const linksRes = await fetch(
      `${SB_URL}/rest/v1/entry_links?select=from_entry_id,to_entry_id,rel,created_at&or=(from_entry_id.in.(${ids.join(",")}),to_entry_id.in.(${ids.join(",")}))&limit=1000`,
      { headers: hdrs() }
    );
    if (!linksRes.ok) return res.status(502).json({ error: "Failed to fetch links" });
    const links = await linksRes.json();
    return res.status(200).json({ brain_id, count: links.length, links });
  }

  // ── Brain metadata ──
  if (action === "brain") {
    const r = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&select=id,name,type,created_at`,
      { headers: hdrs() }
    );
    if (!r.ok) return res.status(502).json({ error: "Failed to fetch brain" });
    const rows = await r.json();
    return res.status(200).json(rows[0] || null);
  }

  return res.status(400).json({
    error: "Unknown action",
    available: ["entries", "links", "brain"],
    example: "/api/external?action=entries&api_key=ob_...",
  });
}
