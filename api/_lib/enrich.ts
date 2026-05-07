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
import {
  extractPersonaFacts,
  loadExtractorContext,
  type ExtractorContext,
} from "./extractPersonaFacts.js";
import { checkAndConsumeQuota, fetchUserTier } from "./enrichQuota.js";
import { getPersonalBrainId } from "./personalBrain.js";
import {
  generateEmbedding as personaGenerateEmbedding,
  buildEntryText as personaBuildEntryText,
} from "./generateEmbedding.js";
import { sbHeaders } from "./sbHeaders.js";
import { googleAiFetch, googleAiModelUrl } from "./googleAi.js";
import { GEMINI_BULK_MODEL, geminiFallbackChain } from "./geminiModels.js";
import { randomUUID } from "crypto";

const SB_URL = process.env.SUPABASE_URL!;
const SB_HDR = sbHeaders();

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
//
// Phase 3 of the schedule fix: this step used to do `{...meta, ...resultMeta}`
// — AI wins. After capture that's harmless (the user hasn't touched anything
// yet). But the same step also runs on re-enrichment (Settings → AI → Run-now,
// daily cron, brain rescan), which means AI could overwrite a date or status
// the user just set in the UI. That was the source of multiple "I edited X
// and it reverted" reports.
//
// Two guards now:
//   1. USER_OWNED_KEYS are never accepted from AI. These are fields the user
//      controls directly through the UI — completion state and schedule.
//   2. For all other keys, user metadata wins. AI can fill MISSING fields but
//      never overwrite a value the user already set.

// Fields the AI is forbidden from writing under any circumstance. The user
// controls these through the UI; AI re-running over edited entries was
// hallucinating values like status:"open"/"pending"/"in progress".
const USER_OWNED_KEYS = new Set([
  "status",
  "scheduled_for",
  "due_date",
  "deadline",
  "event_date",
  "recurrence",
  "day_of_week",
  "day_of_month",
]);

// ── Shared enrichment input builder ─────────────────────────────────────────
//
// Every LLM step (parse / insight / concepts) and the embedder need to read
// the same superset of "what this entry says." Previously each step pulled
// from entry.content + entry.title only, which was bad for Gmail entries
// where the meat is in metadata.attachment_text (extracted PDF/image text)
// or metadata.full_text (the full email body that got truncated to fit
// content's 400-char cap at scan time). Result: the LLM saw "see attached"
// and produced empty concepts / blank insights.
//
// buildEnrichText concatenates everything semantically meaningful, capped
// at maxLen. Headers (Title:, Content:, Attachment:) keep the LLM aware
// of structure even when fields run together.
function buildEnrichText(
  entry: { title: string; content: string | null; metadata: Record<string, any> | null },
  maxLen = 8000,
): string {
  const meta = entry.metadata ?? {};
  const fullText = typeof meta.full_text === "string" ? meta.full_text : "";
  const attachmentText =
    typeof meta.attachment_text === "string" ? meta.attachment_text : "";

  const parts: string[] = [];
  if (entry.title) parts.push(`Title: ${entry.title}`);
  if (entry.content) parts.push(`Content:\n${entry.content}`);
  // full_text usually mirrors content for short captures but holds the full
  // body for entries where content was truncated. Skip if it's a substring
  // of content to avoid duplication.
  if (fullText && (!entry.content || !entry.content.includes(fullText.slice(0, 100)))) {
    parts.push(`Full text:\n${fullText}`);
  }
  if (attachmentText) parts.push(`Attachment text:\n${attachmentText}`);
  return parts.join("\n\n").slice(0, maxLen);
}

async function stepParse(entry: Entry, cfg: AICall): Promise<Record<string, any> | null> {
  const meta = { ...(entry.metadata ?? {}) };
  // Reads the union of title + content + metadata.full_text + attachment_text
  // so emails where the meat lives in the PDF still get useful structured
  // extraction and aren't classified by their "see attached" body alone.
  const body = buildEnrichText({ ...entry, metadata: meta }, 10000);
  if (!body) return { ...meta, enrichment: { ...(meta.enrichment ?? {}), parsed: true } };

  // Anchor relative dates. Without this header the LLM guesses what "today"
  // means and silently mis-stamps due_date / deadline / event_date. The
  // anchor uses the entry's created_at when present (re-parses pin to the
  // original capture day) and falls back to now for first-time captures.
  const captureDateISO = (() => {
    const c = (entry as { created_at?: string }).created_at;
    if (typeof c === "string" && /^\d{4}-\d{2}-\d{2}/.test(c)) return c.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  })();
  const raw = `Today's date is ${captureDateISO} (the date this entry was captured). Use it ONLY when the entry text uses absolute relative phrases like "today" with no other date context. If the entry has a specific scheduled_for / event_date in its content, words like "today" inside that entry refer to THAT date, not the capture date.\n\n${body}`;

  const aiRaw = await callAI(cfg, SERVER_PROMPTS.CAPTURE, raw, { maxTokens: 1500, json: true });
  if (!aiRaw) return null; // LLM failure — leave the flag unset

  const candidate = parseAIJSON(aiRaw);
  const parsed = candidate ? CaptureResultSchema.safeParse(candidate) : null;
  if (parsed?.success && (parsed.data.type || parsed.data.title || parsed.data.content)) {
    const { confidence: _c, ...rawAIMeta } = parsed.data.metadata ?? {};

    // First parse vs re-parse. The flag `meta.enrichment.parsed` flips to
    // true at the end of this step. On the FIRST pass the user has not
    // touched anything yet, so AI can populate user-owned date fields
    // (scheduled_for, due_date, deadline, event_date) that it extracted
    // from the content. On every subsequent re-parse — cron, daily rescan,
    // settings → Run Now — AI is locked out of those fields entirely so
    // it cannot overwrite a date the user just typed in the UI.
    const isFirstParse = !meta.enrichment?.parsed;

    // Strip user-owned + already-set keys before merging. AI fills in MISSING
    // fields only — it can never overwrite a user-set value, and it can never
    // touch the user-controlled set above on RE-RUNS. On the first parse it
    // may fill those fields if (and only if) they're empty.
    const safeAIMeta: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawAIMeta)) {
      if (USER_OWNED_KEYS.has(k) && !isFirstParse) continue;
      if (meta[k] !== undefined && meta[k] !== null && meta[k] !== "") continue;
      safeAIMeta[k] = v;
    }

    // Date sanity guard — pairwise consistency between extracted fields.
    //
    // The LLM occasionally resolves "today / this week / tomorrow" against
    // the capture date even when the entry has explicit dates in its
    // content, producing internally inconsistent rows like:
    //   scheduled_for=2026-05-24, due_date=2026-05-07
    // We do NOT enforce "all dates must be in the future" — that would
    // strip legitimate past references (missed renewals, anniversaries,
    // historical events). Instead we drop fields that violate ordering
    // rules that are impossible by definition.
    //
    // Picks the candidate value for each field — the AI's value if it
    // landed in safeAIMeta, otherwise the existing meta value. Drops only
    // from safeAIMeta (never blow away user-set data already on meta).
    const dateValue = (k: string): string | null => {
      const fromAI = safeAIMeta[k];
      if (typeof fromAI === "string" && /^\d{4}-\d{2}-\d{2}/.test(fromAI)) return fromAI.slice(0, 10);
      const fromMeta = meta[k];
      if (typeof fromMeta === "string" && /^\d{4}-\d{2}-\d{2}/.test(fromMeta))
        return fromMeta.slice(0, 10);
      return null;
    };
    // Returns true if `field` came from the AI (safe to drop) and is < ref.
    const dropIfBefore = (field: string, refKey: string): boolean => {
      const ref = dateValue(refKey);
      if (!ref) return false;
      const v = safeAIMeta[field];
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return false;
      if (v.slice(0, 10) < ref) {
        delete safeAIMeta[field];
        return true;
      }
      return false;
    };
    // Pairwise rules (impossible-by-definition orderings):
    //   due_date     >= scheduled_for   (can't be due before you start)
    //   deadline     >= scheduled_for   (deadline can't precede the plan)
    //   event_date   >= scheduled_for   (event can't precede its own plan)
    //   deadline     >= due_date        (deadline is the latest commitment)
    //   expiry_date  >= renewal_date    (expiry is when renewal lapses)
    dropIfBefore("due_date", "scheduled_for");
    dropIfBefore("deadline", "scheduled_for");
    dropIfBefore("event_date", "scheduled_for");
    dropIfBefore("deadline", "due_date");
    dropIfBefore("expiry_date", "renewal_date");

    // For Gmail-sourced entries the original content is auto-generated at
    // scan time (cluster-mode: first 400 chars of email body; classifier-
    // mode: one-sentence summary). It's never user-edited, so when the
    // parse LLM produces a richer summary off the full text + attachment,
    // we stamp it as metadata.ai_summary. The card prefers ai_summary
    // over content for source=gmail (see EntryCard) so the user sees
    // the substantive summary instead of "Good day, please find attached."
    const isGmailSource = meta.source === "gmail";
    const llmContent =
      typeof parsed.data.content === "string" ? parsed.data.content.trim() : "";
    if (isGmailSource && llmContent && llmContent.length >= 40) {
      safeAIMeta.ai_summary = llmContent.slice(0, 1500);
    }

    return {
      ...safeAIMeta,
      ...meta,
      // safeAIMeta wrote ai_summary BEFORE the meta spread, so meta wins on
      // every key except keys not yet in meta — but ai_summary isn't in meta
      // yet so it lands. Re-assert here to be explicit and survive future
      // refactors of the order.
      ...(safeAIMeta.ai_summary ? { ai_summary: safeAIMeta.ai_summary } : {}),
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
  // Insight reads the same superset as parse so emails-with-attachments get
  // their attachment text folded in. Cap the body slice tighter than parse
  // (4000 chars) since insight only outputs ~300 tokens — input bloat
  // increases cost for negligible quality gain past ~4k.
  const enrichBody = buildEnrichText({ ...entry, metadata: meta }, 4000);
  const prompt = `<user_entry>\nType: ${entry.type || "note"}${tagStr}\n${enrichBody}\n</user_entry>`;
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
  // Same reasoning as insight — concepts step needs to see attachment text
  // or it can't extract concepts from "Customer Statements / see attached"
  // emails. Capped at 4000 chars to balance signal vs cost.
  const enrichBody = buildEnrichText({ ...entry, metadata: meta }, 4000);
  const conceptPrompt = `Entry ID: ${entry.id}\n<user_entry>\nType: ${entry.type || "note"}\n${enrichBody}\n</user_entry>`;
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
    ...(parsed?.success && parsed.data.concepts.length > 0
      ? { concepts: parsed.data.concepts }
      : {}),
    enrichment: { ...(meta.enrichment ?? {}), concepts_extracted: true },
  };
}

