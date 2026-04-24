import { useState } from "react";
import type { Entry } from "../types";

const REPEAT_OPTIONS = [
  { value: "none", label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

function getRepeat(entry: Entry): string {
  const m = (entry.metadata || {}) as Record<string, unknown>;
  const r = String(m.repeat ?? "");
  return REPEAT_OPTIONS.some((o) => o.value === r) ? r : "none";
}

interface Props {
  entry: Entry;
  rect: DOMRect;
  onClose: () => void;
  onSave: (changes: Partial<Entry>) => Promise<void>;
}

export default function TodoEditPopover({ entry, rect, onClose, onSave }: Props) {
  const [title, setTitle] = useState(entry.title || "");
  const [content, setContent] = useState(entry.content || "");
  const [dueDate, setDueDate] = useState(
    String((entry.metadata as { due_date?: string } | undefined)?.due_date ?? ""),
  );
  const [repeat, setRepeat] = useState(getRepeat(entry));
  const [saving, setSaving] = useState(false);

  const W = 320;
  const EST_H = 310;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top =
    rect.bottom + 8 + EST_H > vh - 8 ? Math.max(8, rect.top - EST_H - 8) : rect.bottom + 8;
  const left = Math.min(Math.max(8, rect.left), vw - W - 16);

  async function save() {
    setSaving(true);
    const meta = { ...(entry.metadata || {}) } as Record<string, unknown>;
    if (dueDate) meta.due_date = dueDate;
    else delete meta.due_date;
    if (repeat !== "none") meta.repeat = repeat;
    else delete meta.repeat;
    await onSave({ title, content, metadata: meta as Entry["metadata"] });
    setSaving(false);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 rounded-2xl border shadow-xl"
        style={{
          top,
          left,
          width: W,
          background: "var(--surface)",
          borderColor: "var(--line-soft)",
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span
            className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--ink-ghost)", fontFamily: "var(--f-sans)" }}
          >
            Edit
          </span>
          <button
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none"
            style={{ color: "var(--ink-ghost)", background: "var(--surface-high)" }}
          >
            ×
          </button>
        </div>
        <div className="space-y-2.5 px-4 pb-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="w-full rounded-xl border px-3 py-2 text-sm font-medium outline-none"
            style={{
              background: "var(--surface-low)",
              borderColor: "var(--line-soft)",
              color: "var(--ink)",
              fontFamily: "var(--f-sans)",
            }}
            placeholder="Title"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-low)",
              borderColor: "var(--line-soft)",
              color: "var(--ink)",
              fontFamily: "var(--f-sans)",
            }}
            placeholder="Notes"
          />
          <div className="flex items-center gap-3">
            <span
              className="w-14 shrink-0 text-xs"
              style={{ color: "var(--ink-faint)", fontFamily: "var(--f-sans)" }}
            >
              Date
            </span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1 rounded-xl border px-3 py-1.5 text-sm outline-none"
              style={{
                background: "var(--surface-low)",
                borderColor: "var(--line-soft)",
                color: dueDate ? "var(--ember)" : "var(--ink-ghost)",
                fontFamily: "var(--f-sans)",
              }}
            />
            {dueDate && (
              <button
                onClick={() => setDueDate("")}
                className="shrink-0 text-sm leading-none"
                style={{ color: "var(--ink-ghost)" }}
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              className="w-14 shrink-0 text-xs"
              style={{ color: "var(--ink-faint)", fontFamily: "var(--f-sans)" }}
            >
              Repeat
            </span>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className="flex-1 rounded-xl border px-3 py-1.5 text-sm outline-none"
              style={{
                background: "var(--surface-low)",
                borderColor: "var(--line-soft)",
                color: "var(--ink)",
                fontFamily: "var(--f-sans)",
                cursor: "pointer",
              }}
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="w-full rounded-xl py-2 text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{
              background: "var(--ember)",
              color: "var(--ember-ink)",
              fontFamily: "var(--f-sans)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
