import { useState, useEffect, useRef } from "react";
import { authFetch } from "../lib/authFetch";
import { fmtD } from "../data/constants";
import { EarlyAccessBanner } from "../components/EarlyAccessBanner";
import { PROMPTS } from "../config/prompts";

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

interface FeedData {
  greeting: string;
  resurfaced: FeedEntry[];
  wows: Wow[];
  suggestions: Suggestion[];
  streak: { current: number; longest: number };
  stats: { entries: number; connections: number; insights: number };
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
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!brainId) return;
    setLoading(true);
    authFetch(`/api/feed?brain_id=${encodeURIComponent(brainId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch((err) => console.error("[FeedView]", err))
      .finally(() => setLoading(false));
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

  async function submitAnswer() {
    if (!activeQ || !answer.trim() || !brainId) return;
    setSaving(true);
    setQaError(null);
    try {
      const rawText = `Q: ${activeQ.q}\nA: ${answer.trim()}`;

      // 1. Parse with CAPTURE prompt for full structure
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

      // Store the raw Q&A source so Full Content shows in the detail modal
      if (!metadata.full_text) metadata = { ...metadata, full_text: rawText };

      // 2. Save via capture API (auto-embeds)
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

      // 3. Fire concepts + insight in background via handleCreated
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
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {loading ? "Loading your entries…" : `${data?.stats.entries ?? 0} entries loaded`}
      </div>

      <EarlyAccessBanner />

      {/* Bulk enrichment banner — only when there are unenriched entries */}
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

      {/* Brain suggestions */}
      {data.suggestions && data.suggestions.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Your brain is asking
          </p>
          {data.suggestions.map((s, i) => {
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
                    <span className="text-on-surface-variant self-center text-xs">{isOpen ? "↑" : "↓"}</span>
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
