import { sendToUser } from "../_lib/sendPush.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = () => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
});

const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

// Runs hourly — sends Fill Brain nudge to users whose local day+hour matches their configured schedule
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
    `${SB_URL}/rest/v1/notification_prefs?nudge_enabled=eq.true`,
    { headers: hdrs() }
  );
  if (!r.ok) return res.status(502).json({ error: "Failed to fetch prefs" });

  const prefs = await r.json();
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
      localDay  = (parts.find(p => p.type === "weekday")?.value ?? "").toLowerCase();
      localHour = parseInt(parts.find(p => p.type === "hour")?.value ?? localHour, 10);
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
