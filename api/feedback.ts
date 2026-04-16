/**
 * POST /api/feedback
 *
 * Stores a rated interaction and optionally learns a knowledge shortcut.
 *
 * Body:
 *   brain_id:             string   — which brain
 *   query:                string   — the user's question
 *   answer:               string   — the answer that was shown
 *   retrieved_entry_ids:  string[] — all entries retrieved by the pipeline
 *   top_entry_ids:        string[] — the entries actually cited / shown
 *   feedback:             1 | -1   — thumbs up or down
 *   confidence:           string   — "high" | "medium" | "low"
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { learnKnowledgeShortcut } from "./_lib/feedback.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
};

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const {
    brain_id,
    query,
    answer,
    retrieved_entry_ids,
    top_entry_ids,
    feedback,
    confidence = "medium",
  } = req.body ?? {};

  // ── Validation ────────────────────────────────────────────────────────────
  if (!brain_id || typeof brain_id !== "string" || brain_id.length > 100) {
    return res.status(400).json({ error: "Invalid brain_id" });
  }
  if (!query || typeof query !== "string" || query.length > 2000) {
    return res.status(400).json({ error: "Invalid query" });
  }
  if (!answer || typeof answer !== "string" || answer.length > 20000) {
    return res.status(400).json({ error: "Invalid answer" });
  }
  if (feedback !== 1 && feedback !== -1) {
    return res.status(400).json({ error: "feedback must be 1 or -1" });
  }
  if (!["high", "medium", "low"].includes(confidence)) {
    return res.status(400).json({ error: "confidence must be high, medium, or low" });
  }
  const retrievedIds: string[] = Array.isArray(retrieved_entry_ids) ? retrieved_entry_ids.slice(0, 100) : [];
  const topIds: string[] = Array.isArray(top_entry_ids) ? top_entry_ids.slice(0, 20) : [];

  // ── Brain access check ────────────────────────────────────────────────────
  const hasAccess = await checkBrainAccess(user.id, brain_id);
  if (!hasAccess) return res.status(403).json({ error: "Forbidden" });

  // ── Store feedback ────────────────────────────────────────────────────────
  const insertRes = await fetch(`${SB_URL}/rest/v1/query_feedback`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({
      brain_id,
      query: query.trim(),
      answer: answer.trim(),
      retrieved_entry_ids: retrievedIds,
      top_entry_ids: topIds,
      feedback,
      confidence,
    }),
  });

  if (!insertRes.ok) {
    const err = await insertRes.text().catch(() => String(insertRes.status));
    console.error("[feedback:insert]", err);
    return res.status(502).json({ error: "Failed to store feedback" });
  }

  // ── Learn knowledge shortcut (fire-and-forget) ────────────────────────────
  // Only triggered on positive feedback with high confidence — the dual gate
  // in getKnowledgeShortcuts (score > 0.6 AND usage >= 2) means a single event
  // still produces only a weak (+0.03) shortcut.
  if (feedback === 1 && confidence === "high" && topIds.length > 0) {
    learnKnowledgeShortcut(brain_id, query, retrievedIds, topIds).catch((e) => {
      console.error("[feedback:learn]", e?.message);
    });
  }

  return res.status(200).json({ ok: true });
}
