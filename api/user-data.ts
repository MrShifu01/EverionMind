import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import crypto from "crypto";
import webpush from "web-push";
import { runGmailScanAllUsers } from "./_lib/gmailScan.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({ "Content-Type": "application/json", "apikey": SB_KEY!, "Authorization": `Bearer ${SB_KEY}`, ...extra });

const MAX_CHARS = 8000;

// Dispatched via rewrites:
//   /api/memory, /api/activity, /api/health, /api/vault → /api/user-data?resource=X
//   /api/pin → /api/user-data?resource=pin
//   /api/user-data?resource=api_keys → MCP API key management
//   /api/notification-prefs → /api/user-data?resource=prefs
//   /api/push-subscribe     → /api/user-data?resource=push
//   /api/brains             → /api/user-data?resource=brains
//   /api/cron/daily         → /api/user-data?resource=cron-daily
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  const resource = req.query.resource as string | undefined;
  if (resource === "activity") return handleActivity(req, res);
  if (resource === "health") return handleHealth(req, res);
  if (resource === "vault") return handleVault(req, res);
  if (resource === "pin") return handlePin(req, res);
  if (resource === "account") return handleDeleteAccount(req, res);
  if (resource === "api_keys") return handleApiKeys(req, res);
  if (resource === "prefs") return handleNotificationPrefs(req, res);
  if (resource === "push") return handlePushSubscribe(req, res);
  if (resource === "brains") return handleBrains(req, res);
  if (resource === "cron-daily") return handleCronDaily(req, res);
  // Default: memory
  return handleMemory(req, res);
}

// ── /api/brains (rewritten to /api/user-data?resource=brains) ──
async function handleBrains(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 60))) return void res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return void res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const owned = await fetch(
      `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`,
      { headers: hdrs() },
    );
    if (!owned.ok) return void res.status(502).json({ error: "Failed to fetch brains" });
    let ownedData: any[] = await owned.json();

    if (ownedData.length === 0) {
      const createRes = await fetch(`${SB_URL}/rest/v1/brains`, {
        method: "POST",
        headers: hdrs({ Prefer: "return=representation" }),
        body: JSON.stringify({ name: "My Brain", owner_id: user.id }),
      });
      if (createRes.ok) {
        const [newBrain]: any[] = await createRes.json();
        await fetch(
          `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(user.id)}&brain_id=is.null`,
          { method: "PATCH", headers: hdrs({ Prefer: "return=minimal" }), body: JSON.stringify({ brain_id: newBrain.id }) },
        ).catch(() => {});
        ownedData = [newBrain];
      }
    }
    return void res.status(200).json(ownedData);
  }

  return void res.status(405).json({ error: "Method not allowed" });
}

