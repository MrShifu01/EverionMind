// ============================================================
// Inline enrichment pipeline.
// ============================================================
//
// One entry point per use case:
//
//   enrichInline(entry, userId)
//     → run all four steps for one entry, awaited end-to-end.
//       Used by capture (post-insert), llm (auto-create-entry),
//       mcp (createEntry tool), v1 (API key capture).
//
//   enrichBrain(userId, brainId, batchSize?)
//     → loop enrichInline over entries that aren't fully enriched.
//       Used by Settings → AI → Run-now and the daily cron.
//
// No queue. No fire-and-forget. No fallback heuristics. Each step
// PATCHes the entry's metadata + the explicit flag on success;
// failures leave the flag unset for the next pass to retry.
//
// Steps that hit the LLM go through callAI(cfg, …) where cfg comes
// from resolveProviderForUser. Embedding goes through a separate
// embed adapter because Anthropic doesn't offer a first-class
// embedding model.

import { z } from "zod";
import { SERVER_PROMPTS } from "./prompts.js";
import { callAI, type AICall } from "./aiProvider.js";
import { resolveProviderForUser, resolveEmbedProviderForUser } from "./resolveProvider.js";
import { flagsOf } from "./enrichFlags.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HDR = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

const CaptureResultSchema = z
  .object({
    type: z.string().max(80).optional(),
    title: z.string().max(500).optional(),
    content: z.string().max(20_000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const ConceptItemSchema = z
  .object({
    label: z.string().min(1).max(80),
    entry_ids: z.array(z.string()).optional(),
  })
  .passthrough();

const ConceptResultSchema = z
  .object({
    concepts: z.array(ConceptItemSchema).max(20),
    relationships: z.array(z.unknown()).optional(),
  })
  .passthrough();

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
    } catch {
      // fall through to brace-balancing
    }
  }
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

interface Entry {
  id: string;
  title: string;
  content: string | null;
  type: string | null;
  tags: string[] | null;
  metadata: Record<string, any> | null;
  embedded_at: string | null;
  embedding_status: string | null;
  status: string | null;
}

const ENTRY_FIELDS = "id,title,content,type,tags,metadata,embedded_at,embedding_status,status";

async function fetchEntry(entryId: string, userId: string): Promise<Entry | null> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&select=${encodeURIComponent(ENTRY_FIELDS)}`,
    { headers: SB_HDR },
  );
  if (!r.ok) return null;
  const [row] = (await r.json().catch(() => [])) as Entry[];
  return row ?? null;
}

async function patchMetadata(entryId: string, userId: string, metadata: Record<string, any>): Promise<void> {
  await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { ...SB_HDR, Prefer: "return=minimal" },
      body: JSON.stringify({ metadata }),
    },
  );
}

// ── Step: parse ─────────────────────────────────────────────────────────────

async function stepParse(entry: Entry, cfg: AICall): Promise<Record<string, any> | null> {
  const meta = { ...(entry.metadata ?? {}) };
  const raw = String(meta.full_text || entry.content || entry.title || "");
  if (!raw) return { ...meta, enrichment: { ...(meta.enrichment ?? {}), parsed: true } };

  const aiRaw = await callAI(cfg, SERVER_PROMPTS.CAPTURE, raw, { maxTokens: 1500, json: true });
  if (!aiRaw) return null; // LLM failure — leave the flag unset

  const candidate = parseAIJSON(aiRaw);
  const parsed = candidate ? CaptureResultSchema.safeParse(candidate) : null;
  if (parsed?.success && (parsed.data.type || parsed.data.title || parsed.data.content)) {
    const { confidence: _c, ...resultMeta } = parsed.data.metadata ?? {};
    return {
      ...meta,
      ...resultMeta,
      enrichment: { ...(meta.enrichment ?? {}), parsed: true },
    };
  }
  // LLM returned unparseable / off-shape output. Treat the call as a no-op
  // for the parse step, but if the entry has at least a title + some content
  // we can still mark it parsed (it's structurally complete).
  if (entry.title && (entry.content ?? "").length > 10) {
    return { ...meta, enrichment: { ...(meta.enrichment ?? {}), parsed: true } };
  }
  return null;
}

// ── Step: insight ───────────────────────────────────────────────────────────

const REFUSAL_RE =
  /^I (cannot|can't|am unable|don't have)|(\bwithout$|\bmore context$|\binsufficient)/i;

async function stepInsight(entry: Entry, cfg: AICall): Promise<Record<string, any> | null> {
  const meta = { ...(entry.metadata ?? {}) };
  const tagStr = entry.tags?.length ? ` [${entry.tags.join(", ")}]` : "";
  const prompt = `<user_entry>\nType: ${entry.type || "note"}${tagStr}\nTitle: ${entry.title}\n${String(entry.content || "").slice(0, 1500)}\n</user_entry>`;
  const insight = await callAI(cfg, SERVER_PROMPTS.INSIGHT, prompt, { maxTokens: 300 });
  if (!insight) return null;

  const trimmed = insight.trim();
  const looksRefusal = REFUSAL_RE.test(trimmed);
  if (trimmed.length >= 20 && !looksRefusal) {
    return {
      ...meta,
      ai_insight: trimmed,
      enrichment: { ...(meta.enrichment ?? {}), has_insight: true },
    };
  }
  // Got a response but it's a refusal/truncation. Mark has_insight=true so we
  // don't loop forever, but don't store the refusal as the insight.
  return {
    ...meta,
    enrichment: { ...(meta.enrichment ?? {}), has_insight: true },
  };
}

// ── Step: concepts ──────────────────────────────────────────────────────────

async function stepConcepts(entry: Entry, cfg: AICall): Promise<Record<string, any> | null> {
  const meta = { ...(entry.metadata ?? {}) };
  const conceptPrompt = `Entry ID: ${entry.id}\n<user_entry>\nTitle: ${entry.title}\nType: ${entry.type || "note"}\nContent: ${String(entry.content || "").slice(0, 2000)}\n</user_entry>`;
  const conceptRaw = await callAI(cfg, SERVER_PROMPTS.ENTRY_CONCEPTS, conceptPrompt, {
    maxTokens: 400,
    json: true,
  });
  if (!conceptRaw) return null;

  const candidate = parseAIJSON(conceptRaw);
  const parsed = candidate ? ConceptResultSchema.safeParse(candidate) : null;
  if (!parsed?.success) return null;

  // Stamp the flag whenever the call succeeded, even if concepts is empty —
  // a content-less entry genuinely has nothing to extract and we don't want
  // to retry indefinitely.
  return {
    ...meta,
    ...(parsed.data.concepts.length > 0 ? { concepts: parsed.data.concepts } : {}),
    enrichment: { ...(meta.enrichment ?? {}), concepts_extracted: true },
  };
}

// ── Step: embed ─────────────────────────────────────────────────────────────

interface EmbedConfig {
  provider: "gemini" | "openai";
  apiKey: string;
  model: string;
}

function buildEntryText(entry: { title: string; content: string | null; tags: string[] | null }): string {
  const tagStr = entry.tags?.length ? ` [${entry.tags.join(", ")}]` : "";
  return `${entry.title}${tagStr}\n${entry.content ?? ""}`.trim();
}

async function generateEmbedding(text: string, embed: EmbedConfig): Promise<number[]> {
  if (embed.provider === "gemini") {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${embed.model}:embedContent?key=${encodeURIComponent(embed.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${embed.model}`,
          content: { parts: [{ text }] },
        }),
      },
    );
    if (!r.ok) throw new Error(`Gemini embed HTTP ${r.status}: ${await r.text().catch(() => "")}`);
    const d: any = await r.json();
    const values: number[] | undefined = d?.embedding?.values;
    if (!Array.isArray(values)) throw new Error("Gemini embed: missing values");
    return values;
  }
  // OpenAI
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${embed.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: embed.model, input: text }),
  });
  if (!r.ok) throw new Error(`OpenAI embed HTTP ${r.status}: ${await r.text().catch(() => "")}`);
  const d: any = await r.json();
  const values: number[] | undefined = d?.data?.[0]?.embedding;
  if (!Array.isArray(values)) throw new Error("OpenAI embed: missing values");
  return values;
}

