/**
 * POST /api/feedback
 *
 * Two modes depending on `type` in the request body:
 *
 * 1. Chat feedback (default, type omitted):
 *    Stores a rated chat interaction and optionally learns a knowledge shortcut.
 *    Body: brain_id, query, answer, retrieved_entry_ids, top_entry_ids, feedback (1|-1), confidence
 *
 * 2. Insight correction (type === "insight_correction"):
 *    User down-thumbed a "wow" insight and wrote a correction.
 *    The LLM identifies which brain entries caused the wrong insight and patches them.
 *    Body: brain_id, headline, detail, correction
 *    Response: { fixed_count: number }
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { learnKnowledgeShortcut } from "./_lib/feedback.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
};

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { type } = req.body ?? {};

  if (type === "insight_correction") return handleInsightCorrection(req, res, user);
  if (type === "merge_feedback") return handleMergeFeedback(req, res, user);
  return handleChatFeedback(req, res, user);
}

// ── Mode 1: Chat feedback ────────────────────────────────────────────────────

async function handleChatFeedback(req: ApiRequest, res: ApiResponse, user: any): Promise<void> {
  const {
    brain_id,
    query,
    answer,
    retrieved_entry_ids,
    top_entry_ids,
    feedback,
    confidence = "medium",
  } = req.body ?? {};

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

  const hasAccess = await checkBrainAccess(user.id, brain_id);
  if (!hasAccess) return res.status(403).json({ error: "Forbidden" });

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

  if (feedback === 1 && confidence === "high" && topIds.length > 0) {
    learnKnowledgeShortcut(brain_id, query, retrievedIds, topIds).catch((e) => {
      console.error("[feedback:learn]", e?.message);
    });
  }

  return res.status(200).json({ ok: true });
}

// ── Mode 2: Merge feedback ───────────────────────────────────────────────────

async function handleMergeFeedback(req: ApiRequest, res: ApiResponse, user: any): Promise<void> {
  const { brain_id, titles, note } = req.body ?? {};
  if (!brain_id || typeof brain_id !== "string" || brain_id.length > 100) {
    return res.status(400).json({ error: "Invalid brain_id" });
  }
  if (!note || typeof note !== "string" || note.length < 1 || note.length > 1000) {
    return res.status(400).json({ error: "note required (max 1000 chars)" });
  }
  const hasAccess = await checkBrainAccess(user.id, brain_id);
  if (!hasAccess) return res.status(403).json({ error: "Forbidden" });

  const titleStr = Array.isArray(titles) ? titles.join(" + ") : "";
  await fetch(`${SB_URL}/rest/v1/query_feedback`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({
      brain_id,
      query: `[merge_guidance] ${titleStr}`.slice(0, 500),
      answer: note.trim(),
      retrieved_entry_ids: [],
      top_entry_ids: [],
      feedback: 1,
      confidence: "high",
    }),
  }).catch((e: any) => console.error("[feedback:merge]", e?.message));

  return res.status(200).json({ ok: true });
}

// ── Mode 3: Insight correction ───────────────────────────────────────────────

const INSIGHT_CORRECTION_SYSTEM = `You are a data quality assistant for a personal knowledge base.
A user has flagged an AI-generated insight as incorrect and provided a correction.
Your job: identify which entries contain factually incorrect data that led to the wrong insight, and return corrected content for those entries.

Return ONLY a JSON array of objects with this exact shape:
[{"id": "<entry_id>", "content": "<corrected full content>"}]

Rules:
- Only include entries that genuinely need correction based on the user's feedback
- Do not change entries that are correct or unrelated
- Return [] if no entries need changing
- Return only the JSON array, no explanation`;

async function handleInsightCorrection(req: ApiRequest, res: ApiResponse, user: any): Promise<void> {
  const { brain_id, headline, detail, correction } = req.body ?? {};

  if (!brain_id || typeof brain_id !== "string" || brain_id.length > 100) {
    return res.status(400).json({ error: "Invalid brain_id" });
  }
  if (!headline || typeof headline !== "string" || headline.length > 500) {
    return res.status(400).json({ error: "Invalid headline" });
  }
  if (!correction || typeof correction !== "string" || correction.length < 1 || correction.length > 1000) {
    return res.status(400).json({ error: "correction required (max 1000 chars)" });
  }

  const hasAccess = await checkBrainAccess(user.id, brain_id);
  if (!hasAccess) return res.status(403).json({ error: "Forbidden" });

  if (!GEMINI_API_KEY) return res.status(500).json({ error: "AI not configured" });

  // Fetch entries
  const entriesRes = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&select=id,title,content&order=created_at.desc&limit=80`,
    { headers: sbHeadersNoContent() },
  );
  if (!entriesRes.ok) return res.status(502).json({ error: "Failed to fetch entries" });

  const entries: Array<{ id: string; title: string; content: string }> = await entriesRes.json();
  if (!entries.length) return res.status(200).json({ fixed_count: 0 });

  const validIds = new Set(entries.map((e) => e.id));

  const entriesSummary = entries
    .map((e) => `ID: ${e.id}\nTitle: ${e.title}\nContent: ${(e.content || "").slice(0, 200)}`)
    .join("\n\n---\n\n");

  const userPrompt = `Wrong insight: "${headline}"
${detail ? `Insight detail: ${String(detail).slice(0, 300)}` : ""}
User's correction: "${correction}"

Brain entries to review:
${entriesSummary}`;

  // Call LLM
  let fixes: Array<{ id: string; content: string }> = [];
  try {
    const llmRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: INSIGHT_CORRECTION_SYSTEM }] },
          generationConfig: { maxOutputTokens: 2000 },
        }),
      },
    );
    if (llmRes.ok) {
      const data: any = await llmRes.json();
      const parts: any[] = data.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p: any) => !p.thought).map((p: any) => p.text || "").join("").trim()
        || parts.map((p: any) => p.text || "").join("").trim();
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          fixes = parsed.filter(
            (f: any) =>
              f && typeof f.id === "string" &&
              typeof f.content === "string" &&
              validIds.has(f.id),
          );
        }
      }
    } else {
      console.error("[feedback:insight_correction:llm]", llmRes.status);
    }
  } catch (e: any) {
    console.error("[feedback:insight_correction:llm]", e?.message);
  }

  // Apply patches
  let fixed_count = 0;
  for (const fix of fixes) {
    try {
      const patchRes = await fetch(
        `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(fix.id)}&brain_id=eq.${encodeURIComponent(brain_id)}`,
        {
          method: "PATCH",
          headers: sbHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify({ content: fix.content.slice(0, 10000) }),
        },
      );
      if (patchRes.ok) fixed_count++;
      else console.error("[feedback:insight_correction:patch]", fix.id, patchRes.status);
    } catch (e: any) {
      console.error("[feedback:insight_correction:patch]", e?.message);
    }
  }

  return res.status(200).json({ fixed_count });
}
