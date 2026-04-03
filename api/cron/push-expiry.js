import { sendToUser } from "../_lib/sendPush.js";

const SB_URL  = process.env.SUPABASE_URL;
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANT_KEY = process.env.ANTHROPIC_API_KEY;
const hdrs = () => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
});

const EXPIRY_KEYWORDS = ["expir", "valid until", "renew", "passport", "licence", "insurance", "policy"];

// Runs daily at 09:00 UTC — checks for upcoming document expiry dates
export default async function handler(req, res) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const r = await fetch(
    `${SB_URL}/rest/v1/notification_prefs?expiry_enabled=eq.true`,
    { headers: hdrs() }
  );
  if (!r.ok) return res.status(502).json({ error: "Failed to fetch prefs" });

  const prefs = await r.json();
  const todayStr = new Date().toISOString().split("T")[0];
  let sent = 0;

  for (const pref of prefs) {
    const leadDays = pref.expiry_lead_days || [90, 30, 7, 1];

    // 1. Fetch user's entries
    const entriesRes = await fetch(
      `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(pref.user_id)}&select=id,title,content,tags`,
      { headers: hdrs() }
    );
    if (!entriesRes.ok) continue;
    const allEntries = await entriesRes.json();

    // 2. Filter by expiry-related keywords
    const relevant = allEntries.filter(e => {
      const text = `${e.title} ${e.content} ${(e.tags || []).join(" ")}`.toLowerCase();
      return EXPIRY_KEYWORDS.some(k => text.includes(k));
    });
    if (!relevant.length) continue;

    // 3. Ask Claude to extract expiry dates (batch up to 20 entries)
    const batch = relevant.slice(0, 20);
    const entryText = batch.map(e => `ID:${e.id}\n${e.title}\n${e.content}`).join("\n---\n");

    let extracted = [];
    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANT_KEY,
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
        const aiData = await aiRes.json();
        const raw = (aiData.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) extracted = parsed;
      }
    } catch {}

    // 4. For each extracted date, check lead days and dedup via log
    for (const { entry_id, item, date } of extracted) {
      if (!entry_id || !item || !date) continue;

      const expiryDate = new Date(date);
      if (isNaN(expiryDate.getTime())) continue;

      const today = new Date(todayStr);

      for (const lead of leadDays) {
        const triggerDate = new Date(expiryDate);
        triggerDate.setDate(triggerDate.getDate() - lead);
        const triggerStr = triggerDate.toISOString().split("T")[0];
        if (triggerStr !== todayStr) continue;

        // 5. Check dedup log
        const logRes = await fetch(
          `${SB_URL}/rest/v1/expiry_notification_log?user_id=eq.${encodeURIComponent(pref.user_id)}&entry_id=eq.${encodeURIComponent(entry_id)}&item_label=eq.${encodeURIComponent(item)}&lead_days=eq.${lead}`,
          { headers: hdrs() }
        );
        const logRows = logRes.ok ? await logRes.json() : [];
        if (logRows.length > 0) continue; // already sent

        // 6. Send notification
        await sendToUser(pref.user_id, {
          title: "OpenBrain — Expiry Reminder",
          body: `Your ${item} expires in ${lead} day${lead !== 1 ? "s" : ""}.`,
          url: "/",
          icon: "/icons/icon-192.png",
        });

        // 7. Log to dedup table
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
        }).catch(() => {});

        sent++;
      }
    }
  }

  return res.status(200).json({ ok: true, sent });
}