// ── Step: embed ─────────────────────────────────────────────────────────────

interface EmbedConfig {
  provider: "gemini" | "openai";
  apiKey: string;
  model: string;
}

// Pgvector column on entries.embedding is fixed at vector(768). Both providers
// must return a 768-dim array — Gemini via outputDimensionality, OpenAI via the
// dimensions param (only valid for text-embedding-3-* models). A length
// mismatch produces a silent PostgREST 400 on the PATCH that writes the
// vector, which leaves embedding_status='pending' forever.
const EMBED_DIM = 768;

// Retry transient failures (rate limit / service unavailable) before giving
// up — without this, a single 429 from the Gemini free tier permanently
// stamps the entry as embedding_status='failed' (see stepEmbed below).
async function fetchEmbedWithRetry(
  url: string,
  init: RequestInit,
  apiKey?: string,
): Promise<Response> {
  const delays = [500, 1500, 3500];
  for (let i = 0; i <= delays.length; i++) {
    const r = apiKey
      ? await googleAiFetch(apiKey, url, init, 10_000)
      : await fetch(url, init);
    if (r.ok) return r;
    const transient = r.status === 429 || r.status === 503;
    if (!transient || i === delays.length) return r;
    await new Promise((res) => setTimeout(res, delays[i]));
  }
  throw new Error("retry exhausted");
}

async function generateEmbedding(text: string, embed: EmbedConfig): Promise<number[]> {
  if (embed.provider === "gemini") {
    const r = await fetchEmbedWithRetry(
      googleAiModelUrl(embed.model, "embedContent"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${embed.model}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBED_DIM,
        }),
      },
      embed.apiKey,
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
  const r = await fetchEmbedWithRetry("https://api.openai.com/v1/embeddings", {
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
  // Embedding sees the full enrichment input — title + content + full_text +
  // attachment_text — so semantic search can find emails by phrases that
  // only appear in their PDF attachments. Capped at 8000 chars (Gemini
  // embedding-001 native limit is higher but bigger inputs reduce signal
  // density per dimension at the 768-dim truncation we use).
  const text = buildEnrichText(entry, 8000);
  if (!text) {
    // No content to embed — mark done so we don't retry forever.
    await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      headers: { ...SB_HDR, Prefer: "return=minimal" },
      body: JSON.stringify({ embedding_status: "done", embedded_at: new Date().toISOString() }),
    });
    return;
  }
  try {
    const values = await generateEmbedding(text, embed);
    const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      headers: { ...SB_HDR, Prefer: "return=minimal" },
      body: JSON.stringify({
        embedding: `[${values.join(",")}]`,
        embedded_at: new Date().toISOString(),
        embedding_provider: embed.provider === "gemini" ? "google" : "openai",
        embedding_model: embed.model,
        embedding_status: "done",
      }),
    });
    if (!r.ok) {
      // Without this, a PostgREST 400 (e.g. dim mismatch, RLS reject, schema
      // drift) is swallowed — the response object resolves normally but the
      // row never updates, so embedding_status stays at 'pending' forever.
      throw new Error(`embed PATCH HTTP ${r.status}: ${await r.text().catch(() => "")}`);
    }
  } catch (err: any) {
    console.error("[enrich:embed]", err?.message ?? err);
    await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      headers: { ...SB_HDR, Prefer: "return=minimal" },
      body: JSON.stringify({ embedding_status: "failed" }),
    }).catch(() => {});
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

// Cosine threshold for "this fact already exists". Lowered from 0.88 to 0.85
// because the model emits very close paraphrases ("User is the founder of X"
// vs "User is a founder of X") that a tighter threshold lets through. Still
// tight enough to keep "User wakes at 5:30" and "User wakes at 6:00" as
// distinct facts.
const FACT_DEDUP_COSINE = 0.85;

