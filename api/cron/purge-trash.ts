/**
 * Weekly cron: permanently delete soft-deleted entries older than 30 days.
 * Runs every Sunday at 03:00 UTC via vercel.json cron schedule.
 */
import type { ApiRequest, ApiResponse } from "../_lib/types";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";
import { verifyCronHmac } from "../_lib/cronAuth.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    if (req.headers["x-vercel-cron"] !== "1") {
      const authHeader = (req.headers["authorization"] as string) || "";
      const cronSecret = process.env.CRON_SECRET || "";
      if (!verifyCronHmac(authHeader, cronSecret) && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
  }

  if (!SB_URL || !SB_SERVICE_KEY) {
    return res.status(500).json({ error: "Missing Supabase credentials" });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const response = await fetch(
    `${SB_URL}/rest/v1/entries?deleted_at=not.is.null&deleted_at=lt.${cutoff}`,
    {
      method: "DELETE",
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal,count=exact",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("[purge-trash] Supabase delete failed:", response.status, body);
    return res.status(500).json({ error: "Purge failed", detail: body });
  }

  const count = response.headers.get("content-range")?.split("/")?.[1] ?? "unknown";
  console.log(`[purge-trash] Purged ${count} entries deleted before ${cutoff}`);
  return res.status(200).json({ purged: count, cutoff });
}
