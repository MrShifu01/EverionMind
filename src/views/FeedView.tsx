import { useState, useEffect, useRef } from "react";
import { authFetch } from "../lib/authFetch";
import { fmtD } from "../data/constants";
import { EarlyAccessBanner } from "../components/EarlyAccessBanner";
import { PROMPTS } from "../config/prompts";
import { showToast } from "../lib/notifications";

const FEED_TTL = 2 * 60 * 60 * 1000; // 2 hours (quick + insights)
const MERGE_TTL = 24 * 60 * 60 * 1000; // 24 hours — merges don't change that fast

function quickCacheKey(brainId: string) { return `feed_quick_cache:${brainId}`; }
function insightsCacheKey(brainId: string) { return `feed_insights_cache:${brainId}`; }
// Legacy key kept for invalidation only
function feedCacheKey(brainId: string) { return `feed_cache:${brainId}`; }
function mergeCacheKey(brainId: string) { return `merge_cache:${brainId}`; }
function ignoredMergesKey(brainId: string) { return `ignored_merges:${brainId}`; }
function ignoredQuestionsKey(brainId: string) { return `ignored_questions:${brainId}`; }
function wowFeedbackKey(brainId: string) { return `wow_feedback:${brainId}`; }
function mergeId(ids: string[]) { return [...ids].sort().join(":"); }

function readCache<T>(key: string, ttl = FEED_TTL): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null;
    return data as T;
  } catch { return null; }
}

function writeCache(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage full — ignore */ }
}

export function invalidateFeedCache(brainId: string) {
  try {
    localStorage.removeItem(feedCacheKey(brainId));
    localStorage.removeItem(quickCacheKey(brainId));
    localStorage.removeItem(insightsCacheKey(brainId));
  } catch { /* ignore */ }
}

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

interface Suggestion {
  q: string;
  cat: string;
}

interface MergeSuggestion {
  ids: string[];
  titles: string[];
  reason: string;
}

interface QuickData {
  greeting: string;
  resurfaced: FeedEntry[];
  streak: { current: number; longest: number };
  stats: { entries: number; connections: number; insights: number };
}

interface InsightsData {
  wows: Wow[];
  suggestions: Suggestion[];
  merges: MergeSuggestion[];
}

interface UnenrichedDetail {
  id: string;
  title: string;
  gaps: string[];
}

interface FeedViewProps {
  brainId: string | undefined;
  onCapture: () => void;
  onSelectEntry?: (entry: any) => void;
  onNavigate?: (view: string) => void;
  unenrichedCount?: number;
  unenrichedDetails?: UnenrichedDetail[];
  enriching?: boolean;
  enrichProgress?: { done: number; total: number } | null;
  onEnrich?: () => void;
  onCreated?: (entry: any) => void;
}

