import { authFetch } from "./authFetch";
import { PROMPTS } from "../config/prompts";
import type { Entry } from "../types";
import { SKIP_META_KEYS } from "./entryConstants";

export function isFullyEnriched(entry: Entry, _allEntries: Entry[]): boolean {
  const e = (entry.metadata as any)?.enrichment ?? {};
  const embedded = e.embedded ?? Boolean((entry as any).embedded_at);
  const concepts = (e.concepts_count ?? 0) > 0;
  const insight = !!(entry.metadata as any)?.ai_insight || e.has_insight === true;
  const parsed =
    e.parsed === true ||
    Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META_KEYS.has(k)).length > 0;
  return embedded && concepts && insight && parsed;
}

export function getEnrichmentGaps(entry: Entry, _allEntries: Entry[]): string[] {
  const e = (entry.metadata as any)?.enrichment ?? {};
  const gaps: string[] = [];
  if (!(e.embedded ?? Boolean((entry as any).embedded_at))) gaps.push("embedding");
  if (!((e.concepts_count ?? 0) > 0)) gaps.push("concepts");
  const hasInsight = !!(entry.metadata as any)?.ai_insight || e.has_insight === true;
  if (!hasInsight) gaps.push("insight");
  const parsed =
    e.parsed === true ||
    Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META_KEYS.has(k)).length > 0;
  if (!parsed) gaps.push("parsed");
  return gaps;
}

export async function enrichEntry(
  entry: Entry,
  brainId: string,
  onUpdate: (id: string, changes: any) => Promise<void>,
): Promise<void> {
  const e = (entry.metadata as any)?.enrichment ?? {};
  const embedded = e.embedded ?? Boolean((entry as any).embedded_at);
  const concepts = (e.concepts_count ?? 0) > 0;
  const parsed =
    e.parsed === true ||
    Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META_KEYS.has(k)).length > 0;
  const insight = e.has_insight ?? false;

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
      if (res.ok) {
        const data = await res.json();
        const text: string = data?.content?.[0]?.text || data?.text || "";
        const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
        if (jsonMatch) {
          let parsed: any;
          try { parsed = JSON.parse(jsonMatch[0]); } catch { /* skip */ }
          const result = Array.isArray(parsed) ? parsed[0] : parsed;
          if (result?.type) {
            const newMeta = { ...(result.metadata || {}) };
            delete newMeta.confidence;
            if (rawText.length > 200 && !newMeta.full_text) newMeta.full_text = rawText;
            const existingEnrichment = (entry.metadata as any)?.enrichment ?? {};
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
          }
        }
      }
    } catch { /* continue */ }
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
      }
    } catch { /* continue */ }
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
    } catch { /* continue */ }
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
    } catch { /* continue */ }
  }
}
