import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (extra = {}) => ({ "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, ...extra });

const MAX_CHARS = 8000;

// Dispatched via rewrites: /api/memory, /api/activity, /api/health, /api/vault → /api/user-data?resource=X
export default async function handler(req, res) {
  const resource = req.query.resource;
  if (resource === "activity") return handleActivity(req, res);
  if (resource === "health") return handleHealth(req, res);
  if (resource === "vault") return handleVault(req, res);
  // Default: memory
  return handleMemory(req, res);
}

// ── /api/memory (rewritten to /api/user-data?resource=memory) ──
async function handleMemory(req, res) {
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });
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

// ── /api/activity (rewritten to /api/user-data?resource=activity) ──
async function handleActivity(req, res) {
  if (!(await rateLimit(req, 60))) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // GET /api/activity?brain_id=... — fetch activity log (owner only)
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

  // POST /api/activity — log an activity event
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

// ── /api/health (rewritten to /api/user-data?resource=health) ──
async function handleHealth(req, res) {
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const response = await fetch(`${SB_URL}/rest/v1/entries?select=id&limit=1`, {
      headers: {
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
      },
    });
    res.status(response.ok ? 200 : 502).json({ ok: response.ok });
  } catch {
    res.status(500).json({ ok: false });
  }
}

// ── /api/vault (rewritten to /api/user-data?resource=vault) ──
async function handleVault(req, res) {
  if (!(await rateLimit(req, 20))) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const r = await fetch(
      `${SB_URL}/rest/v1/vault_keys?user_id=eq.${encodeURIComponent(user.id)}&select=salt,verify_token,recovery_blob`,
      { headers: hdrs() }
    );
    if (!r.ok) return res.status(502).json({ error: "Database error" });
    const rows = await r.json();
    if (rows.length === 0) return res.status(200).json({ exists: false });
    return res.status(200).json({
      exists: true,
      salt: rows[0].salt,
      verify_token: rows[0].verify_token,
      recovery_blob: rows[0].recovery_blob,
    });
  }

  if (req.method === "POST") {
    const { salt, verify_token, recovery_blob } = req.body || {};
    if (!salt || typeof salt !== "string" || salt.length !== 32) {
      return res.status(400).json({ error: "Invalid salt (must be 32-char hex)" });
    }
    if (!verify_token || typeof verify_token !== "string") {
      return res.status(400).json({ error: "Missing verify_token" });
    }
    if (!recovery_blob || typeof recovery_blob !== "string") {
      return res.status(400).json({ error: "Missing recovery_blob" });
    }

    // Prevent overwrite — vault can only be set up once
    const existing = await fetch(
      `${SB_URL}/rest/v1/vault_keys?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
      { headers: hdrs() }
    );
    const rows = await existing.json();
    if (rows.length > 0) {
      return res.status(409).json({ error: "Vault already set up" });
    }

    const r = await fetch(`${SB_URL}/rest/v1/vault_keys`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=minimal" }),
      body: JSON.stringify({ user_id: user.id, salt, verify_token, recovery_blob }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => r.status);
      return res.status(502).json({ error: `Database error: ${err}` });
    }
    return res.status(201).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
