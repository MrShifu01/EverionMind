/**
 * GET /api/memory/upcoming?brain_id=<uuid>&days=30
 *
 * Returns entries with upcoming dates (due_date, deadline, expiry_date, event_date)
 * within the next N days. Sorted by earliest date ascending.
 *
 * Auth: Authorization: Bearer <em_key>  OR  Authorization: Bearer <supabase_jwt>
 * Response: { entries: [...], days: number, from: string, to: string }
 */
import { createHash } from "crypto";
import type { ApiRequest, ApiResponse } from "../_lib/types";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";
import { rateLimit } from "../_lib/rateLimit.js";
import { verifyAuth } from "../_lib/verifyAuth.js";
import { checkBrainAccess } from "../_lib/checkBrainAccess.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS: Record<string, string> = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

const DATE_FIELDS = ["due_date", "deadline", "expiry_date", "event_date"] as const;

async function resolveApiKey(rawKey: string): Promise<string | null> {
  if (!rawKey.startsWith("em_")) return null;
  const hash = createHash("sha256").update(rawKey).digest("hex");
  const r = await fetch(
    `${SB_URL}/rest/v1/user_api_keys?key_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=user_id&limit=1`,
    { headers: SB_HEADERS },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0]?.user_id ?? null;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const authHeader = (req.headers.authorization as string) || "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  let userId: string | null = null;
  if (rawKey.startsWith("em_")) {
    userId = await resolveApiKey(rawKey);
  } else {
    const user = await verifyAuth(req);
    userId = user?.id ?? null;
  }
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const query = req.query as Record<string, string>;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const brain_id = query.brain_id;
  if (!brain_id || !uuidRe.test(brain_id)) {
    return res.status(400).json({ error: "brain_id required (UUID)" });
  }

  const access = await checkBrainAccess(userId, brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const days = Math.min(Math.max(1, parseInt(query.days) || 30), 365);
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  // Query each date field in parallel — PostgREST supports metadata->>'field' filter keys
  const fetches = await Promise.all(
    DATE_FIELDS.map(async (field) => {
      const params = new URLSearchParams({
        "brain_id": `eq.${brain_id}`,
        "deleted_at": "is.null",
        [`metadata->>${field}`]: `gte.${today}`,
        "select": "id,title,type,tags,content,metadata,created_at",
        "limit": "100",
        "order": `metadata->>${field}.asc`,
      });
      // Add upper bound — can't use URLSearchParams duplicate key, append manually
      const url = `${SB_URL}/rest/v1/entries?${params.toString()}&metadata->>${field}=lte.${future}`;
      const r = await fetch(url, { headers: SB_HEADERS });
      if (!r.ok) return [];
      const rows: any[] = await r.json();
      return rows.map((e) => ({ ...e, _date_field: field }));
    }),
  );

  // Merge + deduplicate (keep first occurrence per entry id)
  const seen = new Set<string>();
  const merged: any[] = [];
  for (const rows of fetches) {
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row);
      }
    }
  }

  // Sort by earliest date value across all date fields
  merged.sort((a, b) => {
    const aDate = DATE_FIELDS.map((f) => a.metadata?.[f]).filter(Boolean).sort()[0] ?? "9999";
    const bDate = DATE_FIELDS.map((f) => b.metadata?.[f]).filter(Boolean).sort()[0] ?? "9999";
    return aDate.localeCompare(bDate);
  });

  return res.status(200).json({ entries: merged, days, from: today, to: future });
}
