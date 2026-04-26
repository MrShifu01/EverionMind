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
import { extractPersonaFacts } from "./extractPersonaFacts.js";
import {
  generateEmbedding as personaGenerateEmbedding,
  buildEntryText as personaBuildEntryText,
} from "./generateEmbedding.js";
import { randomUUID } from "crypto";

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

async function patchMetadata(
  entryId: string,
  userId: string,
  metadata: Record<string, any>,
  typeChange?: { type: string; tags: string[] } | null,
): Promise<void> {
  const body: Record<string, unknown> = { metadata };
  if (typeChange) {
    body.type = typeChange.type;
    body.tags = typeChange.tags;
  }
  await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { ...SB_HDR, Prefer: "return=minimal" },
      body: JSON.stringify(body),
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
  // LLM returned unparseable / off-shape output. The parse step is best-effort
  // enrichment — for typed entries (todo, event, contact) the client already
  // provided structure, and short/empty content is fine. As long as the entry
  // has a title we mark parsed=true so it isn't stuck pending forever. Without
  // this, a fresh todo with empty content sits with the P chip red until the
  // daily cron and never resolves.
  if (entry.title) {
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
  if (!conceptRaw) return null; // genuine LLM failure — let next pass retry

  // We got *some* response. Mirror the parse-step policy: stamp the flag so
  // the entry isn't stuck pending forever. Only attach concepts when the
  // response actually validates against the schema — unparseable output just
  // means there was nothing to extract for this entry.
  const candidate = parseAIJSON(conceptRaw);
  const parsed = candidate ? ConceptResultSchema.safeParse(candidate) : null;
  return {
    ...meta,
    ...(parsed?.success && parsed.data.concepts.length > 0 ? { concepts: parsed.data.concepts } : {}),
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

// Pgvector column on entries.embedding is fixed at vector(768). Both providers
// must return a 768-dim array — Gemini via outputDimensionality, OpenAI via the
// dimensions param (only valid for text-embedding-3-* models). A length
// mismatch produces a silent PostgREST 400 on the PATCH that writes the
// vector, which leaves embedding_status='pending' forever.
const EMBED_DIM = 768;

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
          outputDimensionality: EMBED_DIM,
        }),
      },
    );
    if (!r.ok) throw new Error(`Gemini embed HTTP ${r.status}: ${await r.text().catch(() => "")}`);
    const d: any = await r.json();
    const values: number[] | undefined = d?.embedding?.values;
    if (!Array.isArray(values)) throw new Error("Gemini embed: missing values");
    if (values.length !== EMBED_DIM) {
      throw new Error(`Gemini embed: got ${values.length} dims, expected ${EMBED_DIM}`);
    }
    return values;
  }
  // OpenAI
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${embed.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: embed.model, input: text, dimensions: EMBED_DIM }),
  });
  if (!r.ok) throw new Error(`OpenAI embed HTTP ${r.status}: ${await r.text().catch(() => "")}`);
  const d: any = await r.json();
  const values: number[] | undefined = d?.data?.[0]?.embedding;
  if (!Array.isArray(values)) throw new Error("OpenAI embed: missing values");
  if (values.length !== EMBED_DIM) {
    throw new Error(`OpenAI embed: got ${values.length} dims, expected ${EMBED_DIM}`);
  }
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
    const r = await fetch(
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
    if (!r.ok) {
      // Without this, a PostgREST 400 (e.g. dim mismatch, RLS reject, schema
      // drift) is swallowed — the response object resolves normally but the
      // row never updates, so embedding_status stays at 'pending' forever.
      throw new Error(`embed PATCH HTTP ${r.status}: ${await r.text().catch(() => "")}`);
    }
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

// ── Step: persona extractor ─────────────────────────────────────────────────
//
// Reads the entry, asks Gemini to pull out 0..N short third-person facts about
// the user, and writes each as a brand-new `type='persona'` row that points
// back to the source via `metadata.derived_from`. The original entry is NEVER
// modified beyond stamping `enrichment.persona_extracted=true` so the step
// never runs twice for the same entry. `metadata.skip_persona === true` on
// the source entry short-circuits the call.
//
// Returns the new working metadata for the source entry (so the caller can
// patch it). The number of new persona rows it created is logged but the
// caller doesn't need it.

async function stepPersonaExtract(
  entry: Entry,
  userId: string,
  brainId: string | null,
): Promise<Record<string, any> | null> {
  const meta = { ...(entry.metadata ?? {}) };
  const enr = (meta.enrichment ?? {}) as Record<string, unknown>;
  if (enr.persona_extracted === true) return null;

  // Persona entries don't extract from themselves.
  if (entry.type === "persona") {
    return { ...meta, enrichment: { ...enr, persona_extracted: true } };
  }
  // Caller asked to skip (chat tool path that already knows what it's writing).
  if (meta.skip_persona === true) {
    const { skip_persona: _omit, ...rest } = meta;
    return { ...rest, enrichment: { ...enr, persona_extracted: true } };
  }

  const facts = await extractPersonaFacts({
    title: entry.title,
    content: entry.content || "",
    type: entry.type || "note",
    tags: entry.tags ?? undefined,
  });

  // Stamp the flag regardless of result — empty extraction is a real answer
  // and we don't want the cron re-asking every night.
  const stampedMeta = { ...meta, enrichment: { ...enr, persona_extracted: true } };

  if (!facts.length || !brainId) return stampedMeta;

  // Resolve the brain id once. We need it to insert the child entries.
  for (const f of facts) {
    try {
      await insertExtractedFact(f, entry, userId, brainId);
    } catch (err: any) {
      console.error("[persona:extract] insert failed", entry.id, err?.message ?? err);
    }
  }
  return stampedMeta;
}

async function insertExtractedFact(
  fact: { fact: string; bucket: string; confidence: number; evidence?: string },
  source: Entry,
  userId: string,
  brainId: string,
): Promise<void> {
  const id = randomUUID();
  const title = fact.fact;
  const content = fact.evidence
    ? `${fact.fact}\n\nFrom: "${fact.evidence}"`
    : fact.fact;

  // Embedding (best-effort — null is OK, daily cron will fill it later).
  let embedding: number[] | null = null;
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (apiKey) {
    try {
      embedding = await personaGenerateEmbedding(
        personaBuildEntryText({ title, content, tags: ["persona", fact.bucket] }),
        apiKey,
      );
    } catch {
      embedding = null;
    }
  }

  const metadata = {
    bucket: fact.bucket,
    status: "active" as const,
    source: "capture",
    confidence: Math.min(1, Math.max(0, fact.confidence)),
    pinned: false,
    evidence_count: 1,
    last_referenced_at: new Date().toISOString(),
    derived_from: [source.id],
  };

  const r = await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: { ...SB_HDR, Prefer: "return=minimal" },
    body: JSON.stringify({
      id,
      user_id: userId,
      brain_id: brainId,
      title: title.slice(0, 200),
      content,
      type: "persona",
      tags: ["persona", fact.bucket],
      metadata,
      embedding: embedding ? `[${embedding.join(",")}]` : null,
      embedding_status: embedding ? "done" : null,
      embedded_at: embedding ? new Date().toISOString() : null,
      embedding_provider: embedding ? "google" : null,
      embedding_model: embedding ? "gemini-embedding-001" : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    throw new Error(`insert HTTP ${r.status}: ${await r.text().catch(() => "")}`);
  }
}

async function fetchBrainIdForEntry(entryId: string): Promise<string | null> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&select=brain_id&limit=1`,
    { headers: SB_HDR },
  );
  if (!r.ok) return null;
  const rows: Array<{ brain_id: string | null }> = await r.json().catch(() => []);
  return rows[0]?.brain_id ?? null;
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
  }

  // Persona extractor — pulls 0..N short facts from the entry and writes them
  // as new type='persona' rows linked back via metadata.derived_from. The
  // source entry's type/tags are NEVER touched; only its metadata is stamped
  // with persona_extracted=true so the step doesn't re-run.
  const brainId = await fetchBrainIdForEntry(entry.id);
  const stamped = await stepPersonaExtract({ ...entry, metadata: workingMeta }, userId, brainId).catch(() => null);
  if (stamped) {
    workingMeta = stamped;
    changed = true;
  }

  if (changed) await patchMetadata(entry.id, userId, workingMeta, null);

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

// ── Public: backfillPersonaForBrain ─────────────────────────────────────────
//
// One-time scan: walk every entry in the brain that hasn't been through the
// persona classifier yet (skipping secrets and entries already typed persona)
// and run ONLY stepPersonaClassify on it. Cheaper than a full enrichBrain
// pass — no parse/insight/concepts/embed work — so we can drain a fresh user's
// 200-entry brain in a few seconds rather than waiting for the daily cron.
//
// Capped per call. The UI loops until remaining=0.

export async function backfillPersonaForBrain(
  userId: string,
  brainId: string,
  batchSize = 50,
): Promise<{ scanned: number; extracted: number; remaining: number }> {
  // Pull every entry in the brain that hasn't been through the new extractor
  // yet. The new flag is `persona_extracted` — separate from the old
  // `persona_classified` flag (which is harmless going forward).
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=neq.secret&type=neq.persona&select=${encodeURIComponent(ENTRY_FIELDS)}&order=created_at.desc&limit=500`,
    { headers: SB_HDR },
  );
  if (!r.ok) return { scanned: 0, extracted: 0, remaining: 0 };
  const all: Entry[] = await r.json();

  const pending = all.filter((e) => {
    const enr = (e.metadata as any)?.enrichment ?? {};
    return enr.persona_extracted !== true;
  });
  const batch = pending.slice(0, batchSize);

  // Count extracted facts by diffing the persona-entry count before and after.
  // Cheaper and more reliable than threading return values through the step.
  const beforeCount = await countPersonaEntries(userId, brainId);

  for (const entry of batch) {
    try {
      const stamped = await stepPersonaExtract(entry, userId, brainId);
      if (stamped) {
        await patchMetadata(entry.id, userId, stamped, null);
      }
    } catch (err: any) {
      console.error("[persona:backfill] entry failed:", entry.id, err?.message ?? err);
    }
  }

  const afterCount = await countPersonaEntries(userId, brainId);
  return {
    scanned: batch.length,
    extracted: Math.max(0, afterCount - beforeCount),
    remaining: Math.max(0, pending.length - batch.length),
  };
}

