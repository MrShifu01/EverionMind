import { sendToUser } from "../_lib/sendPush.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = () => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
});

// Runs hourly — sends daily capture prompt to users whose local time matches their configured hour
export default async function handler(req, res) {
  // In production, only allow requests from Vercel cron runner
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    if (!isVercelCron) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  // SEC-16 TODO: Upgrade to HMAC-signed request
  // Current: Bearer token comparison (timing-attack vulnerable)
  // Target: HMAC-SHA256 signature over timestamp + path, with 5-minute replay window
  // See: https://vercel.com/docs/cron-jobs/manage-cron-jobs
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc = new Date();
  const r = await fetch(
    `${SB_URL}/rest/v1/notification_prefs?daily_enabled=eq.true`,
    { headers: hdrs() }
  );
  if (!r.ok) return res.status(502).json({ error: "Failed to fetch prefs" });

  const prefs = await r.json();
  let sent = 0;

  for (const pref of prefs) {
    let localHour = nowUtc.getUTCHours();
    try {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: pref.daily_timezone || "UTC",
        hour: "numeric",
        hour12: false,
      }).formatToParts(nowUtc);
      localHour = parseInt(parts.find(p => p.type === "hour")?.value ?? localHour, 10);
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
