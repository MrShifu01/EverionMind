/**
 * Unified cron handler — dispatches by ?job= query param.
 *
 * Jobs:
 *   purge  — permanently delete soft-deleted entries older than 30 days (Sun 03:00 UTC)
 *   gaps   — scan brains for knowledge gaps (Sun 06:00 UTC)
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { verifyCronHmac } from "./_lib/cronAuth.js";

const MIN_TAG_COUNT = 2;
const GAP_THRESHOLD = 3;

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function verifyCron(req: ApiRequest): boolean {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production") return true;
  if (req.headers["x-vercel-cron"] === "1") return true;
  const authHeader = (req.headers["authorization"] as string) || "";
  const cronSecret = process.env.CRON_SECRET || "";
  return verifyCronHmac(authHeader, cronSecret) || authHeader === `Bearer ${cronSecret}`;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (!verifyCron(req)) return res.status(403).json({ error: "Forbidden" });

  const job = req.query.job as string;
  if (job === "purge") return runPurge(res);
  if (job === "gaps") return runGaps(res);
  return res.status(400).json({ error: "Unknown job — use ?job=purge or ?job=gaps" });
}

async function runPurge(res: ApiResponse): Promise<void> {
  if (!SB_URL || !SB_SERVICE_KEY) return res.status(500).json({ error: "Missing Supabase credentials" });

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

async function runGaps(res: ApiResponse): Promise<void> {
  const brainsRes = await fetch(`${SB_URL}/rest/v1/brains?select=id,owner_id,name`, { headers: sbHeadersNoContent() });
  if (!brainsRes.ok) return res.status(502).json({ error: "Failed to fetch brains" });
  const brains: any[] = await brainsRes.json();

  const brainIds = brains.map((b: any) => b.id).join(",");
  const allEntriesRes = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=in.(${brainIds})&select=id,brain_id,tags`,
    { headers: sbHeadersNoContent() },
  );
  if (!allEntriesRes.ok) return res.status(502).json({ error: "Failed to fetch entries" });
  const allEntries: any[] = await allEntriesRes.json();

  const entriesByBrain = new Map<string, any[]>();
  for (const e of allEntries) {
    const list = entriesByBrain.get(e.brain_id) ?? [];
    list.push(e);
    entriesByBrain.set(e.brain_id, list);
  }

  let processed = 0;
  const gaps: Array<{ brain_id: string; brain_name: string; gap_tags: string[] }> = [];

  for (const brain of brains) {
    const entries = entriesByBrain.get(brain.id) ?? [];
    processed++;

    const tagCounts = new Map<string, number>();
    for (const entry of entries) {
      for (const tag of entry.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    const gapTags = Array.from(tagCounts.entries())
      .filter(([, count]) => count >= MIN_TAG_COUNT && count < GAP_THRESHOLD)
      .map(([tag]) => tag);

    if (gapTags.length > 0) {
      gaps.push({ brain_id: brain.id, brain_name: brain.name, gap_tags: gapTags });
      fetch(`${SB_URL}/rest/v1/gap_log`, {
        method: "POST",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({ brain_id: brain.id, gap_tags: gapTags, analyzed_at: new Date().toISOString() }),
      }).catch((err: any) => console.error("[gap-analyst:gap_log]", err.message));
    }
  }

  return res.status(200).json({ ok: true, processed, gaps });
}
