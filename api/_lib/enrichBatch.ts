import { z } from "zod";
import { SERVER_PROMPTS } from "./prompts.js";
import { computeCompletenessScore } from "./completeness.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

// Audit #9: validate AI output before merging into entry metadata. Anthropic
// occasionally truncates JSON; the older brace-balancer accepted half-formed
// objects whose missing keys then polluted metadata. These schemas reject
// anything that doesn't match the shape we actually consume.
const CaptureResultSchema = z.object({
  type: z.string().max(80).optional(),
  title: z.string().max(500).optional(),
  content: z.string().max(20_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const ConceptItemSchema = z.object({
  label: z.string().min(1).max(80),
  entry_ids: z.array(z.string()).optional(),
}).passthrough();

const ConceptResultSchema = z.object({
  concepts: z.array(ConceptItemSchema).max(20),
  relationships: z.array(z.unknown()).optional(),
}).passthrough();

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
  if (!res.ok) {
    console.error(`[enrichBatch:anthropic] HTTP ${res.status}`, await res.text().catch(() => ""));
    return "";
  }
  const d = await res.json();
  return d?.content?.[0]?.text ?? "";
}

function parseAIJSON(raw: string): any | null {
  const text = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const match = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (match) {
    try {
      const p = JSON.parse(match[0]);
      if (Array.isArray(p)) {
        if (p.length > 0 && typeof p[0] === "object" && ("label" in p[0] || "concepts" in p[0])) {
          return { concepts: p, relationships: [] };
        }
        return p[0];
      }
      return p;
    } catch {}
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

function hasConcepts(entry: any): boolean {
  return !!(entry.metadata?.enrichment?.concepts_extracted);
}

async function patchMeta(entryId: string, userId: string, meta: Record<string, any>): Promise<void> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&select=metadata&limit=1`,
    { headers: SB_HDR },
  );
  const current: Record<string, any> = r.ok ? ((await r.json())[0]?.metadata ?? {}) : {};
  await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "PATCH", headers: { ...SB_HDR, Prefer: "return=minimal" }, body: JSON.stringify({ metadata: { ...current, ...meta } }) },
  );
}

async function enrichSingleEntry(entry: any, userId: string): Promise<boolean> {
  let meta = { ...(entry.metadata ?? {}) };
  let enr = { ...(meta.enrichment ?? {}) };
  let changed = false;

  // ── Parse ──
  if (!isParsed(entry)) {
    const raw = String(meta.full_text || entry.content || entry.title || "");
    const aiRaw = await callAnthropic(SERVER_PROMPTS.CAPTURE, raw, 1500);
    const candidate = parseAIJSON(aiRaw);
    const parsed = candidate ? CaptureResultSchema.safeParse(candidate) : null;
    if (parsed?.success && (parsed.data.type || parsed.data.title || parsed.data.content)) {
      const { confidence: _c, ...resultMeta } = parsed.data.metadata ?? {};
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
    const prompt = `<user_entry>\nType: ${entry.type || "note"}${tagStr}\nTitle: ${entry.title}\n${String(entry.content || "").slice(0, 1500)}\n</user_entry>`;
    const insight = await callAnthropic(SERVER_PROMPTS.INSIGHT, prompt, 150);
    if (insight.trim().length >= 20) {
      meta = { ...meta, ai_insight: insight.trim(), enrichment: { ...enr, has_insight: true } };
      enr = meta.enrichment;
      changed = true;
    }
  }

  // ── Concepts ──
  if (!hasConcepts(entry)) {
    const conceptPrompt = `Entry ID: ${entry.id}\n<user_entry>\nTitle: ${entry.title}\nType: ${entry.type || "note"}\nContent: ${String(entry.content || "").slice(0, 2000)}\n</user_entry>`;
    const conceptRaw = await callAnthropic(SERVER_PROMPTS.ENTRY_CONCEPTS, conceptPrompt, 400);
    const candidate = parseAIJSON(conceptRaw);
    const parsed = candidate ? ConceptResultSchema.safeParse(candidate) : null;
    if (parsed?.success && parsed.data.concepts.length > 0) {
      meta = { ...meta, concepts: parsed.data.concepts, enrichment: { ...enr, concepts_extracted: true } };
      enr = meta.enrichment;
      changed = true;
    }
  }

  if (changed) await patchMeta(entry.id, userId, meta);

  // Promote staged → active once parse + insight + embedding all done
  if (entry.status === "staged") {
    const nowParsed = isParsed({ ...entry, metadata: meta });
    const nowInsight = hasInsight({ ...entry, metadata: meta });
    if (nowParsed && nowInsight && entry.embedded_at) {
      await fetch(
        `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}&user_id=eq.${encodeURIComponent(userId)}`,
        { method: "PATCH", headers: { ...SB_HDR, Prefer: "return=minimal" }, body: JSON.stringify({ status: "active" }) },
      );
    }
  }

  return changed;
}

const JOB_URL = (entryId: string) =>
  `${SB_URL}/rest/v1/entry_enrichment_jobs?entry_id=eq.${encodeURIComponent(entryId)}`;

export function scheduleEnrichJob(entryId: string, userId: string): void {
  fetch(`${SB_URL}/rest/v1/entry_enrichment_jobs`, {
    method: "POST",
    headers: { ...SB_HDR, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ entry_id: entryId, user_id: userId }),
  }).catch(() => {});

  runEnrichEntry(entryId, userId)
    .then(() =>
      // Only mark complete if the job is still active. A row that was already
      // promoted to dead_letter must not silently resurrect.
      fetch(`${JOB_URL(entryId)}&status=in.(pending,retry)`, {
        method: "PATCH",
        headers: { ...SB_HDR, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "complete", updated_at: new Date().toISOString() }),
      }).catch(() => {}),
    )
    .catch(() => {});
}

export async function drainEnrichmentJobs(maxJobs = 20): Promise<{ processed: number; failed: number }> {
  const now = new Date().toISOString();
  const r = await fetch(
    `${SB_URL}/rest/v1/entry_enrichment_jobs?status=in.(pending,retry)&next_run_at=lte.${encodeURIComponent(now)}&select=entry_id,user_id,attempt&order=next_run_at.asc&limit=${maxJobs}`,
    { headers: SB_HDR },
  );
  if (!r.ok) return { processed: 0, failed: 0 };
  const jobs: any[] = await r.json();
  let processed = 0, failed = 0;
  for (const job of jobs) {
    try {
      await runEnrichEntry(job.entry_id, job.user_id);
      await fetch(JOB_URL(job.entry_id), {
        method: "PATCH",
        headers: { ...SB_HDR, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "complete", updated_at: new Date().toISOString() }),
      });
      processed++;
    } catch (err: any) {
      const attempt = (job.attempt ?? 0) + 1;
      // Wider retry window: 8 attempts × exponential backoff caps at ~24h.
      // Attempt 8 sits ~4h26m past attempt 7, so we cover transient outages
      // up to roughly a day before declaring dead_letter.
      const MAX_ATTEMPTS = 8;
      const backoffMs = Math.min(2 ** attempt * 60_000, 24 * 60 * 60 * 1000);
      await fetch(JOB_URL(job.entry_id), {
        method: "PATCH",
        headers: { ...SB_HDR, Prefer: "return=minimal" },
        body: JSON.stringify({
          status: attempt >= MAX_ATTEMPTS ? "dead_letter" : "retry",
          attempt,
          next_run_at: new Date(Date.now() + backoffMs).toISOString(),
          error: String(err?.message ?? "unknown").slice(0, 500),
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => {});
      failed++;
    }
  }
  return { processed, failed };
}

export async function runEnrichEntry(entryId: string, userId: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&select=id,title,content,type,tags,metadata,embedded_at,status`,
    { headers: SB_HDR },
  );
  if (!r.ok) return;
  const [entry] = await r.json();
  if (entry) await enrichSingleEntry(entry, userId);
}

export async function runEnrichBatchForUser(
  userId: string,
  brainId: string,
  batchSize = 5,
): Promise<{ processed: number; remaining: number }> {
  if (!process.env.ANTHROPIC_API_KEY) return { processed: 0, remaining: 0 };

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,type,tags,metadata,embedded_at,status&limit=200&order=created_at.desc`,
    { headers: SB_HDR },
  );
  if (!r.ok) return { processed: 0, remaining: 0 };
  const all: any[] = await r.json();

  const unenriched = all.filter((e) => !isParsed(e) || !hasInsight(e) || !hasConcepts(e));
  if (unenriched.length === 0) return { processed: 0, remaining: 0 };

  unenriched.sort((a, b) =>
    computeCompletenessScore(a.title, a.content, a.type, a.tags ?? [], a.metadata ?? {}) -
    computeCompletenessScore(b.title, b.content, b.type, b.tags ?? [], b.metadata ?? {})
  );

  const batch = unenriched.slice(0, batchSize);
  let processed = 0;

  for (const entry of batch) {
    const changed = await enrichSingleEntry(entry, userId).catch(() => false);
    if (changed) processed++;
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
