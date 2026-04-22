import { authFetch } from "./authFetch";
import type { Entry } from "../types";
import { SKIP_META_KEYS } from "./entryConstants";

export function isFullyEnriched(
  entry: Entry,
  _allEntries: Entry[],
  entryIdsWithConcepts?: Set<string>,
): boolean {
  const e = (entry.metadata as any)?.enrichment ?? {};
  const embedded = e.embedded ?? Boolean((entry as any).embedded_at);
  const concepts = (e.concepts_count ?? 0) > 0 || (entryIdsWithConcepts?.has(entry.id) ?? false);
  const insight = !!(entry.metadata as any)?.ai_insight || e.has_insight === true;
  const parsed =
    e.parsed === true ||
    Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META_KEYS.has(k)).length > 0;
  return embedded && concepts && insight && parsed;
}

export function getEnrichmentGaps(
  entry: Entry,
  _allEntries: Entry[],
  entryIdsWithConcepts?: Set<string>,
): string[] {
  const e = (entry.metadata as any)?.enrichment ?? {};
  const gaps: string[] = [];
  if (!(e.embedded ?? Boolean((entry as any).embedded_at))) gaps.push("embedding");
  const hasConcepts = (e.concepts_count ?? 0) > 0 || (entryIdsWithConcepts?.has(entry.id) ?? false);
  if (!hasConcepts) gaps.push("concepts");
  const hasInsight = !!(entry.metadata as any)?.ai_insight || e.has_insight === true;
  if (!hasInsight) gaps.push("insight");
  const parsed =
    e.parsed === true ||
    Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META_KEYS.has(k)).length > 0;
  if (!parsed) gaps.push("parsed");
  return gaps;
}

export interface EnrichError { step: string; message: string }

export async function enrichEntry(
  entry: Entry,
  brainId: string,
  onUpdate: (id: string, changes: any) => Promise<void>,
): Promise<EnrichError[]> {
  const errors: EnrichError[] = [];
  const { PROMPTS } = await import("../config/prompts");
  const e = (entry.metadata as any)?.enrichment ?? {};
  const embedded = e.embedded ?? Boolean((entry as any).embedded_at);
  const concepts = (e.concepts_count ?? 0) > 0;
  const parsed =
    e.parsed === true ||
    Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META_KEYS.has(k)).length > 0;
  const insight = !!(entry.metadata as any)?.ai_insight || e.has_insight === true;

  // ── AI Parsing ─────────────────────────────────────────────────────────
  if (!parsed) {
    try {
      const rawText = String((entry.metadata as any)?.full_text || entry.content || entry.title);
      const res = await authFetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: PROMPTS.CAPTURE,
          messages: [{ role: "user", content: rawText }],
          max_tokens: 800,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => res.status.toString());
        errors.push({ step: "parsed", message: `HTTP ${res.status}: ${body}` });
      } else {
        const data = await res.json();
        const rawAI: string = data?.content?.[0]?.text || data?.text || "";
        const aiText = rawAI.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
        const jsonMatch = aiText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
        let result: any = null;
        if (jsonMatch) {
          try {
            const p = JSON.parse(jsonMatch[0]);
            result = Array.isArray(p) ? p[0] : p;
          } catch { /* fall through */ }
        }
        const existingEnrichment = (entry.metadata as any)?.enrichment ?? {};
        // Accept the result if it has any usable field; default type to "note" if omitted
        if (result && (result.type || result.title || result.content)) {
          if (!result.type) result.type = "note";
          const newMeta = { ...(result.metadata || {}) };
          delete newMeta.confidence;
          if (rawText.length > 200 && !newMeta.full_text) newMeta.full_text = rawText;
          const mergedMeta = {
            ...(entry.metadata ?? {}),
            ...newMeta,
            enrichment: { ...existingEnrichment, parsed: true },
          };
          await onUpdate(entry.id, {
            type: result.type,
            content: result.content || entry.content,
            metadata: mergedMeta,
          });
          entry = { ...entry, type: result.type, content: result.content || entry.content, metadata: mergedMeta };
        } else {
          const preview = rawAI.slice(0, 120) || "(empty response)";
          errors.push({ step: "parsed", message: `AI returned no usable JSON: ${preview}` });
        }
      }
    } catch (err) {
      errors.push({ step: "parsed", message: String((err as any)?.message ?? err) });
    }
  }

  // ── Embedding ──────────────────────────────────────────────────────────
  if (!embedded) {
    try {
      const res = await authFetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_id: entry.id }),
      });
      if (res.ok) {
        const existing = (entry.metadata as any)?.enrichment ?? {};
        await onUpdate(entry.id, {
          metadata: { ...(entry.metadata ?? {}), enrichment: { ...existing, embedded: true } },
        });
      } else {
        const body = await res.text().catch(() => res.status.toString());
        errors.push({ step: "embedding", message: `HTTP ${res.status}: ${body}` });
      }
    } catch (err) {
      errors.push({ step: "embedding", message: String((err as any)?.message ?? err) });
    }
  }

  // ── Concepts ───────────────────────────────────────────────────────────
  if (!concepts) {
    try {
      const { extractEntryConnections } = await import("../lib/brainConnections");
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
      const existing = (entry.metadata as any)?.enrichment ?? {};
      await onUpdate(entry.id, {
        metadata: {
          ...(entry.metadata ?? {}),
          enrichment: { ...existing, concepts_count: 1, has_related: true },
        },
      });
    } catch (err) {
      errors.push({ step: "concepts", message: String((err as any)?.message ?? err) });
    }
  }

  // ── Insight ────────────────────────────────────────────────────────────
  if (!insight) {
    try {
      const { generateEntryInsight } = await import("../lib/brainConnections");
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
      const existing = (entry.metadata as any)?.enrichment ?? {};
      await onUpdate(entry.id, {
        metadata: { ...(entry.metadata ?? {}), enrichment: { ...existing, has_insight: true } },
      });
    } catch (err) {
      errors.push({ step: "insight", message: String((err as any)?.message ?? err) });
    }
  }

  return errors;
}
