import { useState } from "react";
import { authFetch } from "../lib/authFetch";
import { loadGraphFromDB, getConceptsForEntry } from "../lib/conceptGraph";
import type { Entry, Concept } from "../types";

type ItemStatus = "pass" | "fail" | "running" | "unknown";

interface HealthItem {
  key: string;
  label: string;
  note: string;
  status: ItemStatus;
  detail?: string;
  readOnly?: boolean;
}

interface Enrichment {
  embedded?: boolean;
  concepts_count?: number;
  has_related?: boolean;
  has_insight?: boolean;
}

interface Props {
  entry: Entry;
  brainId: string;
  entries: Entry[];
  metaKeys: string[];
  entryConcepts: Concept[];
  hasRelated: boolean;
  onRefreshConcepts: () => void;
  onUpdate?: (id: string, changes: Record<string, unknown>) => void | Promise<void>;
}

function getEnrichment(entry: Entry): Enrichment {
  return (entry.metadata as any)?.enrichment ?? {};
}

function buildItems(
  entry: Entry,
  entries: Entry[],
  metaKeys: string[],
  entryConcepts: Concept[],
  hasRelated: boolean,
): HealthItem[] {
  const e = getEnrichment(entry);

  // Embedding: check persisted flag first, then embedded_at field
  const isEmbedded = e.embedded ?? Boolean(entry.embedded_at);

  // Concepts: persisted count first, then live prop
  const conceptCount = e.concepts_count ?? entryConcepts.length;

  // Related: persisted flag first, then live prop
  const hasRelatedEntries = e.has_related ?? hasRelated;

  // Insight: check ai_insight on entry metadata first, then fall back to legacy has_insight flag
  const hasInsight = !!(entry.metadata as any)?.ai_insight || e.has_insight === true;

  return [
    {
      key: "embedding",
      label: "Embedding",
      note: isEmbedded ? "Embedded" : "Semantic search index",
      status: isEmbedded ? "pass" : "unknown",
    },
    {
      key: "parsing",
      label: "AI Parsing",
      note: metaKeys.length > 0 ? `${metaKeys.length} structured fields` : e.parsed ? "Classified" : "No structured fields found",
      status: metaKeys.length > 0 || e.parsed ? "pass" : "fail",
    },
    {
      key: "concepts",
      label: "Concepts",
      note: conceptCount > 0 ? `${conceptCount} concepts` : "Not in concept graph",
      status: conceptCount > 0 ? "pass" : "fail",
    },
    {
      key: "related",
      label: "Related by Concepts",
      note: hasRelatedEntries ? "Related entries found" : "No related entries yet",
      status: hasRelatedEntries ? "pass" : conceptCount === 0 ? "fail" : "unknown",
    },
    {
      key: "insight",
      label: "Insight",
      note: hasInsight ? "AI insight generated" : "No insight generated",
      status: hasInsight ? "pass" : "fail",
    },
  ];
}

function StatusDot({ status }: { status: ItemStatus }) {
  if (status === "pass") {
    return (
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ background: "rgb(22 163 74 / 0.12)", color: "rgb(22 163 74)" }}
      >
        ✓
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ background: "var(--color-error-container)", color: "var(--color-error)" }}
      >
        ✗
      </span>
    );
  }
  if (status === "running") {
    return (
      <span
        className="flex h-5 w-5 flex-shrink-0 animate-pulse items-center justify-center rounded-full text-[10px]"
        style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}
      >
        ●
      </span>
    );
  }
  return (
    <span
      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px]"
      style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface-variant)" }}
    >
      ?
    </span>
  );
}

