/**
 * POST /api/memory/retrieve
 *
 * Semantic retrieval over a brain — returns enriched entries with full metadata.
 * Strips the Gemini generation step from the chat pipeline; intended for external
 * AI agents (ChatGPT Actions, Claude MCP, etc.) that want raw entries to reason over.
 *
 * Auth: Authorization: Bearer <em_key>  OR  Authorization: Bearer <supabase_jwt>
 * Body: { query: string, brain_id: string, limit?: number (1-50, default 15) }
 * Response: { entries: RetrievedEntry[] }
 */
import { createHash } from "crypto";
import type { ApiRequest, ApiResponse } from "../_lib/types";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";
import { rateLimit } from "../_lib/rateLimit.js";
import { verifyAuth } from "../_lib/verifyAuth.js";
import { checkBrainAccess } from "../_lib/checkBrainAccess.js";
import { retrieveEntries } from "../_lib/retrievalCore.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

async function resolveApiKey(rawKey: string): Promise<string | null> {
  if (!rawKey.startsWith("em_")) return null;
  const hash = createHash("sha256").update(rawKey).digest("hex");
  const r = await fetch(
    `${SB_URL}/rest/v1/user_api_keys?key_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=user_id&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0]?.user_id ?? null;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 20))) return res.status(429).json({ error: "Too many requests" });

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
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "AI not configured" });

  const { query, brain_id, limit } = req.body || {};
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query required" });
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!brain_id || !uuidRe.test(brain_id)) {
    return res.status(400).json({ error: "brain_id required (UUID)" });
  }

  const access = await checkBrainAccess(userId, brain_id);
  if (!access) return res.status(403).json({ error: "Forbidden" });

  const safeLimit = Math.min(Math.max(1, parseInt(String(limit)) || 15), 50);

  try {
    const entries = await retrieveEntries(query.trim(), brain_id, GEMINI_API_KEY, safeLimit);
    return res.status(200).json({ entries });
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
}
