import type { IncomingMessage } from "http";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { withAuth } from "./_lib/withAuth.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { stripe } from "./_lib/stripe.js";
import { sbHeaders } from "./_lib/sbHeaders.js";
import type Stripe from "stripe";
import crypto from "crypto";
import webpush from "web-push";
import { runGmailScanAllUsers } from "./_lib/gmailScan.js";
import { enrichAllBrains } from "./_lib/enrich.js";
import { verifyCronBearer } from "./_lib/cronAuth.js";
import { runPersonaDecayPass, runPersonaWeeklyPass } from "./_lib/personaHygiene.js";

export const config = { api: { bodyParser: false } };

function bufferBody(req: ApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = req as unknown as IncomingMessage;
    stream.on("data", (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

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
//   /api/notifications      → /api/user-data?resource=notifications
//   /api/stripe-checkout    → /api/user-data?resource=stripe-checkout
//   /api/stripe-webhook     → /api/user-data?resource=stripe-webhook
//   /api/stripe-portal      → /api/user-data?resource=stripe-portal
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  const rawBody = await bufferBody(req);
  const resource = req.query.resource as string | undefined;

  // Stripe webhook uses raw body for signature verification
  if (resource === "stripe-webhook") return handleStripeWebhook(req, res, rawBody);

  // Parse body for all other handlers
  try {
    req.body = rawBody.length > 0 ? JSON.parse(rawBody.toString("utf-8")) : {};
  } catch {
    req.body = {};
  }

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
  if (resource === "notifications") return handleNotifications(req, res);
  if (resource === "stripe-checkout") return handleStripeCheckout(req, res);
  if (resource === "stripe-portal")   return handleStripePortal(req, res);
  if (resource === "profile") return handleProfile(req, res);
  // Default: memory
  return handleMemory(req, res);
}

// ── /api/profile (rewritten to /api/user-data?resource=profile) ──
// One row per user in public.user_personas; injected into chat system prompts.
// NEVER store sensitive identifiers here — those live in the encrypted Vault.
const handleProfile = withAuth(
  { methods: ["GET", "PUT"], rateLimit: 30 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      const r = await fetch(
        `${SB_URL}/rest/v1/user_personas?user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
        { headers: hdrs() },
      );
      if (!r.ok) return void res.status(502).json({ error: "Failed to fetch profile" });
      const rows: any[] = await r.json();
      return void res.status(200).json({ profile: rows[0] ?? null });
    }

    // PUT — upsert. Server enforces field whitelist + length caps so the
    // preamble can never blow past its token budget.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const trimStr = (v: unknown, max: number): string | null => {
      if (typeof v !== "string") return null;
      const s = v.trim();
      return s ? s.slice(0, max) : null;
    };
    const trimArr = (v: unknown, maxItems: number, transform: (item: any) => any): any[] => {
      if (!Array.isArray(v)) return [];
      return v.slice(0, maxItems).map(transform).filter(Boolean);
    };

    const upsert = {
      user_id: user.id,
      full_name: trimStr(body.full_name, 120),
      preferred_name: trimStr(body.preferred_name, 60),
      pronouns: trimStr(body.pronouns, 40),
      family: trimArr(body.family, 10, (f: any) => {
        const relation = trimStr(f?.relation, 40);
        const name = trimStr(f?.name, 80);
        const notes = trimStr(f?.notes, 120);
        if (!relation && !name) return null;
        return { relation, name, notes };
      }),
      habits: trimArr(body.habits, 12, (h: any) => trimStr(h, 120)),
      context: trimStr(body.context, 4000),
      enabled: body.enabled !== false,
      updated_at: new Date().toISOString(),
    };

    const r = await fetch(`${SB_URL}/rest/v1/user_personas?on_conflict=user_id`, {
      method: "POST",
      headers: hdrs({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify(upsert),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return void res.status(500).json({ error: "save_failed", detail: text.slice(0, 200) });
    }
    const saved = await r.json();
    return void res.status(200).json({ profile: Array.isArray(saved) ? saved[0] : saved });
  },
);

// ── /api/brains (rewritten to /api/user-data?resource=brains) ──
const handleBrains = withAuth(
  { methods: ["GET"], rateLimit: 60 },
  async ({ res, user }) => {
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
  },
);

// ── /api/memory (rewritten to /api/user-data?resource=memory) ──
const handleMemory = withAuth(
  { methods: ["GET", "POST", "PATCH"], rateLimit: 30 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      const r = await fetch(`${SB_URL}/rest/v1/user_memory?user_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
      const data: any[] = await r.json();
      return void res.status(200).json(data[0] || { content: "", updated_at: null });
    }

    const { content } = req.body;
    if (typeof content !== "string") return void res.status(400).json({ error: "content must be a string" });
    const trimmed = content.slice(0, MAX_CHARS);
    const r = await fetch(`${SB_URL}/rest/v1/user_memory`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify({ user_id: user.id, content: trimmed, updated_at: new Date().toISOString() }),
    });
    const data: any[] = await r.json();
    return void res.status(r.ok ? 200 : 502).json(r.ok ? (data[0] || {}) : { error: "Failed to save memory" });
  },
);

// ── /api/activity (rewritten to /api/user-data?resource=activity) ──
const handleActivity = withAuth(
  { methods: ["GET", "POST"], rateLimit: 60 },
  async ({ req, res, user }) => {
    // GET /api/activity?brain_id=... — fetch activity log (owner only)
    if (req.method === "GET") {
      const { brain_id, limit = "50" } = req.query;
      if (!brain_id) return void res.status(400).json({ error: "brain_id required" });

      // Verify caller owns this brain
      const ownerRes = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id as string)}&owner_id=eq.${encodeURIComponent(user.id)}`,
        { headers: hdrs() }
      );
      const ownerData: any[] = await ownerRes.json();
      if (!ownerData.length) return void res.status(403).json({ error: "Only the brain owner can view activity" });

      const r = await fetch(
        `${SB_URL}/rest/v1/brain_activity?brain_id=eq.${encodeURIComponent(brain_id as string)}&order=created_at.desc&limit=${Math.min(parseInt(limit as string) || 50, 500)}`,
        { headers: hdrs() }
      );
      return void res.status(r.status).json(await r.json());
    }

    // POST /api/activity — log an activity event
    const { brain_id, action, entry_id, details } = req.body;
    if (!brain_id || !action) return void res.status(400).json({ error: "brain_id and action required" });

    const validActions = ["created", "updated", "deleted", "connected"];
    if (!validActions.includes(action)) return void res.status(400).json({ error: "Invalid action" });

    // Verify caller owns this brain before writing activity
    const ownerRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() },
    );
    const ownerData: any[] = await ownerRes.json();
    if (!ownerData.length) return void res.status(403).json({ error: "Forbidden" });

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
    return void res.status(r.ok ? 201 : 502).json({ ok: r.ok });
  },
);

// ── /api/health (rewritten to /api/user-data?resource=health) ──
const handleHealth = withAuth(
  { methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], rateLimit: false },
  async ({ res }) => {
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
  },
);

// ── /api/vault (rewritten to /api/user-data?resource=vault) ──
const handleVault = withAuth(
  { methods: ["GET", "POST"], rateLimit: 20 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      const r = await fetch(
        `${SB_URL}/rest/v1/vault_keys?user_id=eq.${encodeURIComponent(user.id)}&select=salt,verify_token,recovery_blob`,
        { headers: hdrs() }
      );
      if (!r.ok) return void res.status(502).json({ error: "Database error" });
      const rows: any[] = await r.json();
      if (rows.length === 0) return void res.status(200).json({ exists: false });
      return void res.status(200).json({
        exists: true,
        salt: rows[0].salt,
        verify_token: rows[0].verify_token,
        recovery_blob: rows[0].recovery_blob,
      });
    }

    // POST
    const { salt, verify_token, recovery_blob } = req.body || {};
    if (!salt || typeof salt !== "string" || salt.length !== 32) {
      return void res.status(400).json({ error: "Invalid salt (must be 32-char hex)" });
    }
    if (!verify_token || typeof verify_token !== "string") {
      return void res.status(400).json({ error: "Missing verify_token" });
    }
    if (!recovery_blob || typeof recovery_blob !== "string") {
      return void res.status(400).json({ error: "Missing recovery_blob" });
    }

    // Prevent overwrite — vault can only be set up once
    const existing = await fetch(
      `${SB_URL}/rest/v1/vault_keys?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
      { headers: hdrs() }
    );
    const rows: any[] = await existing.json();
    if (rows.length > 0) {
      return void res.status(409).json({ error: "Vault already set up" });
    }

    const r = await fetch(`${SB_URL}/rest/v1/vault_keys`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=minimal" }),
      body: JSON.stringify({ user_id: user.id, salt, verify_token, recovery_blob }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => String(r.status));
      return void res.status(502).json({ error: `Database error: ${err}` });
    }
    return void res.status(201).json({ ok: true });
  },
);

