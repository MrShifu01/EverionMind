import { authFetch } from "./authFetch";
import type { Entry } from "../types";
import { SKIP_META_KEYS } from "./entryConstants";
import { aiSettings } from "./aiSettings";

export interface EnrichError {
  step: string;
  message: string;
}

type OnUpdate = (id: string, changes: any) => Promise<void>;
type OnPhase = (phase: string) => void;

interface StepFlags {
  embedded: boolean;
  concepts: boolean;
  parsed: boolean;
  insight: boolean;
}

function readFlags(entry: Entry): StepFlags {
  const e = (entry.metadata as any)?.enrichment ?? {};
  const metaKeys = Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META_KEYS.has(k));
  return {
    embedded: e.embedded ?? Boolean((entry as any).embedded_at),
    concepts: (e.concepts_count ?? 0) > 0,
    // explicit false (e.g. Gmail entries) always requires a parse run, even if metaKeys exist
    parsed: e.parsed !== false && (e.parsed === true || metaKeys.length > 0),
    insight: !!(entry.metadata as any)?.ai_insight || e.has_insight === true,
  };
}

/** Merge an enrichment patch into an entry's metadata.enrichment without clobbering siblings. */
function mergeEnrichmentFlags(
  entry: Entry,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const existing = (entry.metadata as any)?.enrichment ?? {};
  return { ...(entry.metadata ?? {}), enrichment: { ...existing, ...patch } };
}

export function isFullyEnriched(
  entry: Entry,
  _allEntries: Entry[],
  entryIdsWithConcepts?: Set<string>,
): boolean {
  const f = readFlags(entry);
  const hasConcepts = f.concepts || (entryIdsWithConcepts?.has(entry.id) ?? false);
  return f.embedded && hasConcepts && f.insight && f.parsed;
}

export function getEnrichmentGaps(
  entry: Entry,
  _allEntries: Entry[],
  entryIdsWithConcepts?: Set<string>,
): string[] {
  const f = readFlags(entry);
  const gaps: string[] = [];
  if (!f.embedded) gaps.push("embedding");
  if (!f.concepts && !(entryIdsWithConcepts?.has(entry.id) ?? false)) gaps.push("concepts");
  if (!f.insight) gaps.push("insight");
  if (!f.parsed) gaps.push("parsed");
  return gaps;
}

/**
 * Parse an LLM response that should contain a JSON object or array.
 * Handles: markdown fences, truncated responses (via brace-counting salvage).
 * Returns null if no usable JSON could be extracted.
 */
function parseAIJSON(rawAI: string): any | null {
  const aiText = rawAI.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  // Try full array/object first
  const fullMatch = aiText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (fullMatch) {
    try {
      const p = JSON.parse(fullMatch[0]);
      return Array.isArray(p) ? p[0] : p;
    } catch {
      /* fall through */
    }
  }
  // Brace-counting: extract first complete {...} from a truncated response
  const start = aiText.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < aiText.length; i++) {
    if (aiText[i] === "{") depth++;
    else if (aiText[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(aiText.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ── Step: AI parsing ─────────────────────────────────────────────────────────

async function runParseStep(
  entry: Entry,
  onUpdate: OnUpdate,
): Promise<{ entry: Entry; error?: EnrichError }> {
  const { PROMPTS } = await import("../config/prompts");
  const rawText = String((entry.metadata as any)?.full_text || entry.content || entry.title);
  try {
    const res = await authFetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: PROMPTS.CAPTURE,
        messages: [{ role: "user", content: rawText }],
        max_tokens: 1500,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => res.status.toString());
      return { entry, error: { step: "parsed", message: `HTTP ${res.status}: ${body}` } };
    }
    const data = await res.json();
    const rawAI: string = data?.content?.[0]?.text || data?.text || "";
    const result = parseAIJSON(rawAI);

    if (result && (result.type || result.title || result.content)) {
      if (!result.type) result.type = "note";
      const newMeta = { ...(result.metadata || {}) };
      delete newMeta.confidence;
      if (rawText.length > 200 && !newMeta.full_text) newMeta.full_text = rawText;
      const existing = (entry.metadata as any)?.enrichment ?? {};
      const mergedMeta = {
        ...(entry.metadata ?? {}),
        ...newMeta,
        enrichment: { ...existing, parsed: true },
      };
      const patch = {
        type: result.type,
        content: result.content || entry.content,
        metadata: mergedMeta,
      };
      await onUpdate(entry.id, patch);
      return { entry: { ...entry, ...patch } as Entry };
    }

    if (entry.title && (entry.content || "").length > 10) {
      // AI produced no usable JSON but entry already has enough — mark parsed anyway so we move on
      const patch = { metadata: mergeEnrichmentFlags(entry, { parsed: true }) };
      await onUpdate(entry.id, patch);
      return { entry: { ...entry, metadata: patch.metadata } as Entry };
    }

    const preview = rawAI.slice(0, 120) || "(empty response)";
    return { entry, error: { step: "parsed", message: `AI returned no usable JSON: ${preview}` } };
  } catch (err) {
    return { entry, error: { step: "parsed", message: String((err as any)?.message ?? err) } };
  }
}

// ── Step: embedding ──────────────────────────────────────────────────────────

async function runEmbedStep(entry: Entry, onUpdate: OnUpdate): Promise<EnrichError | null> {
  try {
    const res = await authFetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: entry.id }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => res.status.toString());
      return { step: "embedding", message: `HTTP ${res.status}: ${body}` };
    }
    await onUpdate(entry.id, { metadata: mergeEnrichmentFlags(entry, { embedded: true }) });
    return null;
  } catch (err) {
    return { step: "embedding", message: String((err as any)?.message ?? err) };
  }
}

