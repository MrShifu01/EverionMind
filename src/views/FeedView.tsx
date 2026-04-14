import { useState, useEffect, useMemo, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import { fmtD } from "../data/constants";
import { EarlyAccessBanner } from "../components/EarlyAccessBanner";
import { PROMPTS } from "../config/prompts";
import type { Entry } from "../types";

interface FeedEntry {
  id: string;
  title: string;
  content: string;
  type: string;
  tags: string[];
  created_at: string;
}

interface Wow {
  headline: string;
  detail: string;
}

interface FeedData {
  greeting: string;
  resurfaced: FeedEntry[];
  wows: Wow[];
  action: string | null;
  streak: { current: number; longest: number };
  stats: { entries: number; connections: number; insights: number };
}

interface FeedViewProps {
  brainId: string | undefined;
  onCapture: () => void;
  onSelectEntry?: (entry: any) => void;
  onNavigate?: (view: string) => void;
  entries?: Entry[];
  onUpdate?: (id: string, changes: any) => Promise<void>;
}

const SKIP_META = new Set([
  "category", "status", "confidence", "completeness_score",
  "raw_content", "source_entry_id", "full_text", "workspace", "enrichment",
]);

function isFullyEnriched(entry: Entry, allEntries: Entry[]): boolean {
  if (entry.type === "insight") return true;
  const e = (entry.metadata as any)?.enrichment ?? {};
  const embedded = e.embedded ?? Boolean((entry as any).embedded_at);
  const concepts = (e.concepts_count ?? 0) > 0;
  const insight =
    e.has_insight ??
    allEntries.some(
      (x) => x.type === "insight" && (x.metadata as any)?.source_entry_id === entry.id,
    );
  const parsed = Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META.has(k)).length > 0;
  return embedded && concepts && insight && parsed;
}

async function enrichEntry(
  entry: Entry,
  brainId: string,
  onUpdate: (id: string, changes: any) => Promise<void>,
): Promise<void> {
  const e = (entry.metadata as any)?.enrichment ?? {};
  const embedded = e.embedded ?? Boolean((entry as any).embedded_at);
  const concepts = (e.concepts_count ?? 0) > 0;
  const parsed = Object.keys(entry.metadata ?? {}).filter((k) => !SKIP_META.has(k)).length > 0;
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
            await onUpdate(entry.id, {
              type: result.type,
              content: result.content || entry.content,
              metadata: { ...(entry.metadata ?? {}), ...newMeta },
            });
            // Refresh local entry ref for subsequent steps
            entry = { ...entry, type: result.type, content: result.content || entry.content, metadata: { ...(entry.metadata ?? {}), ...newMeta } };
          }
        }
      }
    } catch { /* continue to next step */ }
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
        { id: entry.id, title: entry.title, content: entry.content || "", type: entry.type, tags: entry.tags || [] },
        brainId,
      );
      const existing = (entry.metadata as any)?.enrichment ?? {};
      await onUpdate(entry.id, {
        metadata: { ...(entry.metadata ?? {}), enrichment: { ...existing, concepts_count: 1, has_related: true } },
      });
    } catch { /* continue */ }
  }

  // ── Insight ────────────────────────────────────────────────────────────
  if (!insight) {
    try {
      const { generateEntryInsight } = await import("../lib/brainConnections");
      await generateEntryInsight(
        { id: entry.id, title: entry.title, content: entry.content || "", type: entry.type, tags: entry.tags || [] },
        brainId,
      );
      const existing = (entry.metadata as any)?.enrichment ?? {};
      await onUpdate(entry.id, {
        metadata: { ...(entry.metadata ?? {}), enrichment: { ...existing, has_insight: true } },
      });
    } catch { /* continue */ }
  }
}