// ── /api/pin (rewritten to /api/user-data?resource=pin) ──
const handlePin = withAuth(
  { methods: ["POST", "DELETE"], rateLimit: 10 },
  async ({ req, res, user }) => {
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
  },
);

// ── /api/user-data?resource=account — delete authenticated user's account ──
const handleDeleteAccount = withAuth(
  { methods: ["DELETE"], rateLimit: 5 },
  async ({ res, user }) => {
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
  },
);

// ── /api/user-data?resource=api_keys — Claude Code / MCP API key management ──
const handleApiKeys = withAuth(
  { methods: ["GET", "POST", "DELETE"], rateLimit: 20 },
  async ({ req, res, user }) => {
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
  },
);

// ── /api/notification-prefs (rewritten to /api/user-data?resource=prefs) ──
const handleNotificationPrefs = withAuth(
  { methods: ["GET", "POST"], rateLimit: false },
  async ({ req, res, user }) => {
    const adminHdrs = { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };

    if (req.method === "GET") {
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: adminHdrs });
      if (!r.ok) return void res.status(500).json({ error: "Failed to fetch prefs" });
      const data: any = await r.json();
      return void res.status(200).json(data.user_metadata?.notification_prefs ?? null);
    }

    // POST
    const updates = req.body as Record<string, unknown>;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return void res.status(400).json({ error: "Invalid JSON: expected an object" });
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
    if (!r.ok) return void res.status(500).json({ error: "Failed to save prefs" });
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/push-subscribe (rewritten to /api/user-data?resource=push) ──
const handlePushSubscribe = withAuth(
  { methods: ["POST", "DELETE"], rateLimit: false },
  async ({ req, res, user }) => {
    const adminHdrs = { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };
    const getRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: adminHdrs });
    const current: any = getRes.ok ? await getRes.json() : {};
    const meta = current.user_metadata ?? {};

    if (req.method === "POST") {
      const { endpoint, keys, userAgent } = req.body as { endpoint?: string; keys?: unknown; userAgent?: string };
      if (!endpoint) return void res.status(400).json({ error: "endpoint required" });
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...adminHdrs },
        body: JSON.stringify({ user_metadata: { ...meta, push_subscription: { endpoint, keys, userAgent } } }),
      });
      if (!r.ok) return void res.status(500).json({ error: "Failed to save subscription" });
      return void res.status(200).json({ ok: true });
    }

    // DELETE
    const { push_subscription: _removed, ...rest } = meta;
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...adminHdrs },
      body: JSON.stringify({ user_metadata: rest }),
    });
    if (!r.ok) return void res.status(500).json({ error: "Failed to remove subscription" });
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/cron/daily (rewritten to /api/user-data?resource=cron-daily) ──
// Scheduled at 18:00 UTC (20:00 SAST) via vercel.json.
// Sends push notifications + runs Gmail inbox scan for all connected users.
async function handleCronDaily(req: ApiRequest, res: ApiResponse): Promise<void> {
  const auth = (req.headers as any).authorization as string | undefined;
  if (!process.env.CRON_SECRET || !verifyCronBearer(auth, process.env.CRON_SECRET)) {
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

  // ── Enrich every brain — daily catch-up pass for entries inline didn't cover ──
  const enrichResults = await enrichAllBrains().catch((e) => {
    console.error("[cron/daily] enrich batch failed:", e);
    return { brains: 0, processed: 0 };
  });

  // ── Persona hygiene ──
  // Decay every day; dedup + digest only on Sundays so users get one summary
  // per week instead of seven. UTC day-of-week to match the cron schedule.
  const personaDecay = await runPersonaDecayPass().catch((e) => {
    console.error("[cron/daily] persona decay failed:", e);
    return { scanned: 0, decayed: 0, faded: 0, archived: 0 };
  });
  let personaWeekly: { dedups_proposed: number; digests_written: number } | null = null;
  if (new Date().getUTCDay() === 0) {
    personaWeekly = await runPersonaWeeklyPass().catch((e) => {
      console.error("[cron/daily] persona weekly failed:", e);
      return { dedups_proposed: 0, digests_written: 0 };
    });
  }

  return void res.status(200).json({
    push: pushResults,
    gmail: gmailResults,
    enrich: enrichResults,
    persona_decay: personaDecay,
    persona_weekly: personaWeekly,
  });
}

// ── /api/notifications (rewritten to /api/user-data?resource=notifications) ──
const handleNotifications = withAuth(
  { methods: ["GET", "PATCH", "DELETE"], rateLimit: 60 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      const dismissed = req.query.dismissed === "true" ? "eq.true" : "eq.false";
      const r = await fetch(
        `${SB_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(user.id)}&dismissed=${dismissed}&order=created_at.desc&limit=50`,
        { headers: hdrs() },
      );
      if (!r.ok) return void res.status(502).json({ error: "Failed to fetch notifications" });
      return void res.status(200).json(await r.json());
    }

    if (req.method === "PATCH") {
      const { id, read, dismissed } = req.body as { id: string; read?: boolean; dismissed?: boolean };
      if (!id) return void res.status(400).json({ error: "Missing id" });
      const patch: Record<string, unknown> = {};
      if (read !== undefined) patch.read = read;
      if (dismissed !== undefined) patch.dismissed = dismissed;
      if (!Object.keys(patch).length) return void res.status(400).json({ error: "Nothing to update" });
      const r = await fetch(
        `${SB_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
        { method: "PATCH", headers: hdrs({ Prefer: "return=minimal" }), body: JSON.stringify(patch) },
      );
      if (!r.ok) return void res.status(502).json({ error: "Failed to update notification" });
      return void res.status(200).json({ ok: true });
    }

    // DELETE — dismiss all, or just a specific type if ?type= is provided
    const typeFilter = typeof req.query.type === "string"
      ? `&type=eq.${encodeURIComponent(req.query.type)}`
      : "";
    await fetch(
      `${SB_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(user.id)}&dismissed=eq.false${typeFilter}`,
      { method: "PATCH", headers: hdrs({ Prefer: "return=minimal" }), body: JSON.stringify({ dismissed: true }) },
    );
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/user-data?resource=stripe-checkout ──
const handleStripeCheckout = withAuth(
  { methods: ["POST"], rateLimit: 10 },
  async ({ req, res, user }) => {
    const { plan, interval = "month" } = (req.body ?? {}) as {
      plan?: string;
      interval?: string;
    };

    if (plan !== "starter" && plan !== "pro") {
      return void res.status(400).json({ error: "Invalid plan" });
    }
    if (interval !== "month" && interval !== "year") {
      return void res.status(400).json({ error: "Invalid interval" });
    }

    const priceEnvKey =
      interval === "year"
        ? plan === "starter"
          ? "STRIPE_STARTER_ANNUAL_PRICE_ID"
          : "STRIPE_PRO_ANNUAL_PRICE_ID"
        : plan === "starter"
          ? "STRIPE_STARTER_PRICE_ID"
          : "STRIPE_PRO_PRICE_ID";

    const priceId = process.env[priceEnvKey];
    if (!priceId) return void res.status(500).json({ error: "Plan not configured" });

    // Get or create Stripe Customer
    const profileRes = await fetch(
      `${SB_URL}/rest/v1/user_personas?id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`,
      { headers: sbHeaders() },
    );
    if (!profileRes.ok) {
      return void res.status(502).json({ error: "Payment provider unavailable" });
    }
    const [profile] = await profileRes.json();
    let customerId: string = profile?.stripe_customer_id ?? "";

    if (!customerId) {
      try {
        const customer = await stripe.customers.create({
          email: user.email as string | undefined,
          metadata: { user_id: user.id },
        });
        customerId = customer.id;
      } catch (err) {
        console.error("[stripe-checkout] Failed to create customer:", err);
        return void res.status(502).json({ error: "Payment provider unavailable" });
      }
      const patchRes = await fetch(
        `${SB_URL}/rest/v1/user_personas?id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: sbHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify({ stripe_customer_id: customerId }),
        },
      );
      if (!patchRes.ok) {
        console.error("[stripe-checkout] Failed to save stripe_customer_id:", await patchRes.text());
        // Still proceed — Stripe session is valid
      }
    }

    const host = (req.headers["host"] as string) || "everion.app";
    const appUrl = `https://${host}`;

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${appUrl}/settings?tab=billing&billing=success`,
        cancel_url: `${appUrl}/settings?tab=billing&billing=cancel`,
        metadata: { user_id: user.id },
      });
    } catch (err) {
      console.error("[stripe-checkout] Failed to create session:", err);
      return void res.status(502).json({ error: "Payment provider unavailable" });
    }

    res.status(200).json({ url: session.url });
  },
);

// ── /api/user-data?resource=stripe-webhook ──
async function handleStripeWebhook(
  req: ApiRequest,
  res: ApiResponse,
  rawBody: Buffer,
): Promise<void> {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return void res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return void res.status(400).json({ error: "Invalid signature" });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    const priceId = sub.items.data[0]?.price.id ?? "";

    const tier =
      priceId === process.env.STRIPE_PRO_PRICE_ID ||
      priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID
        ? "pro"
        : "starter";

    await fetch(
      `${SB_URL}/rest/v1/user_personas?stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          tier,
          stripe_subscription_id: sub.id,
          tier_expires_at: null,
        }),
      },
    );
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    const periodEndTs = sub.items.data[0]?.current_period_end ?? 0;
    const periodEnd = periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null;

    await fetch(
      `${SB_URL}/rest/v1/user_personas?stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          tier: "free",
          stripe_subscription_id: null,
          tier_expires_at: periodEnd,
        }),
      },
    );
  }

  res.status(200).json({ received: true });
}

// ── /api/user-data?resource=stripe-portal ──
const handleStripePortal = withAuth(
  { methods: ["POST"], rateLimit: 10 },
  async ({ req, res, user }) => {
    const profileRes = await fetch(
      `${SB_URL}/rest/v1/user_personas?id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`,
      { headers: sbHeaders() },
    );
    if (!profileRes.ok) {
      return void res.status(502).json({ error: "Payment provider unavailable" });
    }
    const [profile] = await profileRes.json();

    if (!profile?.stripe_customer_id) {
      return void res.status(400).json({ error: "No active subscription found" });
    }

    const host = (req.headers["host"] as string) || "everion.app";

    let portalSession: Stripe.BillingPortal.Session;
    try {
      portalSession = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `https://${host}/settings?tab=billing`,
      });
    } catch (err) {
      console.error("[stripe-portal] Failed to create portal session:", err);
      return void res.status(502).json({ error: "Payment provider unavailable" });
    }

    res.status(200).json({ url: portalSession.url });
  },
);
