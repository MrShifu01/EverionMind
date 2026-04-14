import { useState, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { fmtD } from "../data/constants";
import { EarlyAccessBanner } from "../components/EarlyAccessBanner";

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
}

export default function FeedView({ brainId, onCapture, onSelectEntry, onNavigate }: FeedViewProps) {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!brainId) return;
    setLoading(true);
    authFetch(`/api/feed?brain_id=${encodeURIComponent(brainId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch((err) => console.error("[FeedView]", err))
      .finally(() => setLoading(false));
  }, [brainId]);

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