async function countPersonaEntries(userId: string, brainId: string): Promise<number> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=eq.persona&select=id`,
    { headers: { ...SB_HDR, Prefer: "count=exact" } as Record<string, string> },
  );
  if (!r.ok) return 0;
  // PostgREST returns the count via Content-Range when Prefer:count=exact is set.
  const range = r.headers.get("content-range") || "";
  const m = /\/(\d+)$/.exec(range);
  if (m) return parseInt(m[1]!, 10);
  // Fallback: count the rows we got.
  const rows: any[] = await r.json().catch(() => []);
  return rows.length;
}

// ── Public: revertBackfilledPersonaForBrain ─────────────────────────────────
//
// Cleanup for the first-iteration backfill that flipped whole entries to
// type='persona' instead of extracting short facts. Targets only entries
// the backfill itself created (source='capture' / 'inference' / 'import',
// no derived_from, persona_classified=true) and best-guesses the original
// type from tag and metadata signals so todos go back to schedule, events
// back to calendar, etc. Strips persona-specific metadata fields too.
//
// Idempotent — re-running on an already-cleaned brain finds zero rows.

export async function revertBackfilledPersonaForBrain(
  userId: string,
  brainId: string,
): Promise<{ scanned: number; reverted: number }> {
  // Pull every type='persona' entry in the brain.
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=eq.persona&select=${encodeURIComponent(ENTRY_FIELDS)}&limit=2000`,
    { headers: SB_HDR },
  );
  if (!r.ok) return { scanned: 0, reverted: 0 };
  const all: Entry[] = await r.json();

  // Filter to ones the backfill produced — never touch chat-tool / manual
  // adds, never touch already-extracted child facts (those have derived_from).
  const targets = all.filter((e) => {
    const meta = (e.metadata as any) ?? {};
    if (meta.derived_from) return false;       // a properly-extracted child fact
    if (meta.skip_persona === true) return false;
    const src = String(meta.source || "");
    if (src === "manual" || src === "chat") return false;
    return true;
  });

  let reverted = 0;
  for (const entry of targets) {
    const meta = { ...((entry.metadata as any) ?? {}) };
    const tags = Array.isArray(entry.tags) ? entry.tags : [];

    // Best-guess original type from surviving signals.
    const newType = inferOriginalType(tags, meta);
    // Strip persona tags (the ones we appended).
    const personaTags = new Set(["persona", "identity", "family", "habit", "preference", "event"]);
    const newTags = tags.filter((t) => !personaTags.has(t));

    // Strip persona-specific metadata fields. Keep enrichment flags so we
    // don't re-enrich, but clear persona_classified so the new extractor
    // (which uses persona_extracted) handles it freshly when we re-scan.
    delete meta.bucket;
    delete meta.status;
    delete meta.source;
    delete meta.confidence;
    delete meta.pinned;
    delete meta.evidence_count;
    delete meta.last_referenced_at;
    delete meta.retired_at;
    delete meta.retired_reason;
    delete meta.last_decayed_at;
    if (meta.enrichment) {
      const enr = { ...meta.enrichment };
      delete enr.persona_classified;
      meta.enrichment = enr;
    }

    const ok = await patchEntryFields(entry.id, userId, {
      type: newType,
      tags: newTags,
      metadata: meta,
    });
    if (ok) reverted++;
  }

  return { scanned: targets.length, reverted };
}

