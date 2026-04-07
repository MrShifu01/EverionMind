import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  apikey: SB_KEY!,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});

const ALLOWED_FIELDS = [
  "daily_enabled", "daily_time", "daily_timezone",
  "nudge_enabled", "nudge_day", "nudge_time", "nudge_timezone",
  "expiry_enabled", "expiry_lead_days",
];

// Dispatched via rewrites: /api/notification-prefs, /api/push-subscribe → /api/push?resource=X
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  const resource = req.query.resource as string | undefined;
  if (resource === "subscribe") return handleSubscribe(req, res);
  // Default: notification prefs
  return handleNotificationPrefs(req, res);
}

// ── /api/notification-prefs (rewritten to /api/push?resource=prefs) ──
async function handleNotificationPrefs(req: ApiRequest, res: ApiResponse): Promise<void> {
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // GET — fetch current prefs
  if (req.method === "GET") {
    const r = await fetch(
      `${SB_URL}/rest/v1/notification_prefs?user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    if (!r.ok) return res.status(502).json({ error: "Failed to fetch prefs" });
    const rows: any[] = await r.json();
    return res.status(200).json(rows[0] || null);
  }

  // POST — upsert prefs (partial update)
  if (req.method === "POST") {
    // Validate daily_time format if provided
    if (req.body.daily_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.daily_time)) {
      return res.status(400).json({ error: "daily_time must be in HH:MM format" });
    }

    // Validate daily_timezone is a valid Intl timezone if provided
    if (req.body.daily_timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: req.body.daily_timezone });
      } catch {
        return res.status(400).json({ error: "Invalid timezone" });
      }
    }

    // Validate nudge_time format if provided
    if (req.body.nudge_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.nudge_time)) {
      return res.status(400).json({ error: "nudge_time must be in HH:MM format" });
    }

    // Validate nudge_timezone is a valid Intl timezone if provided
    if (req.body.nudge_timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: req.body.nudge_timezone });
      } catch {
        return res.status(400).json({ error: "Invalid timezone" });
      }
    }

    const updates: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() };
    for (const k of ALLOWED_FIELDS) {
      if (k in req.body) updates[k] = req.body[k];
    }
    const r = await fetch(`${SB_URL}/rest/v1/notification_prefs`, {
      method: "POST",
      headers: hdrs({ Prefer: "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify(updates),
    });
    if (!r.ok) return res.status(502).json({ error: "Failed to save prefs" });
    const [row]: any[] = await r.json();
    return res.status(200).json(row);
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ── /api/push-subscribe (rewritten to /api/push?resource=subscribe) ──
async function handleSubscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // POST — store subscription
  if (req.method === "POST") {
    const { endpoint, keys, userAgent } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "endpoint, keys.p256dh, and keys.auth required" });
    }

    // Validate endpoint is a valid HTTPS URL
    let parsedEndpoint: URL;
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
