/**
 * S6-3: Gap analyst — weekly cron that scans brains for knowledge gaps.
 * Runs every Sunday via vercel.json cron schedule.
 *
 * A "gap" is detected when a brain has fewer than 3 entries for a given tag
 * that appears across many entries, suggesting an underexplored topic.
 */
import type { ApiRequest, ApiResponse } from "../_lib/types";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";
import { sbHeaders, sbHeadersNoContent } from "../_lib/sbHeaders.js";
import { verifyCronHmac } from "../_lib/cronAuth.js";

const MIN_TAG_COUNT = 2; // tag must appear in ≥2 entries to be considered
const GAP_THRESHOLD = 3; // fewer than this many entries per tag = gap

const SB_URL = process.env.SUPABASE_URL;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    if (req.headers["x-vercel-cron"] !== "1") {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  // SEC-16: HMAC auth for non-vercel-cron callers
  const authHeader = (req.headers["authorization"] as string) || "";
  const cronSecret = process.env.CRON_SECRET || "";
  if (authHeader && !verifyCronHmac(authHeader, cronSecret) && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Fetch all brains
  const brainsRes = await fetch(`${SB_URL}/rest/v1/brains?select=id,owner_id,name`, { headers: sbHeadersNoContent() });
  if (!brainsRes.ok) return res.status(502).json({ error: "Failed to fetch brains" });
  const brains: any[] = await brainsRes.json();

  let processed = 0;
  const gaps: Array<{ brain_id: string; brain_name: string; gap_tags: string[] }> = [];

  for (const brain of brains) {
    const entriesRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain.id)}&select=id,title,tags`,
      { headers: sbHeadersNoContent() }
    );
    if (!entriesRes.ok) continue;
    const entries: any[] = await entriesRes.json();
    processed++;

    // Count tag frequency
    const tagCounts = new Map<string, number>();
    for (const entry of entries) {
      for (const tag of entry.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    // Tags that appear frequently but brain has few entries on that topic
    const gapTags = Array.from(tagCounts.entries())
      .filter(([, count]) => count >= MIN_TAG_COUNT && count < GAP_THRESHOLD)
      .map(([tag]) => tag);

    if (gapTags.length > 0) {
      gaps.push({ brain_id: brain.id, brain_name: brain.name, gap_tags: gapTags });
      // Store gap analysis in gap_log table (best-effort)
      fetch(`${SB_URL}/rest/v1/gap_log`, {
        method: "POST",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          brain_id: brain.id,
          gap_tags: gapTags,
          analyzed_at: new Date().toISOString(),
        }),
      }).catch((err: any) => console.error("[gap-analyst:gap_log]", err.message));
    }
  }

  return res.status(200).json({ ok: true, processed, gaps });
}