async function stepPersonaExtract(
  entry: Entry,
  userId: string,
  brainId: string | null,
  precomputed: { context: ExtractorContext; dedup: PersonaDedupSet } | null,
): Promise<Record<string, any> | null> {
  const meta = { ...(entry.metadata ?? {}) };
  const enr = (meta.enrichment ?? {}) as Record<string, unknown>;
  if (enr.persona_extracted === true) return null;

  // Persona entries don't extract from themselves.
  if (entry.type === "persona") {
    return { ...meta, enrichment: { ...enr, persona_extracted: true } };
  }
  // Lists are item collections (recipes, products, checklists). Items are
  // intentionally not extracted into persona facts — a "Burgers To Try"
  // list isn't user identity. Stamp the flag so the step doesn't keep
  // re-running.
  if (entry.type === "list") {
    return { ...meta, enrichment: { ...enr, persona_extracted: true } };
  }
  // Caller asked to skip (chat tool path that already knows what it's writing).
  if (meta.skip_persona === true) {
    const { skip_persona: _omit, ...rest } = meta;
    return { ...rest, enrichment: { ...enr, persona_extracted: true } };
  }

  // Persona facts always land in the personal brain. Resolve that boundary
  // before loading context so shared-brain captures dedup against the user's
  // real confirmed/rejected profile rather than the source brain's slice.
  const personalBrainId = (await getPersonalBrainId(userId)) ?? brainId;

  // Identity context — either supplied by the caller (batch path) or
  // resolved per-entry (single-entry path). Without this, the extractor
  // can't tell whether a name in the entry refers to the user or someone
  // else, and rephrases everyone's facts as "User…".
  const ctx = precomputed?.context ?? (await loadExtractorContext(userId, personalBrainId));

  const facts = await extractPersonaFacts({
    title: entry.title,
    content: entry.content || "",
    type: entry.type || "note",
    tags: entry.tags ?? undefined,
    context: ctx,
  });

  // Always stamp the flag — empty extraction is a real answer.
  const stampedMeta = { ...meta, enrichment: { ...enr, persona_extracted: true } };
  if (!facts.length) return stampedMeta;

  // Persona facts ALWAYS land in the user's personal brain, regardless of
  // which brain the source entry came from. Without this, capturing in a
  // shared brain fragments the user's identity across brains AND leaks
  // private facts ("user's wife is Sarah") into a brain other people can
  // read. The personal brain is the privacy boundary for identity context.
  if (!personalBrainId) return stampedMeta; // no personal brain yet — skip silently

  // Dedup set for inline duplicate refusal. Scoped to the personal brain
  // so the user's full persona dedups against itself, not against the
  // shared brain's slice (which would only see the source-brain facts
  // and let duplicates land in the personal brain).
  //
  // CRITICAL: share the SAME set references across all entries in a batch.
  // We push newly-inserted facts (embedding AND normalized title) to them
  // as we go, so the next entry's dedup check sees them. A spread copy here
  // would silently break dedup across entries — every "User runs Smash
  // Burger Bar" emitted by a different source entry would slip through.
  const dedup: PersonaDedupSet =
    precomputed?.dedup ?? (await fetchPersonaDedupSet(userId, personalBrainId));

  for (const f of facts) {
    try {
      const inserted = await insertExtractedFactDeduped(f, entry, userId, personalBrainId, dedup);
      if (inserted) {
        dedup.embeddings.push(inserted.embedding);
        dedup.titles.add(inserted.title);
      }
    } catch (err: any) {
      console.error("[persona:extract] insert failed", entry.id, err?.message ?? err);
    }
  }
  return stampedMeta;
}

