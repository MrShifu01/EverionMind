import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import crypto from "crypto";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({ "Content-Type": "application/json", "apikey": SB_KEY!, "Authorization": `Bearer ${SB_KEY}`, ...extra });

const MAX_CHARS = 8000;

// Dispatched via rewrites:
//   /api/memory, /api/activity, /api/health, /api/vault → /api/user-data?resource=X
//   /api/pin → /api/user-data?resource=pin
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  const resource = req.query.resource as string | undefined;
  if (resource === "activity") return handleActivity(req, res);
  if (resource === "health") return handleHealth(req, res);
  if (resource === "vault") return handleVault(req, res);
  if (resource === "pin") return handlePin(req, res);
  if (resource === "account") return handleDeleteAccount(req, res);
  // Default: memory
  return handleMemory(req, res);
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
        `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(GEMINI_API_KEY)}&pageSize=200`
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
            `https://generativelanguage.googleapis.com/v1/models/${candidate}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
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
