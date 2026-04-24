import { SERVER_PROMPTS } from "./prompts.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function callAnthropic(system: string, content: string, maxTokens = 1500): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) return "";
  const d = await res.json();
  return d?.content?.[0]?.text ?? "";
}

function parseAIJSON(raw: string): any | null {
  const text = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const match = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (match) {
    try { const p = JSON.parse(match[0]); return Array.isArray(p) ? p[0] : p; } catch {}
  }
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

const SKIP_META = new Set(["enrichment", "source", "full_text", "gmail_from", "gmail_subject", "gmail_thread_id", "gmail_message_id"]);

function isParsed(entry: any): boolean {
  const enr = entry.metadata?.enrichment ?? {};
  if (enr.parsed === false) return false;
  if (enr.parsed === true) return true;
  const keys = Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META.has(k));
  return keys.length > 0;
}

function hasInsight(entry: any): boolean {
  const enr = entry.metadata?.enrichment ?? {};
  return !!(entry.metadata?.ai_insight) || enr.has_insight === true;
}

async function patchMeta(entryId: string, userId: string, meta: Record<string, any>): Promise<void> {
  await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "PATCH", headers: { ...SB_HDR, Prefer: "return=minimal" }, body: JSON.stringify({ metadata: meta }) },
  );
}

export async function runEnrichBatchForUser(
  userId: string,
  brainId: string,
  batchSize = 5,
): Promise<{ processed: number; remaining: number }> {
  const hasLLM = !!process.env.ANTHROPIC_API_KEY;
  if (!hasLLM) return { processed: 0, remaining: 0 };

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,type,tags,metadata,embedded_at,status&limit=200&order=created_at.desc`,
    { headers: SB_HDR },
  );
  if (!r.ok) return { processed: 0, remaining: 0 };
  const all: any[] = await r.json();

  const unenriched = all.filter((e) => !isParsed(e) || !hasInsight(e));
  if (unenriched.length === 0) return { processed: 0, remaining: 0 };

  const batch = unenriched.slice(0, batchSize);
  let processed = 0;

  for (const entry of batch) {
    let meta = { ...(entry.metadata ?? {}) };
    let enr = { ...(meta.enrichment ?? {}) };
    let changed = false;

    // ── Parse ──
    if (!isParsed(entry)) {
      const raw = String(meta.full_text || entry.content || entry.title || "");
      const aiRaw = await callAnthropic(SERVER_PROMPTS.CAPTURE, raw, 1500);
      const result = parseAIJSON(aiRaw);
      if (result && (result.type || result.title || result.content)) {
        const { confidence: _c, ...resultMeta } = result.metadata ?? {};
        meta = { ...meta, ...resultMeta, enrichment: { ...enr, parsed: true } };
        enr = meta.enrichment;
        changed = true;
      } else if (entry.title && (entry.content || "").length > 10) {
        meta = { ...meta, enrichment: { ...enr, parsed: true } };
        enr = meta.enrichment;
        changed = true;
      }
    }

    // ── Insight ──
    if (!hasInsight(entry)) {
      const tagStr = entry.tags?.length ? ` [${entry.tags.join(", ")}]` : "";
      const prompt = `Entry: "${entry.title}" (${entry.type || "note"})${tagStr}\n${String(entry.content || "").slice(0, 400)}`;
      const insight = await callAnthropic(SERVER_PROMPTS.INSIGHT, prompt, 150);
      if (insight.trim().length >= 20) {
        meta = { ...meta, ai_insight: insight.trim(), enrichment: { ...enr, has_insight: true } };
        changed = true;
      }
    }

    if (changed) {
      await patchMeta(entry.id, userId, meta);
      processed++;
    }

    // Promote staged → active once parse + insight + embedding all done
    if (entry.status === "staged") {
      const nowParsed = isParsed({ ...entry, metadata: meta });
      const nowInsight = hasInsight({ ...entry, metadata: meta });
      const nowEmbedded = !!(entry.embedded_at);
      if (nowParsed && nowInsight && nowEmbedded) {
        await fetch(
          `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}&user_id=eq.${encodeURIComponent(userId)}`,
          { method: "PATCH", headers: { ...SB_HDR, Prefer: "return=minimal" }, body: JSON.stringify({ status: "active" }) },
        );
      }
    }
  }

  return { processed, remaining: unenriched.length - batch.length };
}

export async function runEnrichBatchAllUsers(): Promise<{ brains: number; processed: number }> {
  const r = await fetch(`${SB_URL}/rest/v1/brains?select=id,owner_id`, { headers: SB_HDR });
  if (!r.ok) return { brains: 0, processed: 0 };
  const brains: any[] = await r.json();
  let totalProcessed = 0;
  for (const brain of brains) {
    const { processed } = await runEnrichBatchForUser(brain.owner_id, brain.id, 3).catch(() => ({ processed: 0, remaining: 0 }));
    totalProcessed += processed;
  }
  return { brains: brains.length, processed: totalProcessed };
}
