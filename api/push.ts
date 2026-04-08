import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { sendToUser } from "./_lib/sendPush.js";
import crypto from "crypto";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANT_KEY = process.env.ANTHROPIC_API_KEY;

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

const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const EXPIRY_KEYWORDS = ["expir", "valid until", "renew", "passport", "licence", "insurance", "policy"];

export function verifyCronHmac(header: string, secret: string): boolean {
  const date = new Date().toISOString().slice(0, 10);
  const expected = crypto.createHmac("sha256", secret).update(date).digest("hex");
  return header === `HMAC ${expected}`;
}

// Main handler: routes to user APIs or cron handlers
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  const action = req.query.action as string | undefined;
  const resource = req.query.resource as string | undefined;

  // Cron job handlers (daily, nudge, expiry)
  if (action === "daily") return handleDaily(req, res);
  if (action === "nudge") return handleNudge(req, res);
  if (action === "expiry") return handleExpiry(req, res);
  if (action === "test") return handleTest(req, res);

  // User API handlers (notification prefs and push subscribe)
  if (resource === "subscribe") return handleSubscribe(req, res);
  return handleNotificationPrefs(req, res);
}

// ── Verify cron requests ──
function verifyCron(req: ApiRequest): boolean {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    if (!isVercelCron) return false;
  }

  const authHeader = (req.headers["authorization"] as string) || "";
  const cronSecret = process.env.CRON_SECRET || "";
  const isHmac = verifyCronHmac(authHeader, cronSecret);
  const isBearer = authHeader === `Bearer ${cronSecret}`;
  return isHmac || isBearer;
}

