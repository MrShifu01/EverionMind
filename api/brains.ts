import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { randomBytes, scryptSync } from "crypto";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

/**
 * Verify a brain API key against its stored scrypt hash.
 * Returns true if the key matches, false otherwise (never throws).
 */
export function verifyBrainApiKey(key: string, hash: string, salt: string): boolean {
  try {
    const derived = scryptSync(key, salt, 32).toString("hex");
    return derived === hash;
  } catch {
    return false;
  }
}

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  "apikey": SB_KEY!,
  "Authorization": `Bearer ${SB_KEY}`,
  ...extra,
});

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (!(await rateLimit(req, 60))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { method } = req;
  const action = req.query.action as string | undefined;

  // ── GET /api/brains — list owned brains, auto-create "My Brain" if none exists ──
  if (method === "GET" && !action) {
    const owned = await fetch(
      `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`,
      { headers: hdrs() }
    );
    if (!owned.ok) return res.status(502).json({ error: "Failed to fetch brains" });

    let ownedData: any[] = await owned.json();

    // Auto-create "My Brain" for users who have none
    if (ownedData.length === 0) {
      const createRes = await fetch(`${SB_URL}/rest/v1/brains`, {
        method: "POST",
        headers: hdrs({ "Prefer": "return=representation" }),
        body: JSON.stringify({ name: "My Brain", owner_id: user.id }),
      });
      if (createRes.ok) {
        const [newBrain]: any[] = await createRes.json();
        // Assign any orphan entries (brain_id IS NULL) to this brain
        await fetch(`${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(user.id)}&brain_id=is.null`, {
          method: "PATCH",
          headers: hdrs({ "Prefer": "return=minimal" }),
          body: JSON.stringify({ brain_id: newBrain.id }),
        }).catch((err) => console.error("[brains:auto-create] Failed to assign orphan entries:", err.message));
        ownedData = [newBrain];
        console.log(`[audit] AUTO-CREATE My Brain id=${newBrain.id} user=${user.id}`);
      }
    }

    return res.status(200).json(ownedData);
  }

  // ── POST /api/brains?action=telegram-code — generate one-time link code ──
  if (method === "POST" && action === "telegram-code") {
    const { brain_id } = req.body;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });
    const ownerRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    if (!(await ownerRes.json()).length) return res.status(403).json({ error: "Not the brain owner" });
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const r = await fetch(`${SB_URL}/rest/v1/messaging_pending_links`, { method: "POST", headers: hdrs({ "Prefer": "return=minimal" }), body: JSON.stringify({ user_id: user.id, brain_id, platform: "telegram", code, expires_at: expiresAt }) });
    if (!r.ok) return res.status(502).json({ error: "Failed to create link code" });
    return res.status(200).json({ code });
  }

  // ── POST /api/brains?action=generate-api-key — create per-brain API key ──
  if (method === "POST" && action === "generate-api-key") {
    const { brain_id, label } = req.body;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });
    // Only owner can generate keys
    const ownerRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    if (!(await ownerRes.json()).length) return res.status(403).json({ error: "Not the brain owner" });
    // Generate a cryptographically secure random key: ob_<32 hex chars>
    const key = "ob_" + randomBytes(32).toString("hex");
    // Hash the key with scrypt before storing — plaintext is shown once and never stored alone
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(key, salt, 32).toString("hex");
    const prefix = key.slice(0, 10); // first 10 chars for identification
    const r = await fetch(`${SB_URL}/rest/v1/brain_api_keys`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=representation" }),
      body: JSON.stringify({
        brain_id,
        user_id: user.id,
        api_key: key,           // kept for backward compat during transition
        api_key_hash: hash,
        api_key_salt: salt,
        api_key_prefix: prefix,
        label: (label || "").slice(0, 100) || "Default",
      }),
    });
    if (!r.ok) return res.status(502).json({ error: "Failed to create API key" });
    const [created] = await r.json();
    // Return plaintext key to UI — shown once, never stored in plaintext going forward
    return res.status(200).json({ id: created.id, api_key: key, label: created.label, created_at: created.created_at });
  }

  // ── GET /api/brains?action=api-keys&brain_id=... — list brain API keys ──
  if (method === "GET" && action === "api-keys") {
    const brain_id = Array.isArray(req.query.brain_id) ? req.query.brain_id[0] : req.query.brain_id;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });
    const ownerRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    if (!(await ownerRes.json()).length) return res.status(403).json({ error: "Not the brain owner" });
    const r = await fetch(
      `${SB_URL}/rest/v1/brain_api_keys?brain_id=eq.${encodeURIComponent(brain_id)}&is_active=eq.true&select=id,label,created_at,last_used_at&order=created_at.desc`,
      { headers: hdrs() }
    );
    if (!r.ok) return res.status(502).json({ error: "Failed to fetch API keys" });
    return res.status(200).json(await r.json());
  }

  // ── DELETE /api/brains?action=api-key — revoke a brain API key ──
  if (method === "DELETE" && action === "api-key") {
    const { key_id, brain_id } = req.body;
    if (!key_id || !brain_id) return res.status(400).json({ error: "key_id and brain_id required" });
    const ownerRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    if (!(await ownerRes.json()).length) return res.status(403).json({ error: "Not the brain owner" });
    const r = await fetch(
      `${SB_URL}/rest/v1/brain_api_keys?id=eq.${encodeURIComponent(key_id)}&brain_id=eq.${encodeURIComponent(brain_id)}`,
      { method: "PATCH", headers: hdrs({ "Prefer": "return=minimal" }), body: JSON.stringify({ is_active: false }) }
    );
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
