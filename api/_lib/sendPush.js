import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = () => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
});

/**
 * Send a push notification payload to all subscriptions for a user.
 * Auto-deletes subscriptions that return HTTP 410 (expired/revoked).
 * @param {string} userId
 * @param {{ title: string, body: string, url?: string, icon?: string }} payload
 */
export async function sendToUser(userId, payload) {
  const r = await fetch(
    `${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
    { headers: hdrs() }
  );
  if (!r.ok) return;
  const subs = await r.json();

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (err) {
      if (err.statusCode === 410) {
        // Subscription expired — remove it
        await fetch(
          `${SB_URL}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(sub.id)}`,
          { method: "DELETE", headers: hdrs() }
        ).catch(err => console.error('[sendPush:cleanup410] Failed to delete expired subscription', err));
      }
    }
  }
}
