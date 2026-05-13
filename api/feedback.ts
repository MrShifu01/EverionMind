/**
 * POST /api/feedback
 *
 * Three modes depending on `type` in the request body:
 *
 * 1. Chat feedback (default, type omitted):
 *    Stores a rated chat interaction and optionally learns a knowledge shortcut.
 *    Body: brain_id, query, answer, retrieved_entry_ids, top_entry_ids, feedback (1|-1), confidence
 *
 * 2. Merge feedback (type === "merge_feedback"):
 *    Records user guidance for entry-merge decisions.
 *    Body: brain_id, titles, note
 *
 * 3. Insight correction (type === "insight_correction"):
 *    User down-thumbed a "wow" insight and wrote a correction.
 *    The LLM identifies which brain entries caused the wrong insight and patches them.
 *    Body: brain_id, headline, detail, correction
 *    Response: { fixed_count: number }
 */
import { withAuth, requireBrainAccess, ApiError, type HandlerContext } from "./_lib/withAuth.js";
import { sbHeaders, sbHeadersNoContent } from "./_lib/sbHeaders.js";
import { learnKnowledgeShortcut } from "./_lib/feedback.js";
import { bodyObject, optionalBodyObject } from "./_lib/requestBody.js";
import { callAI } from "./_lib/aiProvider.js";
import { resolveProviderForUser } from "./_lib/resolveProvider.js";

const SB_URL = process.env.SUPABASE_URL!;

export default withAuth({ methods: ["POST"], rateLimit: 30 }, async (ctx) => {
  const { type } = optionalBodyObject(ctx.req.body);
  if (type === "insight_correction") return handleInsightCorrection(ctx);
  if (type === "merge_feedback") return handleMergeFeedback(ctx);
  return handleChatFeedback(ctx);
});

// ── Mode 1: Chat feedback ────────────────────────────────────────────────────

async function handleChatFeedback({ req, res, user }: HandlerContext): Promise<void> {
  const {
    brain_id,
    query,
    answer,
    retrieved_entry_ids,
    top_entry_ids,
    feedback,
    confidence = "medium",
  } = bodyObject(req.body);

  if (!query || typeof query !== "string" || query.length > 2000) {
    throw new ApiError(400, "Invalid query");
  }
  if (!answer || typeof answer !== "string" || answer.length > 20000) {
    throw new ApiError(400, "Invalid answer");
  }
  if (feedback !== 1 && feedback !== -1) {
    throw new ApiError(400, "feedback must be 1 or -1");
  }
  if (typeof confidence !== "string" || !["high", "medium", "low"].includes(confidence)) {
    throw new ApiError(400, "confidence must be high, medium, or low");
  }
  if (typeof brain_id !== "string") {
    throw new ApiError(400, "Invalid brain_id");
  }
  const retrievedIds: string[] = Array.isArray(retrieved_entry_ids)
    ? retrieved_entry_ids.slice(0, 100)
    : [];
  const topIds: string[] = Array.isArray(top_entry_ids) ? top_entry_ids.slice(0, 20) : [];

  await requireBrainAccess(user.id, brain_id);

  const insertRes = await fetch(`${SB_URL}/rest/v1/query_feedback`, {
    method: "POST",
    headers: sbHeaders(),
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
    throw new ApiError(502, "Failed to store feedback");
  }

  if (feedback === 1 && confidence === "high" && topIds.length > 0) {
    learnKnowledgeShortcut(brain_id, query, retrievedIds, topIds).catch((e) => {
      console.error("[feedback:learn]", e?.message);
    });
  }

  res.status(200).json({ ok: true });
}

// ── Mode 2: Merge feedback ───────────────────────────────────────────────────

async function handleMergeFeedback({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id, titles, note } = bodyObject(req.body);
  if (!note || typeof note !== "string" || note.length < 1 || note.length > 1000) {
    throw new ApiError(400, "note required (max 1000 chars)");
  }
  if (typeof brain_id !== "string") {
    throw new ApiError(400, "Invalid brain_id");
  }
  await requireBrainAccess(user.id, brain_id);

  const titleStr = Array.isArray(titles) ? titles.join(" + ") : "";
  await fetch(`${SB_URL}/rest/v1/query_feedback`, {
    method: "POST",
    headers: sbHeaders(),
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

  res.status(200).json({ ok: true });
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

async function handleInsightCorrection({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id, headline, detail, correction } = bodyObject(req.body);

  if (!headline || typeof headline !== "string" || headline.length > 500) {
    throw new ApiError(400, "Invalid headline");
  }
  if (
    !correction ||
    typeof correction !== "string" ||
    correction.length < 1 ||
    correction.length > 1000
  ) {
    throw new ApiError(400, "correction required (max 1000 chars)");
  }
  if (typeof brain_id !== "string") {
    throw new ApiError(400, "Invalid brain_id");
  }
  await requireBrainAccess(user.id, brain_id);

  const cfg = await resolveProviderForUser(user.id);
  if (!cfg) throw new ApiError(500, "AI not configured for this user");

  const entriesRes = await fetch(
    `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain_id)}&select=id,title,content&order=created_at.desc&limit=80`,
    { headers: sbHeadersNoContent() },
  );
  if (!entriesRes.ok) throw new ApiError(502, "Failed to fetch entries");

  const entries: Array<{ id: string; title: string; content: string }> = await entriesRes.json();
  if (!entries.length) {
    res.status(200).json({ fixed_count: 0 });
    return;
  }

  const validIds = new Set(entries.map((e) => e.id));

  const entriesSummary = entries
    .map((e) => `ID: ${e.id}\nTitle: ${e.title}\nContent: ${(e.content || "").slice(0, 200)}`)
    .join("\n\n---\n\n");

  const userPrompt = `Wrong insight: "${headline}"
${detail ? `Insight detail: ${String(detail).slice(0, 300)}` : ""}
User's correction: "${correction}"

Brain entries to review:
${entriesSummary}`;

  let fixes: Array<{ id: string; content: string }> = [];
  try {
    const text = await callAI(cfg, INSIGHT_CORRECTION_SYSTEM, userPrompt, {
      maxTokens: 2000,
      json: true,
    });
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        fixes = parsed.filter(
          (f: any) =>
            f && typeof f.id === "string" && typeof f.content === "string" && validIds.has(f.id),
        );
      }
    }
  } catch (e: any) {
    console.error("[feedback:insight_correction:llm]", e?.message);
  }

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

  res.status(200).json({ fixed_count });
}