// ── /api/memory (rewritten to /api/user-data?resource=memory) ──
async function handleMemory(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const r = await fetch(`${SB_URL}/rest/v1/user_memory?user_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    const data: any[] = await r.json();
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
    const data: any[] = await r.json();
    return res.status(r.ok ? 200 : 502).json(r.ok ? (data[0] || {}) : { error: "Failed to save memory" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ── /api/activity (rewritten to /api/user-data?resource=activity) ──
async function handleActivity(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 60))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // GET /api/activity?brain_id=... — fetch activity log (owner only)
  if (req.method === "GET") {
    const { brain_id, limit = "50" } = req.query;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });

    // Verify caller owns this brain
    const ownerRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id as string)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    const ownerData: any[] = await ownerRes.json();
    if (!ownerData.length) return res.status(403).json({ error: "Only the brain owner can view activity" });

    const r = await fetch(
      `${SB_URL}/rest/v1/brain_activity?brain_id=eq.${encodeURIComponent(brain_id as string)}&order=created_at.desc&limit=${Math.min(parseInt(limit as string) || 50, 500)}`,
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

    // Verify caller owns this brain before writing activity
    const ownerRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() },
    );
    const ownerData: any[] = await ownerRes.json();
    if (!ownerData.length) return res.status(403).json({ error: "Forbidden" });

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
async function handleHealth(req: ApiRequest, res: ApiResponse): Promise<void> {
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
  const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();

  // Test DB
  let db = false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/entries?select=id&limit=1`, {
      headers: { "apikey": SB_KEY!, "Authorization": `Bearer ${SB_KEY}` },
    });
    db = r.ok;
  } catch { db = false; }

  // Test Gemini — list available models and do a real inference test
  let gemini = false;
  let geminiModel = "";
  let geminiError = "";
  if (GEMINI_API_KEY) {
    try {
      // Step 1: find available gemma/gemini models
      const listR = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}&pageSize=200`
      );
      if (listR.ok) {
        const listData: any = await listR.json();
        const names: string[] = (listData.models || []).map((m: any) => (m.name as string).replace("models/", ""));
        const gemma4 = names.find(n => n.includes("gemma-4") && n.includes("it"));
        const gemma3 = names.find(n => n.includes("gemma-3") && n.includes("27b"));
        const flash  = names.find(n => n.includes("gemini-2.0-flash-lite") || n.includes("gemini-2.0-flash"));
        const candidate = gemma4 || gemma3 || flash || names[0];
        geminiModel = candidate || "";

        // Step 2: real inference test with the found model
        if (candidate) {
          const testR = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 5 } }),
            }
          );
          gemini = testR.ok;
          if (!testR.ok) {
            const errData: any = await testR.json().catch(() => ({}));
            geminiError = errData?.error?.message || `HTTP ${testR.status}`;
          }
        }
      } else {
        geminiError = `Key error: HTTP ${listR.status}`;
      }
    } catch (e: any) { geminiError = e.message; }
  }

  // Test Groq — list models (lightweight key validation)
  let groq = false;
  if (GROQ_API_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
      });
      groq = r.ok;
    } catch { groq = false; }
  }

  res.status(200).json({ db, gemini, geminiModel, geminiError, groq });
}

// ── /api/vault (rewritten to /api/user-data?resource=vault) ──
async function handleVault(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 20))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const r = await fetch(
      `${SB_URL}/rest/v1/vault_keys?user_id=eq.${encodeURIComponent(user.id)}&select=salt,verify_token,recovery_blob`,
      { headers: hdrs() }
    );
    if (!r.ok) return res.status(502).json({ error: "Database error" });
    const rows: any[] = await r.json();
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
    const rows: any[] = await existing.json();
    if (rows.length > 0) {
      return res.status(409).json({ error: "Vault already set up" });
    }

    const r = await fetch(`${SB_URL}/rest/v1/vault_keys`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=minimal" }),
      body: JSON.stringify({ user_id: user.id, salt, verify_token, recovery_blob }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => String(r.status));
      return res.status(502).json({ error: `Database error: ${err}` });
    }
    return res.status(201).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ── /api/pin (rewritten to /api/user-data?resource=pin) ──
async function handlePin(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 10))) return void res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return void res.status(401).json({ error: "Unauthorized" });

  const action = req.query.action as string;

  if (req.method === "POST" && action === "setup") {
    const { hash, salt } = req.body;
    if (!hash || typeof hash !== "string" || !/^[0-9a-f]{64}$/i.test(hash))
      return void res.status(400).json({ error: "Invalid hash" });
    if (!salt || typeof salt !== "string" || !/^[0-9a-f]{32}$/i.test(salt))
      return void res.status(400).json({ error: "Invalid salt" });

    const r = await fetch(
      `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: hdrs({ Prefer: "return=minimal" }),
        body: JSON.stringify({ pin_hash: hash, pin_hash_salt: salt }),
      },
    );
    if (!r.ok) {
      await fetch(`${SB_URL}/rest/v1/user_ai_settings`, {
        method: "POST",
        headers: hdrs({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ user_id: user.id, pin_hash: hash, pin_hash_salt: salt }),
      });
    }
    return void res.status(200).json({ ok: true });
  }

  if (req.method === "POST" && action === "verify") {
    const { hash } = req.body;
    if (!hash || typeof hash !== "string") return void res.status(400).json({ error: "hash required" });

    const r = await fetch(
      `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}&select=pin_hash`,
      { headers: hdrs() },
    );
    const rows: any[] = r.ok ? await r.json() : [];
    const storedHash = rows[0]?.pin_hash;
    if (!storedHash) return void res.status(200).json({ valid: false, noPinSet: true });

    try {
      const valid = crypto.timingSafeEqual(
        Buffer.from(hash.toLowerCase(), "hex"),
        Buffer.from(storedHash.toLowerCase(), "hex"),
      );
      return void res.status(200).json({ valid });
    } catch {
      return void res.status(200).json({ valid: false });
    }
  }

  if (req.method === "DELETE" && action === "delete") {
    await fetch(
      `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: hdrs({ Prefer: "return=minimal" }),
        body: JSON.stringify({ pin_hash: null, pin_hash_salt: null }),
      },
    );
    return void res.status(200).json({ ok: true });
  }

  return void res.status(405).json({ error: "Method not allowed" });
}

// ── /api/user-data?resource=account — delete authenticated user's account ──
async function handleDeleteAccount(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "DELETE") return void res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 5))) return void res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return void res.status(401).json({ error: "Unauthorized" });

  // Fetch vault entries before deletion so they can be exported
  const vaultRes = await fetch(
    `${SB_URL}/rest/v1/vault_entries?user_id=eq.${encodeURIComponent(user.id)}&select=*`,
    { headers: hdrs() },
  );
  const vault_export: any[] = vaultRes.ok ? await vaultRes.json() : [];

  const r = await fetch(`${SB_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: "DELETE",
    headers: hdrs(),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => String(r.status));
    console.error("[account:delete] Failed:", r.status, detail);
    return void res.status(502).json({ error: "Failed to delete account" });
  }

  console.log(`[audit] DELETE_ACCOUNT user=${user.id}`);
  return void res.status(200).json({ deleted: true, vault_export });
}

