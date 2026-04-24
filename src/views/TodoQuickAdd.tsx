import { useState, useMemo, useRef } from "react";
import { format } from "date-fns";
import * as chrono from "chrono-node";
import { authFetch } from "../lib/authFetch";

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

interface Props {
  brainId?: string;
  onAdded: () => void;
}

export default function TodoQuickAdd({ brainId, onAdded }: Props) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Parse natural language date from the title as the user types
  const parsed = useMemo(() => {
    if (!title.trim()) return null;
    const results = chrono.parse(title, new Date(), { forwardDate: true });
    if (!results.length) return null;
    const r = results[0];
    return { date: r.date(), text: r.text };
  }, [title]);

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
    // Strip the recognised date phrase from the title
    const cleanTitle = parsed
      ? raw
          .replace(parsed.text, "")
          .replace(/\s{2,}/g, " ")
          .trim() || raw
      : raw;
    const metadata: Record<string, string> = { status: "todo" };
    if (parsed) metadata.due_date = format(parsed.date, "yyyy-MM-dd");
    await authFetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_title: cleanTitle,
        p_type: "todo",
        p_brain_id: brainId,
        p_metadata: metadata,
      }),
    }).catch(() => null);
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
      className="flex items-center gap-2 rounded-2xl border px-3 py-2"
      style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
    >
      <CheckCircleIcon className="h-4 w-4 shrink-0" style={{ color: "var(--ink-ghost)" }} />
      <div className="min-w-0 flex-1">
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
              submit(e as React.FormEvent);
            }
          }}
          placeholder="Add a todo… (e.g. 'Call John next Thursday')"
          disabled={busy}
          className="w-full bg-transparent text-sm outline-none"
          style={{
            color: "var(--ink)",
            fontFamily: "var(--f-sans)",
            resize: "none",
            overflow: "hidden",
            lineHeight: "1.5",
          }}
        />
        {parsed && (
          <div className="mt-0.5 flex items-center gap-1">
            <span
              style={{
                fontSize: 11,
                color: "var(--ember)",
                fontFamily: "var(--f-sans)",
                fontWeight: 600,
              }}
            >
              📅 {format(parsed.date, "EEE, d MMM")}
            </span>
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-opacity disabled:opacity-40"
        style={{
          background: "var(--ember)",
          color: "var(--ember-ink)",
          fontFamily: "var(--f-sans)",
        }}
      >
        {busy ? "…" : "Add"}
      </button>
    </form>
  );
}
