import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_HEADERS: Record<string, string> = { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };

function getGreeting(name?: string): string {
  const h = new Date().getHours();
  const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${time}, ${name}.` : `${time}.`;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const brainId = (req.query.brain_id as string) || "";
  if (!brainId) return res.status(400).json({ error: "brain_id required" });

  try {
    // 1. Resurfaced entries: 1-2 random entries from 1-6 months ago
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString();
    const oneMonthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const resurfacedRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&created_at=gte.${sixMonthsAgo}&created_at=lte.${oneMonthAgo}&deleted=is.false&select=id,title,content,type,tags,created_at&order=random&limit=2`,
      { headers: SB_HEADERS },
    );
    const resurfaced = resurfacedRes.ok ? await resurfacedRes.json() : [];

    // 2. Stats: entry count
    const statsRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted=is.false&select=id`,
      { headers: { ...SB_HEADERS, Prefer: "count=exact" } },
    );
    const entryCount = parseInt(statsRes.headers.get("content-range")?.split("/")[1] || "0", 10);

    // 3. Streak data from user metadata
    const userRes = await fetch(
      `${SB_URL}/auth/v1/admin/users/${user.id}`,
      { headers: SB_HEADERS },
    );
    const userData = userRes.ok ? await userRes.json() : {};
    const meta = userData.user_metadata || {};
    const streak = {
      current: meta.current_streak || 0,
      longest: meta.longest_streak || 0,
    };

    // 4. Latest gap-analyst insight (if any)
    const insightRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&type=eq.insight&deleted=is.false&select=content&order=created_at.desc&limit=1`,
      { headers: SB_HEADERS },
    );
    const insights = insightRes.ok ? await insightRes.json() : [];
    const insight = insights[0]?.content || null;

    // 5. Action suggestion: entries with few tags
    const sparseRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted=is.false&tags=eq.{}&select=id&limit=5`,
      { headers: SB_HEADERS },
    );
    const sparseEntries = sparseRes.ok ? await sparseRes.json() : [];
    const action = sparseEntries.length > 0
      ? `${sparseEntries.length} entries are missing tags. Review them to help your brain make connections.`
      : null;

    const name = meta.full_name || meta.name || user.email?.split("@")[0] || "";

    return res.status(200).json({
      greeting: getGreeting(name),
      resurfaced,
      insight,
      action,
      streak,
      stats: { entries: entryCount, connections: 0, insights: insights.length > 0 ? 1 : 0 },
    });
  } catch (err: any) {
    console.error("[feed]", err);
    return res.status(500).json({ error: "Failed to load feed" });
  }
}