// ── /api/user-data?resource=api_keys — Claude Code / MCP API key management ──
async function handleApiKeys(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 20))) return void res.status(429).json({ error: "Too many requests" });
  const user: any = await verifyAuth(req);
  if (!user) return void res.status(401).json({ error: "Unauthorized" });

  // GET — list active keys (never returns hash or raw key)
  if (req.method === "GET") {
    const r = await fetch(
      `${SB_URL}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(user.id)}&revoked_at=is.null&select=id,name,key_prefix,created_at,last_used_at&order=created_at.desc`,
      { headers: hdrs() },
    );
    if (!r.ok) return void res.status(502).json({ error: "Database error" });
    return void res.status(200).json(await r.json());
  }

  // POST — generate a new key
  if (req.method === "POST") {
    const { name } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return void res.status(400).json({ error: "name required" });
    }

    // Generate raw key: em_ + 32 random bytes as hex
    const rawKey = "em_" + crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 12);

    const r = await fetch(`${SB_URL}/rest/v1/user_api_keys`, {
      method: "POST",
      headers: hdrs({ Prefer: "return=representation" }),
      body: JSON.stringify({ user_id: user.id, name: name.trim().slice(0, 100), key_hash: keyHash, key_prefix: keyPrefix }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => String(r.status));
      return void res.status(502).json({ error: `Database error: ${err}` });
    }
    const rows: any[] = await r.json();
    // Return raw key once — it is never stored and cannot be retrieved again
    return void res.status(201).json({ id: rows[0].id, name: rows[0].name, key: rawKey, key_prefix: keyPrefix });
  }

  // DELETE — revoke a key by id
  if (req.method === "DELETE") {
    const id = req.query.id as string;
    if (!id) return void res.status(400).json({ error: "id required" });

    const r = await fetch(
      `${SB_URL}/rest/v1/user_api_keys?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: hdrs({ Prefer: "return=minimal" }),
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      },
    );
    if (!r.ok) return void res.status(502).json({ error: "Database error" });
    return void res.status(200).json({ ok: true });
  }

  return void res.status(405).json({ error: "Method not allowed" });
}

// ── /api/notification-prefs (rewritten to /api/user-data?resource=prefs) ──
async function handleNotificationPrefs(req: ApiRequest, res: ApiResponse): Promise<void> {
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const adminHdrs = { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };

  if (req.method === "GET") {
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: adminHdrs });
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch prefs" });
    const data: any = await r.json();
    return res.status(200).json(data.user_metadata?.notification_prefs ?? null);
  }

  if (req.method === "POST") {
    let updates: Record<string, unknown>;
    try {
      const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return res.status(400).json({ error: "Invalid JSON: expected an object" });
      }
      updates = parsed as Record<string, unknown>;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
    const getRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: adminHdrs });
    const current: any = getRes.ok ? await getRes.json() : {};
    const existingPrefs = current.user_metadata?.notification_prefs ?? {};
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...adminHdrs },
      body: JSON.stringify({
        user_metadata: { ...current.user_metadata, notification_prefs: { ...existingPrefs, ...updates } },
      }),
    });
    if (!r.ok) return res.status(500).json({ error: "Failed to save prefs" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ── /api/push-subscribe (rewritten to /api/user-data?resource=push) ──
async function handlePushSubscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const adminHdrs = { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };
  const getRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: adminHdrs });
  const current: any = getRes.ok ? await getRes.json() : {};
  const meta = current.user_metadata ?? {};

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { endpoint, keys, userAgent } = body;
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...adminHdrs },
      body: JSON.stringify({ user_metadata: { ...meta, push_subscription: { endpoint, keys, userAgent } } }),
    });
    if (!r.ok) return res.status(500).json({ error: "Failed to save subscription" });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { push_subscription: _removed, ...rest } = meta;
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...adminHdrs },
      body: JSON.stringify({ user_metadata: rest }),
    });
    if (!r.ok) return res.status(500).json({ error: "Failed to remove subscription" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ── /api/cron/daily (rewritten to /api/user-data?resource=cron-daily) ──
// Scheduled at 18:00 UTC (20:00 SAST) via vercel.json.
// Sends push notifications + runs Gmail inbox scan for all connected users.
async function handleCronDaily(req: ApiRequest, res: ApiResponse): Promise<void> {
  const auth = (req.headers as any).authorization as string | undefined;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return void res.status(401).json({ error: "Unauthorized" });
  }

  // ── Push notifications ──
  const pushResults = { sent: 0, skipped: 0, errors: 0 };
  const subject = process.env.VAPID_SUBJECT;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;

  if (subject && pub && priv) {
    webpush.setVapidDetails(subject, pub, priv);

    const adminHdrs = { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };
    const users: any[] = [];
    let page = 1;
    while (true) {
      const r = await fetch(`${SB_URL}/auth/v1/admin/users?page=${page}&per_page=50`, { headers: adminHdrs });
      if (!r.ok) break;
      const data = await r.json();
      const batch: any[] = data.users ?? [];
      users.push(...batch);
      if (batch.length < 50) break;
      page++;
    }

    for (const user of users) {
      const meta = user.user_metadata ?? {};
      const prefs = meta.notification_prefs ?? {};
      const sub = meta.push_subscription;
      if (!prefs.daily_enabled || !sub?.endpoint || !sub?.keys) { pushResults.skipped++; continue; }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ title: "Everion", body: "What's worth remembering from today?", url: "/capture" }),
        );
        pushResults.sent++;
      } catch (err: any) {
        console.error(`[cron/daily] push failed for ${user.id}:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          const { push_subscription: _rm, ...rest } = meta;
          await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...adminHdrs },
            body: JSON.stringify({ user_metadata: rest }),
          });
        }
        pushResults.errors++;
      }
    }
  } else {
    console.warn("[cron/daily] VAPID env vars not set — skipping push notifications");
  }

  // ── Gmail inbox scan ──
  const gmailResults = await runGmailScanAllUsers().catch((e) => {
    console.error("[cron/daily] gmail scan failed:", e);
    return { users: 0, created: 0, errors: 1 };
  });

  return void res.status(200).json({ push: pushResults, gmail: gmailResults });
}