async function insertExtractedFactDeduped(
  fact: { fact: string; bucket: string; confidence: number; evidence?: string },
  source: Entry,
  userId: string,
  brainId: string,
  dedup: PersonaDedupSet,
): Promise<{ embedding: number[]; title: string } | null> {
  const id = randomUUID();
  const title = fact.fact;
  const content = fact.evidence ? `${fact.fact}\n\nFrom: "${fact.evidence}"` : fact.fact;

  // Title-based fast-path. Catches word-for-word repeats even when the
  // existing fact's embedding is missing (gen failed last time). Cheap —
  // no embedding call at all if we already know it's a dup by title.
  const normTitle = normalizeTitle(title);
  if (dedup.titles.has(normTitle)) return null;

  // Generate the new fact's embedding first — we need it for dedup either
  // way. If the API key is missing we skip the dedup check (and embedding).
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

  // Dedup against existing facts via cosine. Catches "User works at Smash
  // Burger Bar" vs "User runs Smash Burger Bar" — title-equality misses
  // those but cosine doesn't.
  if (embedding && dedup.embeddings.length) {
    for (const ev of dedup.embeddings) {
      if (cosineSim(embedding, ev) >= FACT_DEDUP_COSINE) {
        return null; // duplicate — skip insert
      }
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
  // Even if embedding was null, hand back the title so the caller can add
  // it to the in-memory dedup set — same-batch repeats get caught by the
  // fast-path on the next insert.
  return { embedding: embedding ?? [], title: normTitle };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export interface PersonaDedupSet {
  embeddings: number[][];
  titles: Set<string>; // normalized — lowercase, trimmed, collapsed whitespace
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.…]+$/g, "") // trailing periods / ellipsis
    .replace(/\s+/g, " ");
}

// Pulls everything we need to refuse a duplicate insert. Includes ALL non-
// deleted persona facts regardless of status:
//   - active: obvious
//   - fading: still searchable; user could rescue, don't re-extract
//   - archived (history): user said "no longer true" — don't resurrect
//   - rejected (Not me): user said "not who I am" — definitely don't re-extract
// Title set is a fallback for facts whose embedding generation failed; on
// a word-for-word repeat it's the only thing that catches the dupe.
async function fetchPersonaDedupSet(userId: string, brainId: string): Promise<PersonaDedupSet> {
  const empty: PersonaDedupSet = { embeddings: [], titles: new Set() };
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&type=eq.persona&deleted_at=is.null&select=title,embedding&limit=1000`,
    { headers: SB_HDR },
  );
  if (!r.ok) return empty;
  const rows: Array<{ title: string | null; embedding: string | number[] | null }> = await r
    .json()
    .catch(() => []);
  const embeddings: number[][] = [];
  const titles = new Set<string>();
  for (const row of rows) {
    const v = parseEmbedding(row.embedding);
    if (v.length) embeddings.push(v);
    if (row.title) titles.add(normalizeTitle(row.title));
  }
  return { embeddings, titles };
}

function parseEmbedding(raw: number[] | string | null): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
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

// ── State helpers ──────────────────────────────────────────────────────────
//
// Phase 2A introduced enrichment_state on entries. These small helpers keep
// the state column converged with the underlying flags so the worker query
// (claim_pending_enrichments) only ever sees rows that genuinely need work.
// Failures are swallowed — state is observable, not load-bearing for the
// LLM pipeline itself.

async function setEnrichmentState(
  entryId: string,
  state: "processing" | "done" | "failed" | "quota_exceeded" | "pending",
): Promise<void> {
  const body: Record<string, unknown> = { enrichment_state: state };
  // Stamp / clear the lock timestamp so stale claims are recoverable. A
  // 'processing' row with a fresh locked_at is owned; a 'pending' /
  // 'done' / 'failed' row is unowned.
  body.enrichment_locked_at = state === "processing" ? new Date().toISOString() : null;
  try {
    await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}`, {
      method: "PATCH",
      headers: { ...SB_HDR, Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[enrich:set-state]", entryId, state, err);
  }
}

async function recomputeEnrichmentState(entryIds: string[]): Promise<void> {
  if (!entryIds.length) return;
  try {
    await fetch(`${SB_URL}/rest/v1/rpc/recompute_enrichment_state`, {
      method: "POST",
      headers: SB_HDR,
      body: JSON.stringify({ p_ids: entryIds }),
    });
  } catch (err) {
    console.error("[enrich:recompute-state]", err);
  }
}

// ── Public: enrichInline ────────────────────────────────────────────────────
//
// Awaited from capture and any other entry-creation site. Runs every step
// whose flag isn't already true. Returns true if anything changed.

export async function enrichInline(
  entryId: string,
  userId: string,
  opts: { skipEmbed?: boolean } = {},
): Promise<boolean> {
  let entry = await fetchEntry(entryId, userId);
  if (!entry) return false;
  if (entry.type === "secret") {
    // Secrets bypass enrichment entirely — keep state consistent with
    // backfill so the worker doesn't re-claim them next sweep.
    await setEnrichmentState(entryId, "done");
    return false;
  }

  // Quick exit if everything's already done. Belt-and-braces converge of
  // state column with reality — covers entries that completed via direct
  // PATCHes outside this function (e.g. legacy code paths). Avoids
  // consuming a quota credit for a no-op.
  const earlyFlags = flagsOf(entry);
  const earlyAllDone =
    earlyFlags.parsed &&
    earlyFlags.has_insight &&
    earlyFlags.concepts_extracted &&
    earlyFlags.embedded;
  if (earlyAllDone) {
    await setEnrichmentState(entryId, "done");
    return false;
  }

  // No-provider gate. Free-tier users without a BYOK key resolve to
  // null here — no LLM enrichment is possible right now. Leave the row
  // at enrichment_state='pending' and bail WITHOUT running any step.
  // Critically: don't bump the attempts counter. recompute_enrichment_state
  // flips to 'failed' once attempts >= 5, which would lock the row out
  // of future cron sweeps even after the user upgrades. By doing nothing,
  // the row sits patient and gets enriched the next sweep after a tier
  // change or a BYOK key is added.
  const earlyProvider = await resolveProviderForUser(userId).catch(() => null);
  if (!earlyProvider) {
    await setEnrichmentState(entryId, "pending");
    return false;
  }

  // Quota gate — every entry that's about to run LLM steps consumes one
  // daily credit. Persona-typed entries bail through flagsOf and don't
  // reach the LLM block, so they're exempt. Pro/max tiers are unlimited
  // (-1 sentinel inside checkAndConsumeQuota). Failure mode is fail-OPEN
  // (see enrichQuota.ts) — a Supabase blip can't freeze the pipeline.
  if (entry.type !== "persona") {
    const tier = await fetchUserTier(userId);
    const quota = await checkAndConsumeQuota(userId, tier);
    if (!quota.allowed) {
      if (quota.errored) {
        console.warn(
          `[enrich:quota] ${userId} quota check unavailable — entry ${entryId} left pending`,
        );
        await setEnrichmentState(entryId, "pending");
        return false;
      }
      console.warn(
        `[enrich:quota] ${userId} blocked at ${quota.used}/${quota.limit} daily — entry ${entryId} marked quota_exceeded`,
      );
      await setEnrichmentState(entryId, "quota_exceeded");
      return false;
    }
  }

  // Stamp 'processing' + locked_at so concurrent workers SKIP LOCKED past
  // this row. recompute below rewrites it to a final state.
  await setEnrichmentState(entryId, "processing");

  // Gmail safety net: if this is a Gmail entry with attachments listed but
  // attachment_text not yet extracted, pull it first. Means the LLM steps
  // below see the full text. Belt-and-braces — covers entries that were
  // auto-accepted at scan time but had their fire-and-forget extract call
  // killed by Vercel, AND historical entries imported before extraction
  // was wired up. Idempotent — extractGmailAttachmentsForEntry short-
  // circuits when attachment_text is already present.
  const needsGmailExtract =
    entry.metadata?.source === "gmail" &&
    typeof entry.metadata?.gmail_message_id === "string" &&
    Array.isArray(entry.metadata?.attachments) &&
    entry.metadata.attachments.length > 0 &&
    (typeof entry.metadata?.attachment_text !== "string" ||
      entry.metadata.attachment_text.length === 0);
  if (needsGmailExtract) {
    try {
      const mod = await import("./gmailScan.js");
      await mod.extractGmailAttachmentsForEntry(entryId, userId);
      // Re-fetch so workingMeta below sees the new attachment_text. Without
      // this the LLM steps would still operate on the pre-extract metadata.
      const refreshed = await fetchEntry(entryId, userId);
      if (refreshed) entry = refreshed;
    } catch (err: any) {
      console.error(
        "[enrich:gmail-extract]",
        entryId,
        String(err?.message ?? err).slice(0, 200),
      );
    }
  }

  const flags = flagsOf(entry);
  let changed = false;
  let workingMeta = entry.metadata ?? {};
  // Track per-run failures so a thrown step still leaves a breadcrumb on the
  // entry (last_error + attempts). Without this a transient 429 looks like
  // "nothing ever happened" — the diagnostic UI can't distinguish "haven't
  // tried" from "tried and crashed silently."
  const stepErrors: string[] = [];
  // Steps that ran but returned null cleanly (e.g. callAI returned "" on
  // a 401 from an invalid Anthropic key — see CLAUDE.md). These produce
  // no metadata change AND no thrown error, so without this list the
  // entry would look like "never attempted" in the diagnostic UI. We log
  // them as silent skips so an admin can spot the pattern.
  const stepSilentSkips: string[] = [];
  const runStep = async (
    name: string,
    fn: () => Promise<Record<string, any> | null>,
  ): Promise<void> => {
    try {
      const next = await fn();
      if (next) {
        workingMeta = next;
        changed = true;
      } else {
        stepSilentSkips.push(name);
      }
    } catch (err: any) {
      const msg = String(err?.message ?? err).slice(0, 200);
      stepErrors.push(`${name}: ${msg}`);
      console.error(`[enrich:${name}]`, entryId, msg);
    }
  };

  // Reuse the provider resolved at the top of the function — the
  // no-provider early-bail above guarantees earlyProvider is non-null
  // here, so we never re-resolve.
  const llmCfg = earlyProvider;
  if (!flags.parsed) {
    await runStep("parse", () => stepParse({ ...entry, metadata: workingMeta }, llmCfg));
  }
  if (!flags.has_insight) {
    await runStep("insight", () => stepInsight({ ...entry, metadata: workingMeta }, llmCfg));
  }
  if (!flags.concepts_extracted) {
    await runStep("concepts", () => stepConcepts({ ...entry, metadata: workingMeta }, llmCfg));
  }

  // Persona extractor — pulls 0..N short facts from the entry and writes them
  // as new type='persona' rows linked back via metadata.derived_from. The
  // source entry's type/tags are NEVER touched; only its metadata is stamped
  // with persona_extracted=true so the step doesn't re-run.
  const brainId = await fetchBrainIdForEntry(entry.id).catch((err: any) => {
    stepErrors.push(`fetch-brain: ${String(err?.message ?? err).slice(0, 200)}`);
    return null as string | null;
  });
  if (brainId) {
    await runStep("persona", () =>
      stepPersonaExtract({ ...entry, metadata: workingMeta }, userId, brainId, null),
    );
  }

  // Stamp per-run breadcrumbs even if no step succeeded — without this an
  // entry that 429'd on every step would look like "nothing ever happened"
  // in the diagnostic UI. attempts is a running counter; last_error is the
  // joined messages from this run's failures (capped to keep metadata small).
  // Silent skips (callAI returned "" on auth failure / refusal) record
  // last_attempt_at + last_skip_reason so the diagnostic shows "we tried,
  // got nothing back" — distinct from "never tried."
  if (stepErrors.length > 0 || stepSilentSkips.length > 0) {
    const prevEnr = (workingMeta as any).enrichment ?? {};
    const errorMsg = stepErrors.join(" · ").slice(0, 500);
    const skipMsg =
      stepSilentSkips.length > 0
        ? `silent skip: ${stepSilentSkips.join(",")}`.slice(0, 200)
        : null;
    workingMeta = {
      ...workingMeta,
      enrichment: {
        ...prevEnr,
        attempts: ((prevEnr.attempts as number | undefined) ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_error: errorMsg || prevEnr.last_error || null,
        last_skip_reason: skipMsg || prevEnr.last_skip_reason || null,
      },
    };
    changed = true;
  } else if (changed) {
    // Successful run — clear any previous error so the entry isn't tagged
    // with stale failure context after recovering.
    const prevEnr = (workingMeta as any).enrichment ?? {};
    if (prevEnr.last_error) {
      workingMeta = {
        ...workingMeta,
        enrichment: {
          ...prevEnr,
          last_error: null,
          last_attempt_at: new Date().toISOString(),
        },
      };
    }
  }

  if (changed) await patchMetadata(entry.id, userId, workingMeta, null);

  // Embedding is independent of the LLM provider. Cron callers pass
  // skipEmbed=true so the per-row PATCH is deferred to bulkEmbedBatch
  // (one UPDATE...FROM per chunk via bulk_apply_embeddings RPC).
  if (!opts.skipEmbed && !flags.embedded && flags.embedding_status !== "failed") {
    const embedCfg = await resolveEmbedProviderForUser(userId).catch(() => null);
    if (embedCfg) {
      try {
        await stepEmbed({ ...entry, metadata: workingMeta }, embedCfg);
        changed = true;
      } catch (err: any) {
        console.error(`[enrich:embed]`, entryId, String(err?.message ?? err).slice(0, 200));
      }
    }
  }

  // Converge enrichment_state with what's actually on the row now. Picks
  // 'done' if every flag is green, 'failed' if attempts >= 5, 'pending'
  // otherwise. The cron-path (skipEmbed=true) intentionally lands at
  // 'pending' here — bulkEmbedBatch's caller (enrichBrain) calls
  // recompute again after the bulk embed finishes to flip them to 'done'.
  await recomputeEnrichmentState([entryId]);

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
  batchSize = 50,
  timeBudgetMs = 240_000,
): Promise<{ processed: number; remaining: number }> {
  // Phase 2A: claim work via the queue RPC. Atomically marks up to
  // batchSize rows as 'processing' (with locked_at = now) and returns
  // their IDs, FOR UPDATE SKIP LOCKED so concurrent workers don't fight.
  // Stale 'processing' rows (locked >5min) are reclaimed automatically.
  // 'failed' / 'quota_exceeded' / 'done' rows are NOT claimed —
  // recompute_enrichment_state transitions them on each pass.
  let claimedIds: string[] = [];
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/claim_pending_enrichments`, {
      method: "POST",
      headers: SB_HDR,
      body: JSON.stringify({
        p_user_id: userId,
        p_brain_id: brainId,
        p_limit: batchSize,
      }),
    });
    if (r.ok) {
      const rows: Array<string | { claim_pending_enrichments: string }> = await r
        .json()
        .catch(() => []);
      claimedIds = rows
        .map((row) =>
          typeof row === "string" ? row : (row as { claim_pending_enrichments?: string })
              .claim_pending_enrichments ?? "",
        )
        .filter((id): id is string => typeof id === "string" && id.length > 0);
    } else {
      console.error(`[enrich:brain:claim] HTTP ${r.status}`);
    }
  } catch (err: any) {
    console.error("[enrich:brain:claim]", err?.message ?? err);
  }
  if (!claimedIds.length) return { processed: 0, remaining: 0 };

  // Hydrate the claimed rows in a single round-trip. Worker doesn't need
  // to handle "row deleted between claim and fetch" — soft delete just
  // means enrichInline below will return false harmlessly.
  const idList = claimedIds.map((id) => encodeURIComponent(id)).join(",");
  const hydrateRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=in.(${idList})&select=${encodeURIComponent(ENTRY_FIELDS)}`,
    { headers: SB_HDR },
  );
  const batch: Entry[] = hydrateRes.ok ? await hydrateRes.json().catch(() => []) : [];

  // Time-budget guard: metadata enrichInline does up to 4 LLM calls per
  // entry, so a 50-entry batch can chew through real wallclock. Bail out
  // before the function-level timeout (Vercel max 300s) so the cron's
  // other steps — Gmail scan, persona decay, admin push — still run.
  const deadline = Date.now() + timeBudgetMs;

  // Pass 1: metadata enrichment, one entry at a time. skipEmbed defers
  // the embedding write to the bulk path below — preserves per-step
  // retry semantics for parse/insight/concepts/persona while removing
  // the per-row UPDATE that was burning disk I/O.
  let processed = 0;
  let stoppedEarly = false;
  for (const entry of batch) {
    if (Date.now() > deadline) {
      stoppedEarly = true;
      break;
    }
    const changed = await enrichInline(entry.id, userId, { skipEmbed: true }).catch((err: any) => {
      console.error("[enrich:brain] entry failed:", entry.id, err?.message ?? err);
      return false;
    });
    if (changed) processed++;
  }

  // Pass 2: bulk-embed every entry that still needs an embedding.
  // Parallel compute (concurrency 5), single bulk RPC per chunk of 100.
  // One UPDATE...FROM transaction replaces N serial PostgREST PATCHes —
  // this is the pg_stat_statements 2026-05-04 fix.
  if (!stoppedEarly && Date.now() <= deadline) {
    const needEmbed = batch.filter((e) => {
      const f = flagsOf(e);
      return !f.embedded && f.embedding_status !== "failed";
    });
    await bulkEmbedBatch(needEmbed, userId).catch((err: any) => {
      console.error("[enrich:brain] bulk embed failed:", err?.message ?? err);
    });
  }

  // Final state convergence: now that LLM steps + embedding have run for
  // this batch, recompute_enrichment_state inspects the row state and
  // flips each entry to 'done' (all flags green), 'failed' (>= 5
  // attempts), or leaves at 'pending' for the next sweep.
  await recomputeEnrichmentState(claimedIds);

  // claimedIds is the universe we tried to drain; processed counts the
  // entries enrichInline reported as changed. remaining is best-effort
  // (enrichInline may have flipped some 'pending' → 'done' which we
  // can't see without a re-query). The cron framework just uses this
  // for logging; precise accuracy isn't load-bearing.
  const remaining = stoppedEarly ? claimedIds.length - processed : 0;
  return { processed, remaining };
}

// ── Bulk embed (cron path) ──────────────────────────────────────────────────
//
// Replaces the per-row PATCH in stepEmbed with: parallel-compute embeddings
// for the whole batch, then one bulk RPC call to persist. The single-entry
// stepEmbed path is still used by enrichInline when called from capture /
// llm / mcp / v1 (one-off entries), where bulk would be over-engineering.

const BULK_EMBED_CONCURRENCY = 5;
const BULK_EMBED_RPC_CHUNK = 100;

interface EmbedResult {
  id: string;
  kind: "ok" | "empty" | "failed";
  values?: number[];
}

async function bulkEmbedBatch(entries: Entry[], userId: string): Promise<void> {
  if (!entries.length) return;
  const embedCfg = await resolveEmbedProviderForUser(userId).catch(() => null);
  if (!embedCfg) return;

  // Bounded-concurrency parallel compute. Gemini free tier is 60 RPM —
  // concurrency 5 leaves headroom for capture-path single embeds running
  // alongside, and is conservative enough that retries don't compound.
  const results = await mapWithConcurrency<Entry, EmbedResult>(
    entries,
    BULK_EMBED_CONCURRENCY,
    async (entry): Promise<EmbedResult> => {
      // Same text-builder as the single-entry stepEmbed so search treats
      // both paths consistently. Includes attachment_text and full_text
      // when available.
      const text = buildEnrichText(entry, 8000);
      if (!text) return { id: entry.id, kind: "empty" };
      try {
        const values = await generateEmbedding(text, embedCfg);
        return { id: entry.id, kind: "ok", values };
      } catch (err: any) {
        console.error("[bulk-embed]", entry.id, String(err?.message ?? err).slice(0, 200));
        return { id: entry.id, kind: "failed" };
      }
    },
  );

  const ts = new Date().toISOString();
  const provider = embedCfg.provider === "gemini" ? "google" : "openai";

  // Successes — bulk RPC in chunks of BULK_EMBED_RPC_CHUNK. Keeps the
  // JSON payload bounded (each row ships 768 floats as text ≈ 6 KB).
  const okRows = results
    .filter((r): r is EmbedResult & { kind: "ok"; values: number[] } => r.kind === "ok")
    .map((r) => ({
      id: r.id,
      embedding: `[${r.values.join(",")}]`,
      embedded_at: ts,
      embedding_provider: provider,
      embedding_model: embedCfg.model,
      embedding_status: "done",
    }));
  for (let i = 0; i < okRows.length; i += BULK_EMBED_RPC_CHUNK) {
    await callBulkApplyEmbeddings(okRows.slice(i, i + BULK_EMBED_RPC_CHUNK));
  }

  // Empty content — mark done so the cron doesn't keep re-fetching them.
  const emptyIds = results.filter((r) => r.kind === "empty").map((r) => r.id);
  if (emptyIds.length) {
    await markEmbeddingStatus(emptyIds, { embedding_status: "done", embedded_at: ts });
  }

  // Hard failures — single bulk PATCH to set status='failed' so the next
  // pass skips them. Mirrors the per-row stepEmbed catch path.
  const failedIds = results.filter((r) => r.kind === "failed").map((r) => r.id);
  if (failedIds.length) {
    await markEmbeddingStatus(failedIds, { embedding_status: "failed" });
  }
}

async function callBulkApplyEmbeddings(
  rows: Array<{
    id: string;
    embedding: string;
    embedded_at: string;
    embedding_provider: string;
    embedding_model: string;
    embedding_status: string;
  }>,
): Promise<void> {
  if (!rows.length) return;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/bulk_apply_embeddings`, {
    method: "POST",
    headers: SB_HDR,
    body: JSON.stringify({ rows }),
  });
  if (!r.ok) {
    console.error(
      `[bulk-embed] RPC HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`,
    );
  }
}

async function markEmbeddingStatus(
  ids: string[],
  fields: { embedding_status: string; embedded_at?: string },
): Promise<void> {
  if (!ids.length) return;
  const idList = ids.map((id) => encodeURIComponent(id)).join(",");
  await fetch(`${SB_URL}/rest/v1/entries?id=in.(${idList})`, {
    method: "PATCH",
    headers: { ...SB_HDR, Prefer: "return=minimal" },
    body: JSON.stringify(fields),
  }).catch(() => {});
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const n = Math.max(1, Math.min(concurrency, items.length));
  const workers: Promise<void>[] = [];
  for (let w = 0; w < n; w++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= items.length) return;
          out[idx] = await fn(items[idx]!);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return out;
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

  // Load identity context + dedup set ONCE for the whole batch — both
  // are stable across entries. The same `dedup` set is reused inside the
  // step and accumulates new inserts so duplicates within this batch are
  // caught even before they hit the database.
  const context = await loadExtractorContext(userId, brainId);
  const dedup = await fetchPersonaDedupSet(userId, brainId);
  const precomputed = { context, dedup };

  for (const entry of batch) {
    try {
      const stamped = await stepPersonaExtract(entry, userId, brainId, precomputed);
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
    if (meta.derived_from) return false; // a properly-extracted child fact
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

// ── Public: wipeExtractedPersonaForBrain ────────────────────────────────────
//
// Hard-deletes auto-extracted persona child entries (the ones produced by
// stepPersonaExtract — they have metadata.derived_from set and source in
// (capture, inference, import)) AND clears enrichment.persona_extracted from
// every non-persona entry in the brain so the next scan re-processes them
// from scratch with the (presumably updated) extractor.
//
// Manually-added (source='manual' / skip_persona=true) and chat-tool
// (source='chat') facts are NEVER touched.

export async function wipeExtractedPersonaForBrain(
  userId: string,
  brainId: string,
): Promise<{ deleted: number; cleared: number }> {
  // 1. Find all persona entries in this brain that came from the auto extractor.
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=eq.persona&select=id,metadata&limit=2000`,
    { headers: SB_HDR },
  );
  if (!r.ok) return { deleted: 0, cleared: 0 };
  const all: Array<{ id: string; metadata: any }> = await r.json();

  const targets = all.filter((e) => {
    const meta = e.metadata ?? {};
    if (!meta.derived_from) return false;
    if (meta.skip_persona === true) return false;
    const src = String(meta.source || "");
    if (src === "manual" || src === "chat") return false;
    return true;
  });

  let deleted = 0;
  for (const t of targets) {
    const dr = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(t.id)}&user_id=eq.${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: { ...SB_HDR, Prefer: "return=minimal" } },
    );
    if (dr.ok) deleted++;
  }

  // 2. Clear `persona_extracted` from every non-persona entry so the next scan
  //    rerun under the updated extractor processes them again. We pull only
  //    the ones currently flagged to keep the patch volume small.
  const fr = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&type=neq.persona&select=id,metadata&limit=2000`,
    { headers: SB_HDR },
  );
  if (!fr.ok) return { deleted, cleared: 0 };
  const sources: Array<{ id: string; metadata: any }> = await fr.json();
  const flagged = sources.filter((e) => e.metadata?.enrichment?.persona_extracted === true);

  let cleared = 0;
  for (const s of flagged) {
    const meta = { ...(s.metadata ?? {}) };
    const enr = { ...(meta.enrichment ?? {}) };
    delete enr.persona_extracted;
    meta.enrichment = enr;
    const ok = await patchEntryFields(s.id, userId, { metadata: meta });
    if (ok) cleared++;
  }

  return { deleted, cleared };
}

// ── Public: auditPersonaForBrain ────────────────────────────────────────────
//
// Re-evaluates every active auto-extracted persona fact against the user's
// CURRENT prompt rules and bulk-rejects ones that:
//   1. Duplicate another active fact (cosine ≥ 0.85 or normalized title match)
//   2. Match a previously-rejected pattern (cosine ≥ 0.85 vs rejected pool)
//   3. Are already covered by the user's About-You text (cosine ≥ 0.72)
//
// Pinned facts and user-confirmed sources (manual / chat / skip_persona)
// are NEVER touched. Rejection is reversible — the user can un-reject from
// the "Not me" section if the audit was wrong.
//
// Why audit instead of re-running scan: scan only adds. Audit reviews what's
// already there using context that wasn't available when those facts were
// first extracted (the user's later rejections, an updated About-You).

const AUDIT_DUP_COSINE = 0.85;
const AUDIT_REJECTED_COSINE = 0.85;
const AUDIT_CORE_COSINE = 0.72;

interface AuditResult {
  scanned: number;
  rejected_duplicates: number;
  rejected_pattern: number;
  rejected_core: number;
  rejected_rules: number;
  kept: number;
}

interface AuditRow {
  id: string;
  title: string;
  metadata: Record<string, any> | null;
  embedding: string | number[] | null;
  created_at: string;
}

export async function auditPersonaForBrain(userId: string, brainId: string): Promise<AuditResult> {
  const out: AuditResult = {
    scanned: 0,
    rejected_duplicates: 0,
    rejected_pattern: 0,
    rejected_core: 0,
    rejected_rules: 0,
    kept: 0,
  };

  // Pull active persona facts in this brain.
  const ar = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&type=eq.persona&deleted_at=is.null&metadata->>status=eq.active&select=id,title,metadata,embedding,created_at&limit=1000`,
    { headers: SB_HDR },
  );
  if (!ar.ok) return out;
  const active: AuditRow[] = await ar.json();
  out.scanned = active.length;
  if (!active.length) return out;

  // Pull rejected facts (with embeddings) — the model of what user said is "not me".
  const rr = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&type=eq.persona&deleted_at=is.null&metadata->>status=eq.rejected&select=embedding&limit=500`,
    { headers: SB_HDR },
  );
  const rejectedEmbeds: number[][] = [];
  if (rr.ok) {
    const rows: Array<{ embedding: string | number[] | null }> = await rr.json().catch(() => []);
    for (const row of rows) {
      const v = parseEmbedding(row.embedding);
      if (v.length) rejectedEmbeds.push(v);
    }
  }

  // Pull core profile + embed it. About-You is plain text; embed once.
  const cr = await fetch(
    `${SB_URL}/rest/v1/user_personas?user_id=eq.${encodeURIComponent(userId)}&select=context&limit=1`,
    { headers: SB_HDR },
  );
  let coreEmbed: number[] | null = null;
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (cr.ok && apiKey) {
    const rows = (await cr.json().catch(() => [])) as Array<{ context: string | null }>;
    const text = (rows[0]?.context || "").trim();
    if (text) {
      try {
        coreEmbed = await personaGenerateEmbedding(
          personaBuildEntryText({ title: "About you", content: text, tags: ["persona"] }),
          apiKey,
        );
      } catch {
        coreEmbed = null;
      }
    }
  }

  // ── Protected facts ─────────────────────────────────────────────────────
  // Anything the user explicitly created or kept must never be removed by
  // the audit, even when two of them look "similar" (e.g. a Father and a
  // Brother who share a name — same embedding, different person, both real).
  // Manual/chat sources, pinned facts, and skip_persona-marked rows are all
  // off-limits.
  const isProtected = (row: AuditRow): boolean => {
    const m = row.metadata ?? {};
    if (m.pinned === true) return true;
    if (m.skip_persona === true) return true;
    const src = String(m.source || "");
    return src === "manual" || src === "chat";
  };

  // Phase 1: dedup within the active set itself. Two facts that look like
  // each other → keep the one with higher confidence (or pinned, or older).
  // Protected facts are seeded into the winner pool first so they CAN be
  // the canonical winner that auto-extracted dups dedupe against, but they
  // can NEVER be the loser themselves.
  const sorted = [...active].sort((a, b) => {
    const aProt = isProtected(a) ? 1 : 0;
    const bProt = isProtected(b) ? 1 : 0;
    if (aProt !== bProt) return bProt - aProt;
    const ap = a.metadata?.pinned ? 1 : 0;
    const bp = b.metadata?.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const ac = (a.metadata?.confidence as number) ?? 0.5;
    const bc = (b.metadata?.confidence as number) ?? 0.5;
    if (ac !== bc) return bc - ac;
    return a.created_at.localeCompare(b.created_at);
  });

  const winners: AuditRow[] = [];
  const winnerEmbeds: number[][] = [];
  const winnerTitles = new Set<string>();
  const dupTargets = new Set<string>(); // ids to reject as duplicates

  for (const row of sorted) {
    const title = row.title || "";
    const norm = title
      .toLowerCase()
      .trim()
      .replace(/[.…]+$/g, "")
      .replace(/\s+/g, " ");
    const embed = parseEmbedding(row.embedding);

    // Protected rows always win. They're added to the winner pool so
    // similar AUTO-extracted facts can still be deduped against them,
    // but they themselves are never marked as duplicates.
    if (isProtected(row)) {
      winners.push(row);
      winnerTitles.add(norm);
      if (embed.length) winnerEmbeds.push(embed);
      continue;
    }

    let isDup = false;
    if (winnerTitles.has(norm)) {
      isDup = true;
    } else if (embed.length) {
      for (const w of winnerEmbeds) {
        if (cosineSim(embed, w) >= AUDIT_DUP_COSINE) {
          isDup = true;
          break;
        }
      }
    }

    if (isDup) {
      dupTargets.add(row.id);
    } else {
      winners.push(row);
      winnerTitles.add(norm);
      if (embed.length) winnerEmbeds.push(embed);
    }
  }

  // Phase 2 + 3: for each surviving "winner", check vs rejected pool and
  // vs core profile. Pinned facts skip both — user explicitly kept them.
  const rejectByPattern = new Set<string>();
  const rejectByCore = new Set<string>();
  for (const row of winners) {
    if (row.metadata?.pinned === true) continue;
    const src = String(row.metadata?.source || "");
    // User-confirmed entries are off-limits.
    if (src === "manual" || src === "chat") continue;
    if (row.metadata?.skip_persona === true) continue;

    const embed = parseEmbedding(row.embedding);
    if (!embed.length) continue;

    let matched = false;
    for (const re of rejectedEmbeds) {
      if (cosineSim(embed, re) >= AUDIT_REJECTED_COSINE) {
        rejectByPattern.add(row.id);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (coreEmbed && cosineSim(embed, coreEmbed) >= AUDIT_CORE_COSINE) {
      rejectByCore.add(row.id);
    }
  }

  // ── Phase 4: distilled skip rules (LLM judgment) ────────────────────────
  // The user's rejected_summary captures higher-level patterns the embedding
  // pool can't always express ("skip work activity", "skip transient moods").
  // Send the still-active candidate facts to Gemini in one bulk call along
  // with the rules, get a yes/no per fact. Bulk-classification keeps cost
  // bounded — one Flash call per audit even with 100s of candidates.
  const rejectByRules = new Set<string>();
  if (apiKey) {
    try {
      const cr2 = await fetch(
        `${SB_URL}/rest/v1/user_personas?user_id=eq.${encodeURIComponent(userId)}&select=rejected_summary&limit=1`,
        { headers: SB_HDR },
      );
      let rules = "";
      if (cr2.ok) {
        const rr = (await cr2.json().catch(() => [])) as Array<{
          rejected_summary: string | null;
        }>;
        rules = (rr[0]?.rejected_summary ?? "").trim();
      }
      // Skip if no distilled rules yet — Phase 1-3 have already done their job.
      if (rules) {
        const candidates = winners.filter((row) => {
          if (row.metadata?.pinned === true) return false;
          const src = String(row.metadata?.source || "");
          if (src === "manual" || src === "chat") return false;
          if (row.metadata?.skip_persona === true) return false;
          if (rejectByPattern.has(row.id) || rejectByCore.has(row.id)) return false;
          return true;
        });
        if (candidates.length > 0) {
          const ruledOutIds = await classifyAgainstRules(rules, candidates, apiKey);
          for (const id of ruledOutIds) rejectByRules.add(id);
        }
      }
    } catch (e) {
      console.error("[audit:phase4] rules pass failed:", e);
    }
  }

  // Apply: bulk-PATCH each marked id with status=rejected + reason.
  async function markRejected(id: string, reason: string): Promise<boolean> {
    const row = active.find((a) => a.id === id);
    if (!row) return false;
    const meta = { ...(row.metadata ?? {}) };
    const tags: string[] = Array.isArray((row as any).tags) ? (row as any).tags : [];
    if (!tags.includes("rejected")) tags.push("rejected");
    meta.status = "rejected";
    meta.rejected_at = new Date().toISOString();
    meta.rejected_reason = reason;
    meta.rejected_by = "audit";
    return patchEntryFields(id, userId, { metadata: meta, tags });
  }

  for (const id of dupTargets) {
    if (await markRejected(id, "duplicate of another fact")) out.rejected_duplicates++;
  }
  for (const id of rejectByPattern) {
    if (await markRejected(id, "matches a fact you marked as not-me")) out.rejected_pattern++;
  }
  for (const id of rejectByCore) {
    if (await markRejected(id, "already in your About You")) out.rejected_core++;
  }
  for (const id of rejectByRules) {
    if (await markRejected(id, "matches your distilled skip rules")) out.rejected_rules++;
  }

  out.kept =
    out.scanned -
    out.rejected_duplicates -
    out.rejected_pattern -
    out.rejected_core -
    out.rejected_rules;
  return out;
}

// Bulk-classify candidate facts against the user's distilled skip rules.
// One Gemini Flash call returns an array of indices to reject.
async function classifyAgainstRules(
  rules: string,
  candidates: AuditRow[],
  apiKey: string,
): Promise<string[]> {
  if (!candidates.length) return [];
  const model =
    (process.env.GEMINI_AUDIT_RULES_MODEL || GEMINI_BULK_MODEL).trim() ||
    GEMINI_BULK_MODEL;

  const block = candidates
    .map((row, i) => {
      const reason = row.metadata?.bucket ? ` [${row.metadata.bucket}]` : "";
      return `${i}. ${row.title}${reason}`;
    })
    .join("\n");

  const systemPrompt = `You apply the user's "skip rules" to a list of persona facts.

