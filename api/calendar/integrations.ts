import type { ApiRequest, ApiResponse } from "../_lib/types";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";
import { verifyAuth } from "../_lib/verifyAuth.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const r = await fetch(
      `${SB_URL}/rest/v1/calendar_integrations?user_id=eq.${user.id}&select=id,provider,calendar_email,sync_enabled`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
    );
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch integrations" });
    return res.status(200).json(await r.json());
  }

  if (req.method === "DELETE") {
    const { provider } = req.body ?? {};
    if (!provider || !["google", "microsoft"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }
    await fetch(
      `${SB_URL}/rest/v1/calendar_integrations?user_id=eq.${user.id}&provider=eq.${provider}`,
      { method: "DELETE", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