export function EntryHealthPanel({
  entry,
  brainId,
  entries,
  metaKeys,
  entryConcepts,
  hasRelated,
  onRefreshConcepts,
  onUpdate,
}: Props) {
  const [items, setItems] = useState<HealthItem[]>(() =>
    buildItems(entry, entries, metaKeys, entryConcepts, hasRelated),
  );
  const [running, setRunning] = useState(false);
  const [allDone, setAllDone] = useState(false);

  function update(key: string, patch: Partial<HealthItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  /** Persist an enrichment flag to entry.metadata.enrichment in the DB. */
  function saveEnrichmentFlag(flag: Partial<Enrichment>) {
    if (!onUpdate) return;
    const existing = getEnrichment(entry);
    const merged = { ...existing, ...flag };
    onUpdate(entry.id, {
      metadata: { ...(entry.metadata ?? {}), enrichment: merged },
    });
  }

  const fixable = items.filter((it) => !it.readOnly && it.status !== "pass");

  async function enrich() {
    if (running || fixable.length === 0) return;
    setRunning(true);
    setAllDone(false);

    const needs = new Set(fixable.map((it) => it.key));

    await Promise.allSettled([
      // ── AI Parsing ─────────────────────────────────────────────────────────
      needs.has("parsing") &&
        (async () => {
          update("parsing", { status: "running", detail: undefined });
          try {
            const { PROMPTS } = await import("../config/prompts");
            const rawText = String(
              (entry.metadata as any)?.full_text || entry.content || entry.title,
            );
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
              const d = await res.json().catch(() => ({}));
              update("parsing", { status: "fail", detail: (d as any).error || `HTTP ${res.status}` });
              return;
            }
            const data = await res.json();
            const rawAI: string = data?.content?.[0]?.text || data?.text || "";
            // Strip markdown code fences before extracting JSON
            const text = rawAI.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
            const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
            let result: any = null;
            if (jsonMatch) {
              try {
                const p = JSON.parse(jsonMatch[0]);
                result = Array.isArray(p) ? p[0] : p;
              } catch { /* fall through to fallback */ }
            }
            // Fallback: AI gave prose — mark as classified with existing type so we don't block
            if (!result?.type) {
              const existingEnrichmentFallback = getEnrichment(entry);
              await onUpdate?.(entry.id, {
                metadata: {
                  ...(entry.metadata ?? {}),
                  enrichment: { ...existingEnrichmentFallback, parsed: true },
                },
              });
              update("parsing", { status: "pass", note: "Classified" });
              return;
            }
            const newMeta = { ...(result.metadata || {}) };
            delete newMeta.confidence;
            // Preserve full original text so it shows at the bottom of the modal
            if (rawText.length > 200 && !newMeta.full_text) {
              newMeta.full_text = rawText;
            }
            const existingEnrichment = getEnrichment(entry);
            await onUpdate?.(entry.id, {
              type: result.type,
              content: result.content || entry.content,
              metadata: {
                ...(entry.metadata ?? {}),
                ...newMeta,
                enrichment: { ...existingEnrichment, parsed: true },
              },
            });
            const fieldCount = Object.keys(newMeta).filter((k) => k !== "full_text").length;
            update("parsing", { status: "pass", note: fieldCount > 0 ? `${fieldCount} structured fields` : "Classified" });
          } catch (e: any) {
            update("parsing", { status: "fail", detail: e?.message || "Failed" });
          }
        })(),

      // ── Embedding ──────────────────────────────────────────────────────────
      needs.has("embedding") &&
        (async () => {
          update("embedding", { status: "running", detail: undefined });
          try {
            const res = await authFetch("/api/embed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entry_id: entry.id }),
            });
            if (res.ok) {
              update("embedding", { status: "pass", note: "Embedded", detail: undefined });
              saveEnrichmentFlag({ embedded: true });
            } else {
              const d = await res.json().catch(() => ({}));
              update("embedding", { status: "fail", detail: (d as any).error || `HTTP ${res.status}` });
            }
          } catch (e: any) {
            update("embedding", { status: "fail", detail: e?.message || "Network error" });
          }
        })(),

      // ── Concepts + Related ─────────────────────────────────────────────────
      (needs.has("concepts") || needs.has("related")) &&
        (async () => {
          update("concepts", { status: "running", detail: undefined });
          update("related", { status: "running", detail: undefined });
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
            const freshGraph = await loadGraphFromDB(brainId);
            const freshConcepts = getConceptsForEntry(freshGraph, entry.id);
            if (freshConcepts.length > 0) {
              update("concepts", { status: "pass", note: `${freshConcepts.length} concepts` });
              onRefreshConcepts();
              const otherEntryIds = freshGraph.concepts
                .flatMap((c) => c.source_entries)
                .filter((id) => id !== entry.id);
              const hasRel = otherEntryIds.length > 0;
              update("related", {
                status: hasRel ? "pass" : "unknown",
                note: hasRel ? "Related entries found" : "No related entries yet",
              });
              saveEnrichmentFlag({ concepts_count: freshConcepts.length, has_related: hasRel });
            } else {
              update("concepts", { status: "fail", note: "No concepts extracted", detail: "AI returned none" });
              update("related", { status: "fail", note: "Depends on concepts" });
            }
          } catch (e: any) {
            update("concepts", { status: "fail", detail: e?.message || "Failed" });
            update("related", { status: "fail", detail: "Depends on concepts" });
          }
        })(),

      // ── Insight ────────────────────────────────────────────────────────────
      needs.has("insight") &&
        (async () => {
          update("insight", { status: "running", detail: undefined });
          try {
            const { generateEntryInsight } = await import("../lib/brainConnections");
            const insightText = await generateEntryInsight(
              {
                id: entry.id,
                title: entry.title,
                content: entry.content || "",
                type: entry.type,
                tags: entry.tags || [],
              },
              brainId,
            );
            // Update local state so the insight shows immediately without a reload
            await onUpdate?.(entry.id, {
              metadata: { ...(entry.metadata ?? {}), ai_insight: insightText },
            });
            update("insight", { status: "pass", note: "AI insight generated" });
          } catch (e: any) {
            update("insight", { status: "fail", detail: e?.message || "Failed" });
          }
        })(),
    ]);

    setRunning(false);
    setAllDone(true);
  }

  const passCount = items.filter((it) => it.status === "pass").length;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <StatusDot status={item.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--color-on-surface)" }}
              >
                {item.label}
              </span>
              {item.readOnly && (
                <span
                  className="rounded-full px-1.5 py-px text-[9px] font-medium"
                  style={{
                    background: "var(--color-surface-container-highest)",
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  auto
                </span>
              )}
            </div>
            <p
              className="text-[10px] leading-tight"
              style={{
                color: item.detail
                  ? "var(--color-error)"
                  : "var(--color-on-surface-variant)",
              }}
            >
              {item.detail || item.note}
            </p>
          </div>
        </div>
      ))}

      <div className="pt-1">
        {fixable.length > 0 ? (
          <button
            onClick={enrich}
            disabled={running}
            className="w-full rounded-xl py-2.5 text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            {running ? "Enriching…" : `Fix ${fixable.length} missing item${fixable.length > 1 ? "s" : ""}`}
          </button>
        ) : allDone || passCount === items.length ? (
          <p
            className="text-center text-[11px] font-semibold"
            style={{ color: "rgb(22 163 74)" }}
          >
            ✓ Fully enriched
          </p>
        ) : null}
      </div>
    </div>
  );
}