The user has personally taught us these rules — anything matching them does NOT belong in their living memory and should be removed.

For each candidate fact below, decide: does it MATCH any skip rule? Apply judgment, not literal-string matching — a rule like "skip work activity" should match "User attended Q3 review meeting" even though the rule doesn't mention reviews or meetings.

Be conservative. If a fact is genuinely identity-defining (a relationship, a lasting habit, a core preference), KEEP it even if it brushes against a rule.

Return ONLY a JSON array of integer indices to REJECT. Example: [0, 3, 7]. Empty array if all candidates pass.`;

  const userPart = `Skip rules:\n${rules.slice(0, 2000)}\n\nCandidates:\n${block}`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPart }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens: 600,
    },
  });

  const FALLBACK = geminiFallbackChain(model);
  for (const m of FALLBACK) {
    try {
      let r = await googleAiFetch(apiKey, googleAiModelUrl(m, "generateContent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 1500));
        r = await googleAiFetch(apiKey, googleAiModelUrl(m, "generateContent"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      }
      if (!r.ok) continue;
      const data: any = await r.json();
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((n) => typeof n === "number" && n >= 0 && n < candidates.length)
        .map((n) => candidates[n]!.id);
    } catch {
      // try next model
    }
  }
  return [];
}

// ── Public: enrichAllBrains (cron sweep) ────────────────────────────────────
//
// Daily call uses defaults (240s total / 60s per brain / batchSize 50).
// Hourly safety-net call passes mode='hourly' which trims the budget so the
// hourly cron stays inside its function-timeout but still drains a steady
// trickle: anything created inside the last hour gets cleaned up before
// the next pass. Together they guarantee that no entry waits >1h to be
// fully enriched, even if the inline-enrich path on PATCH somehow misses.

export interface EnrichSweepOpts {
  mode?: "daily" | "hourly";
}

export async function enrichAllBrains(
  opts: EnrichSweepOpts = {},
): Promise<{ brains: number; processed: number; mode: "daily" | "hourly" }> {
  const mode = opts.mode ?? "daily";
  let totalProcessed = 0;
  let scannedBrains = 0;
  // Daily: 240s budget / 60s per brain / 50 batch — chunky catch-up.
  // Hourly: 90s budget / 25s per brain / 30 batch — keeps within the
  // hourly cron's tighter wallclock and drains anything the inline
  // enrich path missed in the last 60 minutes. Adjust if Vercel logs
  // show the hourly cron approaching its function-timeout.
  const PER_RUN_BUDGET_MS = mode === "hourly" ? 90_000 : 240_000;
  const PER_BRAIN_BUDGET_MS = mode === "hourly" ? 25_000 : 60_000;
  const BATCH_SIZE = mode === "hourly" ? 30 : 50;
  const BRAIN_PAGE = 100;
  const startedAt = Date.now();
  for (let offset = 0; ; offset += BRAIN_PAGE) {
    const remainingBeforeFetch = Math.max(0, PER_RUN_BUDGET_MS - (Date.now() - startedAt));
    if (remainingBeforeFetch < 5_000) break;

    const r = await fetch(
      `${SB_URL}/rest/v1/brains?select=id,owner_id&order=created_at.asc&limit=${BRAIN_PAGE}&offset=${offset}`,
      { headers: SB_HDR },
    );
    if (!r.ok) break;
    const brains: { id: string; owner_id: string }[] = await r.json().catch(() => []);
    if (!brains.length) break;

    for (const brain of brains) {
      const remainingBudget = Math.max(0, PER_RUN_BUDGET_MS - (Date.now() - startedAt));
      if (remainingBudget < 5_000) break;
      scannedBrains++;
      const perBrainBudget = Math.min(remainingBudget, PER_BRAIN_BUDGET_MS);
      const { processed } = await enrichBrain(
        brain.owner_id,
        brain.id,
        BATCH_SIZE,
        perBrainBudget,
      ).catch(() => ({ processed: 0, remaining: 0 }));
      totalProcessed += processed;
    }

    if (brains.length < BRAIN_PAGE) break;
  }
  return { brains: scannedBrains, processed: totalProcessed, mode };
}