export default function FeedView({
  brainId,
  onCapture,
  onSelectEntry,
  onNavigate: _onNavigate,
  unenrichedCount = 0,
  unenrichedDetails = [],
  enriching = false,
  enrichProgress,
  onEnrich,
  onCreated,
}: FeedViewProps) {
  const [quickData, setQuickData] = useState<QuickData | null>(null);
  const [quickLoading, setQuickLoading] = useState(true);
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  // Merge state
  const [ignoredMerges, setIgnoredMerges] = useState<Set<string>>(new Set());
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [pendingMergeAction, setPendingMergeAction] = useState<{
    mergeKey: string;
    action: "merge" | "ignore";
    note: string;
  } | null>(null);

  // Question answering state
  const [activeQ, setActiveQ] = useState<Suggestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [doneQs, setDoneQs] = useState<Set<string>>(new Set());
  const [qaError, setQaError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEnrichDebug, setShowEnrichDebug] = useState(false);

  // Ignored questions
  const [ignoredQuestions, setIgnoredQuestions] = useState<Set<string>>(new Set());

  // Wow insight feedback: keyed by headline
  type WowFeedback = { vote: "up" | "down" | null; correction: string };
  const [wowFeedback, setWowFeedback] = useState<Record<string, WowFeedback>>({});
  const [savingInsightFeedback, setSavingInsightFeedback] = useState<Set<string>>(new Set());
  const [savedInsightFeedback, setSavedInsightFeedback] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!brainId) return;
    try {
      const raw = localStorage.getItem(ignoredMergesKey(brainId));
      if (raw) {
        const parsed = JSON.parse(raw);
        // Support both legacy string[] and new {id, note}[] formats
        const ids = parsed.map((item: any) => (typeof item === "string" ? item : item.id));
        setIgnoredMerges(new Set(ids));
      }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(ignoredQuestionsKey(brainId));
      setIgnoredQuestions(new Set(raw ? JSON.parse(raw) : []));
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(wowFeedbackKey(brainId));
      if (raw) setWowFeedback(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [brainId]);

  useEffect(() => {
    if (!brainId) return;

    // Serve quick data from cache immediately
    const cachedQuick = readCache<QuickData>(quickCacheKey(brainId));
    if (cachedQuick) {
      setQuickData(cachedQuick);
      setQuickLoading(false);
    } else {
      setQuickLoading(true);
    }

    // Serve insights from cache immediately.
    // Merges use their own longer TTL (24h) — never stored inside insightsCacheKey.
    const cachedMerges = readCache<MergeSuggestion[]>(mergeCacheKey(brainId), MERGE_TTL);
    const cachedInsights = readCache<InsightsData>(insightsCacheKey(brainId));
    if (cachedInsights) {
      // Overlay fresh merge cache on top of cached wows/suggestions
      setInsightsData({ ...cachedInsights, merges: cachedMerges ?? [] });
      setInsightsLoading(false);
    } else {
      setInsightsLoading(true);
    }

    // Fire both fetches in parallel
    const quickUrl = `/api/feed?brain_id=${encodeURIComponent(brainId)}&section=quick`;
    const insightsUrl = `/api/feed?brain_id=${encodeURIComponent(brainId)}&section=insights${cachedMerges ? "&skip_merges=true" : ""}`;

    if (!cachedQuick) {
      authFetch(quickUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: QuickData | null) => {
          if (d) {
            setQuickData(d);
            writeCache(quickCacheKey(brainId), d);
          }
        })
        .catch((err) => console.error("[FeedView/quick]", err))
        .finally(() => setQuickLoading(false));
    }

    if (!cachedInsights) {
      authFetch(insightsUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: InsightsData | null) => {
          if (d) {
            const merges = cachedMerges ?? d.merges ?? [];
            // Write merges to their own key (24h TTL applied at read time)
            if (!cachedMerges && d.merges?.length) writeCache(mergeCacheKey(brainId), d.merges);
            setInsightsData({ ...d, merges });
            // Never cache merges inside insightsCacheKey — they have a separate TTL
            writeCache(insightsCacheKey(brainId), { ...d, merges: [] });
          }
        })
        .catch((err) => console.error("[FeedView/insights]", err))
        .finally(() => setInsightsLoading(false));
    }
  }, [brainId]);

  function startVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setAnswer((prev) => prev ? prev + " " + text : text);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setAnswer((prev) => prev ? prev + "\n\n" + text : text);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleIgnoreQuestion(q: string) {
    if (!brainId) return;
    setIgnoredQuestions((prev) => {
      const next = new Set(prev);
      next.add(q);
      try { localStorage.setItem(ignoredQuestionsKey(brainId), JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
    setInsightsData((prev) => prev ? { ...prev, suggestions: prev.suggestions.filter((s) => s.q !== q) } : prev);
  }

  function handleWowVote(headline: string, vote: "up" | "down") {
    if (!brainId) return;
    setWowFeedback((prev) => {
      const existing = prev[headline] ?? { vote: null, correction: "" };
      // Toggle off if same vote
      const newVote = existing.vote === vote ? null : vote;
      const next = { ...prev, [headline]: { ...existing, vote: newVote } };
      try { localStorage.setItem(wowFeedbackKey(brainId), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function handleWowCorrection(headline: string, correction: string) {
    if (!brainId) return;
    setWowFeedback((prev) => {
      const existing = prev[headline] ?? { vote: "down" as const, correction: "" };
      const next = { ...prev, [headline]: { ...existing, correction } };
      try { localStorage.setItem(wowFeedbackKey(brainId), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  async function handleSaveWowFeedback(headline: string, correction: string) {
    if (!brainId || !correction.trim()) return;
    setSavingInsightFeedback((prev) => new Set([...prev, headline]));
    try {
      showToast("Analyzing your correction…", "success");
      const detail = insightsData?.wows.find((w) => w.headline === headline)?.detail ?? "";
      const res = await authFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "insight_correction", brain_id: brainId, headline, detail, correction: correction.trim() }),
      });
      if (!res.ok) throw new Error("Request failed");
      const { fixed_count } = await res.json();
      setSavedInsightFeedback((prev) => new Set([...prev, headline]));
      showToast(
        fixed_count > 0
          ? `Fixed ${fixed_count} ${fixed_count === 1 ? "entry" : "entries"} based on your correction.`
          : "Feedback saved — no entries needed correction.",
        "success",
      );
    } catch {
      showToast("Failed to apply correction. Try again.", "error");
    } finally {
      setSavingInsightFeedback((prev) => {
        const next = new Set(prev);
        next.delete(headline);
        return next;
      });
    }
  }

  function handleIgnore(m: MergeSuggestion, note?: string) {
    if (!brainId) return;
    const key = mergeId(m.ids);
    setIgnoredMerges((prev) => {
      const next = new Set(prev);
      next.add(key);
      // Store ids + optional note
      const existing: Array<{id: string; note?: string}> = [];
      try {
        const raw = localStorage.getItem(ignoredMergesKey(brainId));
        if (raw) {
          const parsed = JSON.parse(raw);
          // Support legacy format (plain string array) and new format
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
            parsed.forEach((id: string) => existing.push({ id }));
          } else {
            existing.push(...parsed);
          }
        }
      } catch { /* ignore */ }
      existing.push({ id: key, ...(note ? { note } : {}) });
      try { localStorage.setItem(ignoredMergesKey(brainId), JSON.stringify(existing)); } catch { /* ignore */ }
      return next;
    });
    setPendingMergeAction(null);
    // Remove from cache — if list becomes empty, clear the key so next load re-generates
    setInsightsData((prev) => prev ? { ...prev, merges: prev.merges.filter((x) => mergeId(x.ids) !== key) } : prev);
    const updatedAfterIgnore = (insightsData?.merges ?? []).filter((x) => mergeId(x.ids) !== key);
    if (updatedAfterIgnore.length > 0) {
      writeCache(mergeCacheKey(brainId), updatedAfterIgnore);
    } else {
      try { localStorage.removeItem(mergeCacheKey(brainId)); } catch { /* ignore */ }
    }
  }

  async function handleMerge(m: MergeSuggestion, note?: string) {
    if (!brainId || m.ids.length < 2 || mergingId) return;
    setPendingMergeAction(null);
    const key = mergeId(m.ids);
    setMergingId(key);
    try {
      // Fetch full entry data for both entries
      const r = await authFetch(`/api/entries?brain_id=${encodeURIComponent(brainId)}`);
      if (!r.ok) throw new Error("Failed to fetch entries");
      const { entries: allEntries } = await r.json();

      const [primary, ...secondaries] = m.ids
        .map((id: string) => allEntries.find((e: any) => e.id === id))
        .filter(Boolean);
      if (!primary) throw new Error("Entries not found");

      // Combine tags and metadata from all entries
      const combinedTags = [...new Set([
        ...(primary.tags || []),
        ...secondaries.flatMap((e: any) => e.tags || []),
      ])];
      const combinedMeta = secondaries.reduce(
        (acc: any, e: any) => ({ ...acc, ...(e.metadata || {}) }),
        { ...(primary.metadata || {}) },
      );
      // note goes to feedback system, not entry metadata

      // Use AI to synthesise a proper merged title + content
      const allEntryTexts = [primary, ...secondaries]
        .map((e: any) => `Title: ${e.title}\nContent: ${e.content || ""}`)
        .join("\n\n---\n\n");

      let mergedTitle = m.titles.join(" & ");
      let mergedContent = [primary, ...secondaries].map((e: any) => e.content).filter(Boolean).join("\n\n");

      try {
        const llmRes = await authFetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: `You are merging brain entries. Produce a single JSON object with exactly two keys: "title" (a concise title that represents ALL entities/topics covered) and "content" (a clean, synthesised paragraph that combines all facts from every entry without duplication). Do not add any explanation — output only the JSON.`,
            messages: [{ role: "user", content: allEntryTexts }],
            max_tokens: 600,
          }),
        });
        if (llmRes.ok) {
          const llmData = await llmRes.json();
          const text: string = llmData?.content?.[0]?.text || llmData?.text || "";
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.title) mergedTitle = parsed.title;
            if (parsed.content) mergedContent = parsed.content;
          }
        }
      } catch { /* fall back to concatenation */ }

      // PATCH primary — entries.ts resets enrichment flags automatically on content change
      const patchRes = await authFetch("/api/update-entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: primary.id,
          title: mergedTitle,
          content: mergedContent,
          tags: combinedTags,
          metadata: combinedMeta,
        }),
      });
      if (!patchRes.ok) throw new Error("Failed to update entry");

      // Soft-delete secondary entries
      for (const secondary of secondaries) {
        await authFetch("/api/delete-entry", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: secondary.id }),
        });
      }

      // Permanently suppress this pair so it never reappears (same mechanism as ignore)
      setIgnoredMerges((prev) => {
        const next = new Set(prev);
        next.add(key);
        try {
          const existing: Array<{id: string; note?: string}> = [];
          const raw = localStorage.getItem(ignoredMergesKey(brainId));
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
              parsed.forEach((id: string) => existing.push({ id }));
            } else {
              existing.push(...parsed);
            }
          }
          existing.push({ id: key });
          localStorage.setItem(ignoredMergesKey(brainId), JSON.stringify(existing));
        } catch { /* ignore */ }
        return next;
      });

      // Send merge note to feedback system for self-improvement
      if (note?.trim()) {
        authFetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "merge_feedback", brain_id: brainId, titles: m.titles, note: note.trim() }),
        }).catch(() => { /* non-critical */ });
      }

      // Remove from in-memory suggestions + cache — if empty, clear key so next load re-generates
      setInsightsData((prev) => {
        if (!prev) return prev;
        const updated = prev.merges.filter((x) => mergeId(x.ids) !== key);
        if (updated.length > 0) {
          writeCache(mergeCacheKey(brainId), updated);
        } else {
          try { localStorage.removeItem(mergeCacheKey(brainId)); } catch { /* ignore */ }
        }
        return { ...prev, merges: updated };
      });

      showToast("Entries merged — re-enriching now…", "success");
      onEnrich?.();
    } catch (e: any) {
      console.error("[merge]", e);
      showToast("Merge failed. Try again.", "error");
    } finally {
      setMergingId(null);
    }
  }

  async function submitAnswer() {
    if (!activeQ || !answer.trim() || !brainId) return;
    setSaving(true);
    setQaError(null);
    try {
      const rawText = `Q: ${activeQ.q}\nA: ${answer.trim()}`;

      let title = activeQ.q;
      let content = answer.trim();
      let type = "note";
      let metadata: any = {};
      let tags: string[] = [activeQ.cat];

      const llmRes = await authFetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: PROMPTS.CAPTURE,
          messages: [{ role: "user", content: rawText }],
          max_tokens: 800,
        }),
      });
      if (llmRes.ok) {
        const llmData = await llmRes.json();
        const text: string = llmData?.content?.[0]?.text || llmData?.text || "";
        const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
        if (jsonMatch) {
          try {
            let parsed: any = JSON.parse(jsonMatch[0]);
            const result = Array.isArray(parsed) ? parsed[0] : parsed;
            if (result?.type) {
              type = result.type;
              content = result.content || content;
              const m = { ...(result.metadata || {}) };
              delete m.confidence;
              metadata = m;
              if (result.tags?.length) tags = result.tags;
            }
          } catch { /* keep defaults */ }
        }
      }

      if (!metadata.full_text) metadata = { ...metadata, full_text: rawText };

      const capRes = await authFetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_title: title,
          p_content: content,
          p_type: type,
          p_metadata: metadata,
          p_tags: tags,
          p_brain_id: brainId,
        }),
      });
      if (!capRes.ok) throw new Error("save failed");
      const newEntry = await capRes.json();

      onCreated?.({
        id: newEntry.id,
        title,
        content,
        type,
        metadata,
        tags,
        brain_id: brainId,
        created_at: new Date().toISOString(),
      });

      setDoneQs((prev) => new Set([...prev, activeQ.q]));
      setActiveQ(null);
      setAnswer("");
    } catch {
      setQaError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // Full-page skeleton only on very first load (no cache at all)
  if (quickLoading && !quickData) {
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

  if (!quickLoading && quickData && quickData.stats.entries === 0) {
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
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {quickLoading ? "Loading your entries…" : `${quickData?.stats.entries ?? 0} entries loaded`}
      </div>

      <EarlyAccessBanner />

      {/* Bulk enrichment banner */}
      {(unenrichedCount > 0 || enriching) && onEnrich && (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            background: "color-mix(in oklch, var(--color-secondary) 8%, var(--color-surface))",
            borderColor: "color-mix(in oklch, var(--color-secondary) 22%, transparent)",
          }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold" style={{ color: "var(--color-on-surface)" }}>
                {enriching && enrichProgress
                  ? `Enriching ${enrichProgress.done} of ${enrichProgress.total}…`
                  : `${unenrichedCount} ${unenrichedCount === 1 ? "memory needs" : "memories need"} enrichment`}
              </p>
              {!enriching && (
                <p className="text-[10px] leading-tight" style={{ color: "var(--color-on-surface-variant)" }}>
                  Parsing, embedding, concepts & insights missing
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!enriching && unenrichedDetails.length > 0 && (
                <button
                  onClick={() => setShowEnrichDebug((v) => !v)}
                  className="rounded-lg px-2 py-1 text-[10px] font-medium border"
                  style={{ borderColor: "color-mix(in oklch, var(--color-secondary) 40%, transparent)", color: "var(--color-on-surface-variant)" }}
                >
                  {showEnrichDebug ? "Hide" : "Details"}
                </button>
              )}
              <button
                onClick={onEnrich}
                disabled={enriching}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: "var(--color-secondary)", color: "var(--color-on-secondary)" }}
              >
                {enriching ? "Running…" : "Enrich Now"}
              </button>
            </div>
          </div>

          {showEnrichDebug && !enriching && unenrichedDetails.length > 0 && (
            <div
              className="border-t px-4 py-2 space-y-1.5 max-h-48 overflow-y-auto"
              style={{ borderColor: "color-mix(in oklch, var(--color-secondary) 22%, transparent)" }}
            >
              {unenrichedDetails.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--color-on-surface)" }}>
                      {item.title}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--color-error)" }}>
                      missing: {item.gaps.join(", ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FAST sections (DB-backed) ── */}

      {/* Greeting + stats */}
      {quickData && (
        <div
          className="rounded-3xl border px-5 py-4"
          style={{
            background: "color-mix(in oklch, var(--color-primary) 8%, var(--color-surface))",
            borderColor: "color-mix(in oklch, var(--color-primary) 18%, transparent)",
          }}
        >
          <p className="text-on-surface text-base font-bold" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            {insightsLoading
              ? `${quickData.greeting.replace(/\.$/, ",")} your brain is loading…`
              : `${quickData.greeting} Here's what your brain surfaced today:`}
          </p>
          <div className="text-on-surface-variant mt-2 flex flex-wrap gap-4 text-xs">
            <span>{quickData.stats.entries} memories</span>
            {quickData.streak.current > 0 && (
              <span>🔥 {quickData.streak.current}-day streak</span>
            )}
          </div>
        </div>
      )}

      {/* Resurfaced memories */}
      {quickData && quickData.resurfaced.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            From your memory
          </p>
          {quickData.resurfaced.map((entry) => (
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

      {/* ── SLOW sections (LLM-backed) ── */}

      {/* Wow moments */}
      {insightsLoading ? (
        <div
          className="h-20 animate-pulse rounded-2xl"
          style={{ background: "var(--color-surface-container)" }}
        />
      ) : insightsData && insightsData.wows.length > 0 ? (
        <div className="space-y-2">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-status-medium)" }}
          >
            Your brain just connected the dots
          </p>
          {insightsData.wows.map((wow, i) => {
            const fb = wowFeedback[wow.headline] ?? { vote: null, correction: "" };
            return (
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
                <p className="text-on-surface-variant mt-1 text-xs leading-relaxed line-clamp-3">
                  {wow.detail}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => handleWowVote(wow.headline, "up")}
                    className="rounded-lg px-2 py-0.5 text-sm border transition-opacity"
                    style={{
                      borderColor: "color-mix(in oklch, var(--color-status-medium) 40%, transparent)",
                      opacity: fb.vote === "up" ? 1 : 0.4,
                    }}
                    title="This is correct"
                  >
                    👍
                  </button>
                  <button
                    onClick={() => handleWowVote(wow.headline, "down")}
                    className="rounded-lg px-2 py-0.5 text-sm border transition-opacity"
                    style={{
                      borderColor: "color-mix(in oklch, var(--color-status-medium) 40%, transparent)",
                      opacity: fb.vote === "down" ? 1 : 0.4,
                    }}
                    title="This is wrong"
                  >
                    👎
                  </button>
                  {fb.vote === "down" && (
                    <span className="text-[10px]" style={{ color: "var(--color-on-surface-variant)" }}>
                      What's wrong?
                    </span>
                  )}
                </div>
                {fb.vote === "down" && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={fb.correction}
                      onChange={(e) => handleWowCorrection(wow.headline, e.target.value)}
                      placeholder="e.g. My staff are not suppliers"
                      maxLength={200}
                      className="flex-1 rounded-lg border px-2 py-1 text-xs outline-none"
                      style={{
                        background: "var(--color-surface-container-low)",
                        borderColor: "var(--color-outline-variant)",
                        color: "var(--color-on-surface)",
                      }}
                    />
                    {fb.correction && (
                      <button
                        onClick={() => handleSaveWowFeedback(wow.headline, fb.correction)}
                        disabled={savingInsightFeedback.has(wow.headline) || savedInsightFeedback.has(wow.headline)}
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold disabled:opacity-50"
                        style={{ background: "var(--color-error)", color: "#fff" }}
                      >
                        {savingInsightFeedback.has(wow.headline) ? "Fixing…" : savedInsightFeedback.has(wow.headline) ? "Fixed ✓" : "Save"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Brain suggestions */}
      {insightsLoading ? (
        <div
          className="h-20 animate-pulse rounded-2xl"
          style={{ background: "var(--color-surface-container)" }}
        />
      ) : insightsData && insightsData.suggestions.filter((s) => !ignoredQuestions.has(s.q)).length > 0 ? (
        <div className="space-y-2">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Your brain is asking
          </p>
          {insightsData.suggestions.filter((s) => !ignoredQuestions.has(s.q)).map((s, i) => {
            const isDone = doneQs.has(s.q);
            const isOpen = activeQ?.q === s.q;
            return (
              <div
                key={i}
                className="rounded-2xl border overflow-hidden"
                style={{
                  background: isDone
                    ? "color-mix(in oklch, var(--color-primary) 6%, var(--color-surface))"
                    : "color-mix(in oklch, var(--color-secondary) 8%, var(--color-surface))",
                  borderColor: isDone
                    ? "color-mix(in oklch, var(--color-primary) 20%, transparent)"
                    : "color-mix(in oklch, var(--color-secondary) 18%, transparent)",
                }}
              >
                <button
                  onClick={() => {
                    if (isDone) return;
                    setActiveQ(isOpen ? null : s);
                    setAnswer("");
                    setQaError(null);
                  }}
                  className="press-scale flex w-full items-start gap-3 p-4 text-left"
                >
                  <span className="text-base">{isDone ? "✅" : "💬"}</span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs font-semibold uppercase tracking-wide mb-0.5"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      {s.cat}
                    </p>
                    <p
                      className="text-sm font-semibold leading-snug"
                      style={{ color: isDone ? "var(--color-on-surface-variant)" : "var(--color-on-surface)", textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.6 : 1 }}
                    >
                      {s.q}
                    </p>
                  </div>
                  {!isDone && (
                    <div className="flex items-center gap-1 self-center flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleIgnoreQuestion(s.q); }}
                        className="rounded-lg px-2 py-0.5 text-[10px] font-medium border"
                        style={{
                          borderColor: "color-mix(in oklch, var(--color-secondary) 30%, transparent)",
                          color: "var(--color-on-surface-variant)",
                        }}
                        title="Ignore this question"
                      >
                        Ignore
                      </button>
                      <span className="text-on-surface-variant text-xs">{isOpen ? "↑" : "↓"}</span>
                    </div>
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Type your answer…"
                      rows={3}
                      className="w-full rounded-xl border px-3 py-2 text-sm resize-none outline-none"
                      style={{
                        background: "var(--color-surface-container-low)",
                        borderColor: "var(--color-outline-variant)",
                        color: "var(--color-on-surface)",
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium border"
                        style={{ borderColor: "var(--color-outline-variant)", color: "var(--color-on-surface-variant)" }}
                        title="Upload file"
                      >
                        📎 File
                      </button>
                      <button
                        onClick={listening ? stopVoice : startVoice}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium border"
                        style={{
                          borderColor: listening ? "var(--color-error)" : "var(--color-outline-variant)",
                          color: listening ? "var(--color-error)" : "var(--color-on-surface-variant)",
                        }}
                        title="Voice input"
                      >
                        {listening ? "⏹ Stop" : "🎤 Voice"}
                      </button>
                      <div className="flex-1" />
                      <button
                        onClick={submitAnswer}
                        disabled={!answer.trim() || saving}
                        className="rounded-xl px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
                        style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                      >
                        {saving ? "Saving…" : "Save to Brain"}
                      </button>
                    </div>
                    {qaError && (
                      <p className="text-xs" style={{ color: "var(--color-error)" }}>{qaError}</p>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.md,.csv,.json"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Merge suggestions */}
      {insightsLoading ? (
        <div
          className="h-16 animate-pulse rounded-2xl"
          style={{ background: "var(--color-surface-container)" }}
        />
      ) : insightsData && insightsData.merges && insightsData.merges.filter((m) => !ignoredMerges.has(mergeId(m.ids))).length > 0 ? (
        <div className="space-y-2">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Consider merging
          </p>
          {insightsData.merges
            .filter((m) => !ignoredMerges.has(mergeId(m.ids)))
            .map((m) => {
              const key = mergeId(m.ids);
              const isMerging = mergingId === key;
              return (
                <div
                  key={key}
                  className="rounded-2xl border p-4"
                  style={{
                    background: "color-mix(in oklch, var(--color-tertiary) 8%, var(--color-surface))",
                    borderColor: "color-mix(in oklch, var(--color-tertiary) 20%, transparent)",
                  }}
                >
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {m.titles.map((t, j) => (
                      <span
                        key={j}
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                        style={{
                          background: "var(--color-tertiary-container)",
                          color: "var(--color-on-tertiary-container)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-on-surface-variant)" }}>
                    {m.reason}
                  </p>
                  {pendingMergeAction?.mergeKey === key ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={pendingMergeAction.note}
                        onChange={(e) => setPendingMergeAction((p) => p ? { ...p, note: e.target.value } : p)}
                        placeholder={pendingMergeAction.action === "ignore" ? "Why are you ignoring this? (optional)" : "Why are you merging these? (optional)"}
                        rows={2}
                        maxLength={300}
                        className="w-full rounded-xl border px-3 py-2 text-xs resize-none outline-none"
                        style={{
                          background: "var(--color-surface-container-low)",
                          borderColor: "var(--color-outline-variant)",
                          color: "var(--color-on-surface)",
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPendingMergeAction(null)}
                          className="flex-1 rounded-xl border py-2 text-xs font-medium"
                          style={{
                            borderColor: "color-mix(in oklch, var(--color-tertiary) 35%, transparent)",
                            color: "var(--color-on-surface-variant)",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (pendingMergeAction.action === "ignore") handleIgnore(m, pendingMergeAction.note || undefined);
                            else handleMerge(m, pendingMergeAction.note || undefined);
                          }}
                          disabled={isMerging}
                          className="flex-[2] rounded-xl py-2 text-xs font-semibold disabled:opacity-40"
                          style={{
                            background: pendingMergeAction.action === "merge" ? "var(--color-tertiary)" : "var(--color-surface-container-high)",
                            color: pendingMergeAction.action === "merge" ? "var(--color-on-tertiary)" : "var(--color-on-surface)",
                          }}
                        >
                          {isMerging ? "Merging…" : `Confirm ${pendingMergeAction.action === "merge" ? "Merge" : "Ignore"}`}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => setPendingMergeAction({ mergeKey: key, action: "ignore", note: "" })}
                        disabled={isMerging}
                        className="flex-1 rounded-xl border py-2 text-xs font-medium transition-colors disabled:opacity-40"
                        style={{
                          borderColor: "color-mix(in oklch, var(--color-tertiary) 35%, transparent)",
                          color: "var(--color-on-surface-variant)",
                        }}
                      >
                        Ignore
                      </button>
                      <button
                        onClick={() => setPendingMergeAction({ mergeKey: key, action: "merge", note: "" })}
                        disabled={isMerging || !!mergingId}
                        className="flex-[2] rounded-xl py-2 text-xs font-semibold transition-colors disabled:opacity-40"
                        style={{
                          background: "var(--color-tertiary)",
                          color: "var(--color-on-tertiary)",
                        }}
                      >
                        {isMerging ? "Merging…" : "Merge"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : null}

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