// ── /api/notification-prefs ──
async function handleNotificationPrefs(req: ApiRequest, res: ApiResponse): Promise<void> {
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const r = await fetch(
      `${SB_URL}/rest/v1/notification_prefs?user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    if (!r.ok) return res.status(502).json({ error: "Failed to fetch prefs" });
    const rows: any[] = await r.json();
    return res.status(200).json(rows[0] || null);
  }

  if (req.method === "POST") {
    if (req.body.daily_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.daily_time)) {
      return res.status(400).json({ error: "daily_time must be in HH:MM format" });
    }
    if (req.body.daily_timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: req.body.daily_timezone });
      } catch {
        return res.status(400).json({ error: "Invalid timezone" });
      }
    }
    if (req.body.nudge_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.nudge_time)) {
      return res.status(400).json({ error: "nudge_time must be in HH:MM format" });
    }
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

// ── /api/push-subscribe ──
async function handleSubscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "POST") {
    const { endpoint, keys, userAgent } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "endpoint, keys.p256dh, and keys.auth required" });
    }

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

// ── Cron: Daily capture prompt ──
async function handleDaily(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!verifyCron(req)) return res.status(401).json({ error: "Unauthorized" });

  const nowUtc = new Date();
  const r = await fetch(
    `${SB_URL}/rest/v1/notification_prefs?daily_enabled=eq.true`,
    { headers: hdrs() }
  );
  if (!r.ok) return res.status(502).json({ error: "Failed to fetch prefs" });

  const prefs: any[] = await r.json();
  let sent = 0;

  for (const pref of prefs) {
    let localHour = nowUtc.getUTCHours();
    try {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: pref.daily_timezone || "UTC",
        hour: "numeric",
        hour12: false,
      }).formatToParts(nowUtc);
      localHour = parseInt(parts.find((p: Intl.DateTimeFormatPart) => p.type === "hour")?.value ?? String(localHour), 10);
    } catch {}

    const prefHour = parseInt((pref.daily_time || "20:00").split(":")[0], 10);
    if (localHour !== prefHour) continue;

    await sendToUser(pref.user_id, {
      title: "OpenBrain",
      body: "What's worth remembering today? Capture it in OpenBrain.",
      url: "/",
      icon: "/icons/icon-192.png",
    });
    sent++;
  }

  return res.status(200).json({ ok: true, sent });
}

// ── Cron: Fill Brain nudge ──
async function handleNudge(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!verifyCron(req)) return res.status(401).json({ error: "Unauthorized" });

  const nowUtc = new Date();
  const r = await fetch(
    `${SB_URL}/rest/v1/notification_prefs?nudge_enabled=eq.true`,
    { headers: hdrs() }
  );
  if (!r.ok) return res.status(502).json({ error: "Failed to fetch prefs" });

  const prefs: any[] = await r.json();
  let sent = 0;

  for (const pref of prefs) {
    let localHour = nowUtc.getUTCHours();
    let localDay  = DAYS[nowUtc.getUTCDay()];
    try {
      const fmt = new Intl.DateTimeFormat("en", {
        timeZone: pref.nudge_timezone || "UTC",
        weekday: "long",
        hour:    "numeric",
        hour12:  false,
      });
      const parts = fmt.formatToParts(nowUtc);
      localDay  = (parts.find((p: Intl.DateTimeFormatPart) => p.type === "weekday")?.value ?? "").toLowerCase();
      localHour = parseInt(parts.find((p: Intl.DateTimeFormatPart) => p.type === "hour")?.value ?? String(localHour), 10);
    } catch {}

    const prefDay  = (pref.nudge_day  || "sunday").toLowerCase();
    const prefHour = parseInt((pref.nudge_time || "10:00").split(":")[0], 10);
    if (localDay !== prefDay || localHour !== prefHour) continue;

    await sendToUser(pref.user_id, {
      title: "OpenBrain — Fill Brain",
      body: "You have questions waiting. Take a minute to fill your brain.",
      url: "/",
      icon: "/icons/icon-192.png",
    });
    sent++;
  }

  return res.status(200).json({ ok: true, sent });
}

// ── Cron: Expiry reminders ──
async function handleExpiry(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!verifyCron(req)) return res.status(401).json({ error: "Unauthorized" });

  const r = await fetch(
    `${SB_URL}/rest/v1/notification_prefs?expiry_enabled=eq.true`,
    { headers: hdrs() }
  );
  if (!r.ok) return res.status(502).json({ error: "Failed to fetch prefs" });

  const prefs: any[] = await r.json();
  const todayStr = new Date().toISOString().split("T")[0];
  let sent = 0;

  for (const pref of prefs) {
    const leadDays: number[] = pref.expiry_lead_days || [90, 30, 7, 1];

    const entriesRes = await fetch(
      `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(pref.user_id)}&select=id,title,content,tags`,
      { headers: hdrs() }
    );
    if (!entriesRes.ok) continue;
    const allEntries: any[] = await entriesRes.json();

    const relevant = allEntries.filter((e: any) => {
      const text = `${e.title} ${e.content} ${(e.tags || []).join(" ")}`.toLowerCase();
      return EXPIRY_KEYWORDS.some(k => text.includes(k));
    });
    if (!relevant.length) continue;

    const batch = relevant.slice(0, 20);
    const entryText = batch.map((e: any) => `ID:${e.id}\n${e.title}\n${e.content}`).join("\n---\n");

    let extracted: any[] = [];
    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANT_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 800,
          system: `Extract expiry dates from these entries. Return ONLY a JSON array: [{"entry_id":"...","item":"passport","date":"YYYY-MM-DD"},...]. If no dates, return [].`,
          messages: [{ role: "user", content: entryText }],
        }),
      });
      if (aiRes.ok) {
        const aiData: any = await aiRes.json();
        const raw = (aiData.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) extracted = parsed;
      }
    } catch (e: any) {
      console.error("[push-expiry:ai-extract]", e.message);
    }

    for (const { entry_id, item, date } of extracted) {
      if (!entry_id || !item || !date) continue;

      const expiryDate = new Date(date);
      if (isNaN(expiryDate.getTime())) continue;

      for (const lead of leadDays) {
        const triggerDate = new Date(expiryDate);
        triggerDate.setDate(triggerDate.getDate() - lead);
        const triggerStr = triggerDate.toISOString().split("T")[0];
        if (triggerStr !== todayStr) continue;

        const logRes = await fetch(
          `${SB_URL}/rest/v1/expiry_notification_log?user_id=eq.${encodeURIComponent(pref.user_id)}&entry_id=eq.${encodeURIComponent(entry_id)}&item_label=eq.${encodeURIComponent(item)}&lead_days=eq.${lead}`,
          { headers: hdrs() }
        );
        const logRows: any[] = logRes.ok ? await logRes.json() : [];
        if (logRows.length > 0) continue;

        await sendToUser(pref.user_id, {
          title: "OpenBrain — Expiry Reminder",
          body: `Your ${item} expires in ${lead} day${lead !== 1 ? "s" : ""}.`,
          url: "/",
          icon: "/icons/icon-192.png",
        });

        await fetch(`${SB_URL}/rest/v1/expiry_notification_log`, {
          method: "POST",
          headers: hdrs(),
          body: JSON.stringify({
            user_id: pref.user_id,
            entry_id,
            item_label: item,
            expiry_date: date,
            lead_days: lead,
          }),
        }).catch((err: any) => console.error('[push-expiry:dedup-log] Failed to log expiry notification', err));

        sent++;
      }
    }
  }

  return res.status(200).json({ ok: true, sent });
}

// ── User API: Test push ──
async function handleTest(req: ApiRequest, res: ApiResponse): Promise<void> {
  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  await sendToUser(user.id, {
    title: "OpenBrain",
    body: "Test notification — your push notifications are working!",
    url: "/",
    icon: "/icons/icon-192.png",
  });

  return res.status(200).json({ sent: true });
}
