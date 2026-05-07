// ─────────────────────────────────────────────────────────────────────────────
// distillRejected
//
// Compresses the user's rejected-fact pool into 5-10 short "skip rules" so the
// extractor prompt stays bounded as the rejection pile grows. Without this,
// MAX_REJECTED_IN_PROMPT capped the pool at 20 items and the model lost
// long-term context once the user crossed that threshold.
//
// Strategy:
//   1. Pull every rejected persona fact for the user (across all brains —
//      a "skip work activity" rule should apply everywhere).
//   2. Send title + reason pairs to Gemini Flash with a system prompt that
//      asks for 5-10 concise rules in the user's voice.
//   3. Persist to user_personas.rejected_summary.
//
// Refreshed by runPersonaWeeklyPass on Sundays + on-demand from the admin
// debug panel. The on-demand path is what lets the user watch the summary
// evolve in real time as they reject new things.
// ─────────────────────────────────────────────────────────────────────────────

import { sbHeaders } from "./sbHeaders.js";
import { googleAiFetch, googleAiModelUrl } from "./googleAi.js";
import { GEMINI_BULK_MODEL, geminiFallbackChain } from "./geminiModels.js";

const SB_URL = (process.env.SUPABASE_URL || "").trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = (
  process.env.GEMINI_REJECTED_DISTILLER_MODEL || GEMINI_BULK_MODEL
).trim();

// Cap the input to keep token cost predictable — most users won't hit this,
// and the rules generalize fine from a representative sample.
const MAX_REJECTED_INPUT = 200;

export async function distillRejectedForUser(userId: string): Promise<{
  ok: boolean;
  summary: string | null;
  count: number;
  reason?: string;
}> {
  if (!GEMINI_API_KEY) {
    return { ok: false, summary: null, count: 0, reason: "GEMINI_API_KEY not configured" };
  }

  // Pull rejected persona facts. order=created_at.desc so if we hit the cap
  // we keep the most recent (most representative of the user's current taste).
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&type=eq.persona&deleted_at=is.null&metadata->>status=eq.rejected&select=title,metadata,created_at&order=created_at.desc&limit=${MAX_REJECTED_INPUT}`,
    { headers: sbHeaders() },
  );
  if (!r.ok) {
    return { ok: false, summary: null, count: 0, reason: `HTTP ${r.status} loading rejected facts` };
  }
  const rows: Array<{ title: string; metadata: Record<string, any> | null }> = await r.json();

  // Below ~3 rejections there's not enough signal to generalize from. Clear
  // any prior summary so the prompt falls back to the literal recent list.
  if (rows.length < 3) {
    await persistSummary(userId, null);
    return { ok: true, summary: null, count: rows.length, reason: "below_threshold" };
  }

  const block = rows
    .map((row, i) => {
      const reason = row.metadata?.rejected_reason ? ` — ${String(row.metadata.rejected_reason)}` : "";
      return `${i + 1}. ${row.title}${reason}`;
    })
    .join("\n");

  const systemPrompt = `You compress a user's "Not me" rejections into 5-10 SHORT skip rules.

The user has rejected facts that an AI tried to add to their persona. Your job is to find the patterns and write rules that will help future extraction skip the same kinds of things.

RULES FOR YOUR OUTPUT:
- 5-10 bullet points, each ≤ 80 characters
- Imperative voice: "Skip X", "Skip Y when Z"
- Generalize from the examples — don't copy them verbatim
- Cluster similar rejections into one rule (don't repeat)
- If a single rejection is highly specific and one-off, omit it
- Plain markdown bullets only, no headers, no preamble, no explanation

Example output:
- Skip day-to-day work activities — tasks completed, meetings, status updates
- Skip details about other people — siblings, friends, contacts
- Skip transient states — moods, today's weather, temporary feelings
- Skip one-off events that don't define the user long-term

Return ONLY the bullet list. No extra text.`;

  // 429s are common on the free tier — flash-lite has a low requests/minute
  // ceiling. Try the primary model, then back off and retry, then fall back
  // to a heavier-but-less-rate-limited model. Better to spend ~1s on a
  // backup call than surface "Failed: HTTP 429" to the user.
  const FALLBACK_MODELS = geminiFallbackChain(GEMINI_MODEL);
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `User's rejected facts (${rows.length} total):\n\n${block}` }],
      },
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
  });

  let lastError = "";
  for (let attempt = 0; attempt < FALLBACK_MODELS.length; attempt += 1) {
    const model = FALLBACK_MODELS[attempt]!;
    try {
      const resp = await googleAiFetch(GEMINI_API_KEY, googleAiModelUrl(model, "generateContent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      if (resp.status === 429) {
        // Tight retry on 429 before falling back to the next model — the
        // per-minute window is short and a 1-second pause usually clears it.
        await new Promise((r) => setTimeout(r, 1500));
        const retry = await googleAiFetch(
          GEMINI_API_KEY,
          googleAiModelUrl(model, "generateContent"),
          { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
        );
        if (!retry.ok) {
          lastError = `${model} HTTP ${retry.status} after retry`;
          continue;
        }
        const data: any = await retry.json();
        const summary = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
        if (!summary) {
          lastError = `${model} empty summary`;
          continue;
        }
        await persistSummary(userId, summary);
        return { ok: true, summary, count: rows.length };
      }
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        lastError = `${model} HTTP ${resp.status}: ${body.slice(0, 120)}`;
        continue;
      }
      const data: any = await resp.json();
      const summary = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      if (!summary) {
        lastError = `${model} empty summary`;
        continue;
      }
      await persistSummary(userId, summary);
      return { ok: true, summary, count: rows.length };
    } catch (e: any) {
      lastError = `${model}: ${String(e?.message ?? e)}`;
    }
  }
  return { ok: false, summary: null, count: rows.length, reason: lastError };
}

async function persistSummary(userId: string, summary: string | null): Promise<void> {
  // Upsert via PostgREST. user_personas may not exist yet for this user;
  // the on_conflict path handles both cases.
  await fetch(
    `${SB_URL}/rest/v1/user_personas?on_conflict=user_id`,
    {
      method: "POST",
      headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({
        user_id: userId,
        rejected_summary: summary,
        rejected_summary_updated_at: summary ? new Date().toISOString() : null,
      }),
    },
  );
}

// Batch entry point used by runPersonaWeeklyPass — distills for every user
// who has at least one rejected fact, returns a count for the cron summary.
export async function distillRejectedForAllUsers(): Promise<{
  users_processed: number;
  summaries_written: number;
  errors: number;
}> {
  const out = { users_processed: 0, summaries_written: 0, errors: 0 };

  // Find every user_id that has at least one rejected persona fact. Avoids
  // calling the LLM for users who have nothing to distill.
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?type=eq.persona&deleted_at=is.null&metadata->>status=eq.rejected&select=user_id&limit=10000`,
    { headers: sbHeaders() },
  );
  if (!r.ok) {
    out.errors += 1;
    return out;
  }
  const rows: Array<{ user_id: string }> = await r.json();
  const userIds = new Set(rows.map((row) => row.user_id).filter(Boolean));

  for (const uid of userIds) {
    out.users_processed += 1;
    const result = await distillRejectedForUser(uid);
    if (result.ok && result.summary) out.summaries_written += 1;
    if (!result.ok) out.errors += 1;
  }

  return out;
}
