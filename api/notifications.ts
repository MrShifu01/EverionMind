import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const resource = (req.query as any)?.resource;

  // --- notification-prefs ---
  if (resource === "prefs") {
    if (req.method === "GET") {
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
        headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` },
      });
      if (!r.ok) return res.status(500).json({ error: "Failed to fetch prefs" });
      const data: any = await r.json();
      return res.status(200).json(data.user_metadata?.notification_prefs ?? null);
    }

    if (req.method === "POST") {
      const updates = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const getRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
        headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` },
      });
      const current: any = getRes.ok ? await getRes.json() : {};
      const existingPrefs = current.user_metadata?.notification_prefs ?? {};
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` },
        body: JSON.stringify({
          user_metadata: { ...current.user_metadata, notification_prefs: { ...existingPrefs, ...updates } },
        }),
      });
      if (!r.ok) return res.status(500).json({ error: "Failed to save prefs" });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- push-subscribe ---
  if (resource === "push") {
    const getRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
      headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` },
    });
    const current: any = getRes.ok ? await getRes.json() : {};
    const meta = current.user_metadata ?? {};

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { endpoint, keys, userAgent } = body;
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` },
        body: JSON.stringify({ user_metadata: { ...meta, push_subscription: { endpoint, keys, userAgent } } }),
      });
      if (!r.ok) return res.status(500).json({ error: "Failed to save subscription" });
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { push_subscription: _removed, ...rest } = meta;
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` },
        body: JSON.stringify({ user_metadata: rest }),
      });
      if (!r.ok) return res.status(500).json({ error: "Failed to remove subscription" });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(400).json({ error: "Unknown resource" });
}