// ── Step: concept extraction ────────────────────────────────────────────────

async function runConceptsStep(
  entry: Entry,
  brainId: string,
  onUpdate: OnUpdate,
): Promise<EnrichError | null> {
  try {
    const { extractEntryConnections } = await import("./brainConnections");
    await extractEntryConnections(
      {
        id: entry.id,
        title: entry.title,
        content: entry.content || "",
        type: entry.type,
        tags: entry.tags || [],
      },
      brainId,
    );
    await onUpdate(entry.id, {
      metadata: mergeEnrichmentFlags(entry, { concepts_count: 1, has_related: true }),
    });
    return null;
  } catch (err) {
    return { step: "concepts", message: String((err as any)?.message ?? err) };
  }
}

// ── Step: insight generation ────────────────────────────────────────────────

async function runInsightStep(
  entry: Entry,
  brainId: string,
  onUpdate: OnUpdate,
): Promise<EnrichError | null> {
  try {
    const { generateEntryInsight } = await import("./brainConnections");
    await generateEntryInsight(
      {
        id: entry.id,
        title: entry.title,
        content: entry.content || "",
        type: entry.type,
        tags: entry.tags || [],
      },
      brainId,
    );
    await onUpdate(entry.id, { metadata: mergeEnrichmentFlags(entry, { has_insight: true }) });
    return null;
  } catch (err) {
    return { step: "insight", message: String((err as any)?.message ?? err) };
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export async function enrichEntry(
  entry: Entry,
  brainId: string,
  onUpdate: OnUpdate,
  onPhase?: OnPhase,
): Promise<EnrichError[]> {
  const errors: EnrichError[] = [];
  const llmAvailable = aiSettings.get().hasAIAccess;
  let current = entry;
  const flags = readFlags(current);

  if (!flags.parsed && llmAvailable) {
    onPhase?.("parsed");
    const { entry: next, error } = await runParseStep(current, onUpdate);
    current = next;
    if (error) errors.push(error);
  }

  if (!flags.embedded) {
    onPhase?.("embedding");
    const error = await runEmbedStep(current, onUpdate);
    if (error) errors.push(error);
  }

  if (!flags.concepts && llmAvailable) {
    onPhase?.("concepts");
    const error = await runConceptsStep(current, brainId, onUpdate);
    if (error) errors.push(error);
  }

  if (!flags.insight && llmAvailable) {
    onPhase?.("insight");
    const error = await runInsightStep(current, brainId, onUpdate);
    if (error) errors.push(error);
  }

  return errors;
}