// Heuristic — original type was lost when stepPersonaClassify ran, so we
// guess from whatever signals survived. Order matters: the first match wins.
function inferOriginalType(tags: string[], meta: Record<string, any>): string {
  const tagSet = new Set(tags.map((t) => String(t).toLowerCase()));
  if (meta.due_at || meta.due || meta.completed_at !== undefined) return "todo";
  if (meta.starts_at || meta.start || meta.event_at) return "event";
  if (meta.url && /^https?:\/\//.test(String(meta.url))) return "document";
  if (meta.phone || meta.email) return "contact";
  if (meta.amount !== undefined || meta.currency) return "finance";
  if (meta.lat !== undefined || meta.address) return "place";
  if (tagSet.has("todo") || tagSet.has("task")) return "todo";
  if (tagSet.has("event") || tagSet.has("calendar")) return "event";
  if (tagSet.has("recipe")) return "recipe";
  if (tagSet.has("contact") || tagSet.has("person")) return "contact";
  if (tagSet.has("place") || tagSet.has("location")) return "place";
  if (tagSet.has("finance") || tagSet.has("money") || tagSet.has("expense")) return "finance";
  if (tagSet.has("document") || tagSet.has("doc") || tagSet.has("bookmark")) return "document";
  if (tagSet.has("idea")) return "idea";
  if (tagSet.has("decision")) return "decision";
  if (tagSet.has("health")) return "health";
  if (tagSet.has("recipe")) return "recipe";
  return "note";
}

async function patchEntryFields(
  id: string,
  userId: string,
  fields: { type?: string; tags?: string[]; metadata?: Record<string, any> },
): Promise<boolean> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { ...SB_HDR, Prefer: "return=minimal" },
      body: JSON.stringify(fields),
    },
  );
  return r.ok;
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
