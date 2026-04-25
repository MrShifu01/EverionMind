import { useState, useMemo, useRef } from "react";
import { format } from "date-fns";
import { parseTask } from "../lib/nlpParser";
import { authFetch } from "../lib/authFetch";
import { enqueue } from "../lib/offlineQueue";

function CheckCircleIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  p1: "var(--ember)",
  p2: "oklch(72% 0.16 68)",
  p3: "var(--ink-soft)",
  p4: "var(--ink-ghost)",
};

interface Props {
  brainId?: string;
  onAdded: () => void;
}

export default function TodoQuickAdd({ brainId, onAdded }: Props) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo(() => (title.trim() ? parseTask(title) : null), [title]);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = title.trim();
    if (!raw || !brainId) return;
    setBusy(true);
    const result = parsed ?? { cleanTitle: raw, dueDate: null, dayOfMonth: null, priority: null, tags: [], energy: null };
    const metadata: Record<string, unknown> = { status: "todo" };
    if (result.dueDate) metadata.due_date = result.dueDate;
    if (result.dayOfMonth) metadata.day_of_month = result.dayOfMonth;
    if (result.priority) metadata.priority = result.priority;
    if (result.energy) metadata.energy = result.energy;
    const captureBody = JSON.stringify({
      p_title: result.cleanTitle || raw,
      p_type: "todo",
      p_brain_id: brainId,
      p_tags: result.tags.length ? result.tags : undefined,
      p_metadata: metadata,
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await authFetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: captureBody,
        signal: controller.signal,
      });
      // §2.5: Enqueue for offline replay if the request failed due to network
      if (!res.ok && !navigator.onLine) {
        await enqueue({ id: crypto.randomUUID(), url: "/api/capture", method: "POST", body: captureBody, created_at: new Date().toISOString() }).catch(() => {});
      }
    } catch {
      // Network error — enqueue for retry when online
      if (!navigator.onLine) {
        await enqueue({ id: crypto.randomUUID(), url: "/api/capture", method: "POST", body: captureBody, created_at: new Date().toISOString() }).catch(() => {});
      }
    } finally {
      clearTimeout(timeoutId);
    }
    setTitle("");
    setBusy(false);
    onAdded();
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.focus();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 rounded-2xl border px-3"
      style={{
        background: "var(--surface)",
        borderColor: "var(--line-soft)",
        minHeight: 48,
      }}
    >
      <CheckCircleIcon className="h-4 w-4 shrink-0" style={{ color: "var(--ink-ghost)" }} />
      <div
        className="min-w-0 flex-1"
        style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 6, paddingBottom: 6 }}
      >
        <textarea
          ref={inputRef}
          value={title}
          rows={1}
          onChange={(e) => {
            setTitle(e.target.value);
            autoResize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!busy) submit(e as React.FormEvent);
            }
          }}
          placeholder="Add a todo… e.g. 'Pay rent p1 #Finance !high next Friday'"
          disabled={busy}
          className="w-full bg-transparent text-sm outline-none"
          style={{
            color: "var(--ink)",
            fontFamily: "var(--f-sans)",
            resize: "none",
            overflow: "hidden",
            lineHeight: "1.5",
            padding: 0,
            display: "block",
            margin: 0,
          }}
        />
        {parsed && (parsed.dueDate || parsed.dayOfMonth || parsed.priority || parsed.tags.length > 0 || parsed.energy) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {parsed.dayOfMonth && (
              <span style={{ fontSize: 11, color: "var(--ember)", fontFamily: "var(--f-sans)", fontWeight: 600 }}>
                🔁 every {parsed.dayOfMonth}{["st","nd","rd"][((parsed.dayOfMonth % 100 - 20) % 10) - 1] ?? "th"}
              </span>
            )}
            {parsed.dueDate && !parsed.dayOfMonth && (
              <span style={{ fontSize: 11, color: "var(--ember)", fontFamily: "var(--f-sans)", fontWeight: 600 }}>
                📅 {format(new Date(parsed.dueDate + "T12:00:00"), "EEE, d MMM")}
              </span>
            )}
            {parsed.priority && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: `${PRIORITY_COLOR[parsed.priority]}22`,
                  color: PRIORITY_COLOR[parsed.priority],
                  fontFamily: "var(--f-sans)",
                  textTransform: "uppercase",
                }}
              >
                {parsed.priority}
              </span>
            )}
            {parsed.energy && (
              <span style={{ fontSize: 11, color: "var(--ink-soft)", fontFamily: "var(--f-sans)" }}>
                {parsed.energy === "high" ? "⚡" : parsed.energy === "low" ? "🌿" : "〰️"} {parsed.energy}
              </span>
            )}
            {parsed.tags.map((t) => (
              <span key={t} style={{ fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--f-sans)" }}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-opacity disabled:opacity-40"
        style={{ background: "var(--ember)", color: "var(--ember-ink)", fontFamily: "var(--f-sans)" }}
      >
        {busy ? "…" : "Add"}
      </button>
    </form>
  );
}