async function stepEmbed(entry: Entry, embed: EmbedConfig): Promise<void> {
  const text = buildEntryText(entry);
  if (!text) {
    // No content to embed — mark done so we don't retry forever.
    await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`,
      {
        method: "PATCH",
        headers: { ...SB_HDR, Prefer: "return=minimal" },
        body: JSON.stringify({ embedding_status: "done", embedded_at: new Date().toISOString() }),
      },
    );
    return;
  }
  try {
    const values = await generateEmbedding(text, embed);
    await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`,
      {
        method: "PATCH",
        headers: { ...SB_HDR, Prefer: "return=minimal" },
        body: JSON.stringify({
          embedding: `[${values.join(",")}]`,
          embedded_at: new Date().toISOString(),
          embedding_provider: embed.provider === "gemini" ? "google" : "openai",
          embedding_model: embed.model,
          embedding_status: "done",
        }),
      },
    );
  } catch (err: any) {
    console.error("[enrich:embed]", err?.message ?? err);
    await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`,
      {
        method: "PATCH",
        headers: { ...SB_HDR, Prefer: "return=minimal" },
        body: JSON.stringify({ embedding_status: "failed" }),
      },
    ).catch(() => {});
  }
}

// ── Public: enrichInline ────────────────────────────────────────────────────
//
// Awaited from capture and any other entry-creation site. Runs every step
// whose flag isn't already true. Returns true if anything changed.

export async function enrichInline(entryId: string, userId: string): Promise<boolean> {
  const entry = await fetchEntry(entryId, userId);
  if (!entry) return false;
  if (entry.type === "secret") return false;

  const flags = flagsOf(entry);
  let changed = false;
  let workingMeta = entry.metadata ?? {};

  const llmCfg = await resolveProviderForUser(userId);
  if (llmCfg) {
    if (!flags.parsed) {
      const next = await stepParse({ ...entry, metadata: workingMeta }, llmCfg);
      if (next) {
        workingMeta = next;
        changed = true;
      }
    }
    if (!flags.has_insight) {
      const next = await stepInsight({ ...entry, metadata: workingMeta }, llmCfg);
      if (next) {
        workingMeta = next;
        changed = true;
      }
    }
    if (!flags.concepts_extracted) {
      const next = await stepConcepts({ ...entry, metadata: workingMeta }, llmCfg);
      if (next) {
        workingMeta = next;
        changed = true;
      }
    }
    if (changed) await patchMetadata(entry.id, userId, workingMeta);
  }

  // Embedding is independent of the LLM provider.
  if (!flags.embedded && flags.embedding_status !== "failed") {
    const embedCfg = await resolveEmbedProviderForUser(userId);
    if (embedCfg) {
      await stepEmbed({ ...entry, metadata: workingMeta }, embedCfg);
      changed = true;
    }
  }

  return changed;
}

// ── Public: enrichBrain ─────────────────────────────────────────────────────
//
// Called by Settings → AI → Run-now and by the daily cron. Loops enrichInline
// over entries that aren't fully enriched, capped at batchSize per call so
// the function doesn't time out on large brains.

export async function enrichBrain(
  userId: string,
  brainId: string,
  batchSize = 5,
): Promise<{ processed: number; remaining: number }> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=neq.secret&select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=200`,
    { headers: SB_HDR },
  );
  if (!r.ok) return { processed: 0, remaining: 0 };
  const all: Entry[] = await r.json();

  const pending = all.filter((e) => {
    const f = flagsOf(e);
    if (f.embedding_status === "failed") {
      // Embedding is terminal-failed — re-running won't help unless the user
      // explicitly retries. Still surface as not-fully-enriched for the LLM
      // steps if any of those are missing.
      return !f.parsed || !f.has_insight || !f.concepts_extracted;
    }
    return !f.parsed || !f.has_insight || !f.concepts_extracted || !f.embedded;
  });

  const batch = pending.slice(0, batchSize);
  let processed = 0;
  for (const entry of batch) {
    const changed = await enrichInline(entry.id, userId).catch((err: any) => {
      console.error("[enrich:brain] entry failed:", entry.id, err?.message ?? err);
      return false;
    });
    if (changed) processed++;
  }
  return { processed, remaining: pending.length - batch.length };
}

// ── Public: enrichAllBrains (daily cron) ────────────────────────────────────

export async function enrichAllBrains(): Promise<{ brains: number; processed: number }> {
  const r = await fetch(`${SB_URL}/rest/v1/brains?select=id,owner_id`, { headers: SB_HDR });
  if (!r.ok) return { brains: 0, processed: 0 };
  const brains: { id: string; owner_id: string }[] = await r.json();
  let totalProcessed = 0;
  for (const brain of brains) {
    const { processed } = await enrichBrain(brain.owner_id, brain.id, 3).catch(() => ({
      processed: 0,
      remaining: 0,
    }));
    totalProcessed += processed;
  }
  return { brains: brains.length, processed: totalProcessed };
}