export default function FeedView({
  brainId,
  onCapture,
  onSelectEntry,
  onNavigate,
  entries = [],
  onUpdate,
}: FeedViewProps) {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!brainId) return;
    setLoading(true);
    authFetch(`/api/feed?brain_id=${encodeURIComponent(brainId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch((err) => console.error("[FeedView]", err))
      .finally(() => setLoading(false));
  }, [brainId]);

  const unenriched = useMemo(
    () => entries.filter((e) => !isFullyEnriched(e, entries)),
    [entries],
  );

  const runBulkEnrich = useCallback(async () => {
    if (!brainId || !onUpdate || enriching || unenriched.length === 0) return;
    setEnriching(true);
    setEnrichProgress({ done: 0, total: unenriched.length });
    for (let i = 0; i < unenriched.length; i++) {
      await enrichEntry(unenriched[i], brainId, onUpdate);
      setEnrichProgress({ done: i + 1, total: unenriched.length });
    }
    setEnriching(false);
    setEnrichProgress(null);
  }, [brainId, onUpdate, enriching, unenriched]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl"
            style={{ background: "var(--color-surface-container)" }}
          />
        ))}
      </div>
    );
  }

  if (!data || data.stats.entries === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="text-5xl">🧠</div>
        <h2
          className="text-on-surface text-xl font-bold"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          Your brain is empty. Let's fix that.
        </h2>
        <p className="text-on-surface-variant max-w-sm text-sm">
          Capture your first thought and watch your brain grow.
        </p>
        <button
          onClick={onCapture}
          className="press-scale text-on-primary rounded-xl px-6 py-3 text-sm font-semibold"
          style={{ background: "var(--color-primary)" }}
        >
          Capture a thought
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <EarlyAccessBanner />

      {/* Bulk enrichment banner — only when there are unenriched entries */}
      {unenriched.length > 0 && onUpdate && (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
          style={{
            background: "color-mix(in oklch, var(--color-secondary) 8%, var(--color-surface))",
            borderColor: "color-mix(in oklch, var(--color-secondary) 22%, transparent)",
          }}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold" style={{ color: "var(--color-on-surface)" }}>
              {enriching && enrichProgress
                ? `Enriching ${enrichProgress.done} of ${enrichProgress.total}…`
                : `${unenriched.length} ${unenriched.length === 1 ? "memory needs" : "memories need"} enrichment`}
            </p>
            {!enriching && (
              <p className="text-[10px] leading-tight" style={{ color: "var(--color-on-surface-variant)" }}>
                Parsing, embedding, concepts & insights missing
              </p>
            )}
          </div>
          <button
            onClick={runBulkEnrich}
            disabled={enriching}
            className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "var(--color-secondary)", color: "var(--color-on-secondary)" }}
          >
            {enriching ? "Running…" : "Enrich Now"}
          </button>
        </div>
      )}

      {/* Greeting + stats */}
      <div
        className="rounded-3xl border px-5 py-4"
        style={{
          background: "color-mix(in oklch, var(--color-primary) 8%, var(--color-surface))",
          borderColor: "color-mix(in oklch, var(--color-primary) 18%, transparent)",
        }}
      >
        <p className="text-on-surface text-base font-bold" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          {data.greeting} Here's what your brain surfaced today:
        </p>
        <div className="text-on-surface-variant mt-2 flex flex-wrap gap-4 text-xs">
          <span>{data.stats.entries} memories</span>
          {data.streak.current > 0 && (
            <span>🔥 {data.streak.current}-day streak</span>
          )}
        </div>
      </div>

      {/* Wow moments */}
      {data.wows && data.wows.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-status-medium)" }}
          >
            Your brain just connected the dots
          </p>
          {data.wows.map((wow, i) => (
            <div
              key={i}
              className="rounded-2xl border p-4"
              style={{
                background: "color-mix(in oklch, var(--color-status-medium) 10%, var(--color-surface))",
                borderColor: "color-mix(in oklch, var(--color-status-medium) 22%, transparent)",
              }}
            >
              <p
                className="text-sm font-bold leading-snug"
                style={{ color: "var(--color-on-surface)" }}
              >
                {wow.headline}
              </p>
              <p className="text-on-surface-variant mt-1 text-xs leading-relaxed">
                {wow.detail}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Resurfaced memories */}
      {data.resurfaced.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            From your memory
          </p>
          {data.resurfaced.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelectEntry?.(entry)}
              className="press-scale w-full rounded-2xl border p-4 text-left transition-all"
              style={{
                background: "var(--color-surface-container-low)",
                borderColor: "var(--color-outline-variant)",
              }}
            >
              <p className="text-on-surface text-sm font-semibold">{entry.title}</p>
              <p className="text-on-surface-variant mt-1 line-clamp-2 text-xs">
                {entry.content?.slice(0, 120)}
              </p>
              <p className="text-on-surface-variant/50 mt-2 text-[10px]">
                {fmtD(entry.created_at)}
              </p>
            </button>
          ))}
        </div>
      )}

      {data.action && (
        <button
          onClick={() => onNavigate?.("grid")}
          className="press-scale flex w-full items-start gap-3 rounded-2xl border p-4 text-left"
          style={{
            background: "color-mix(in oklch, var(--color-secondary) 8%, var(--color-surface))",
            borderColor: "color-mix(in oklch, var(--color-secondary) 18%, transparent)",
          }}
        >
          <span className="text-lg">💡</span>
          <div className="flex-1">
            <p className="text-on-surface text-sm font-semibold">Suggestion</p>
            <p className="text-on-surface-variant mt-0.5 text-xs">{data.action}</p>
          </div>
          {onNavigate && (
            <span className="text-on-surface-variant self-center text-xs">→</span>
          )}
        </button>
      )}

      <div className="pt-2 text-center">
        <button
          onClick={onCapture}
          className="press-scale text-on-primary rounded-xl px-6 py-3 text-sm font-semibold"
          style={{ background: "var(--color-primary)" }}
        >
          What's on your mind?
        </button>
      </div>
    </div>
  );
}
