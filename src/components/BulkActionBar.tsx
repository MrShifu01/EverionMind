import { useState, useRef, useEffect, useMemo } from "react";
import { authFetch } from "../lib/authFetch";
import { CANONICAL_TYPES } from "../types";
import type { Brain, Entry } from "../types";
import { Button } from "./ui/button";
import { useTypeSuggestions } from "../hooks/useTypeSuggestions";

interface Props {
  selectedIds: Set<string>;
  entries: Entry[];
  brains: Brain[];
  onDone: (updatedEntries: Entry[]) => void;
  onCancel: () => void;
}

export default function BulkActionBar({ selectedIds, entries, brains, onDone, onCancel }: Props) {
  const [targetType, setTargetType] = useState("");
  const [targetBrainIds, setTargetBrainIds] = useState<Set<string>>(new Set());

  const { smartTypes, typeFreq } = useMemo(() => {
    const f: Record<string, number> = {};
    for (const e of entries) f[e.type] = (f[e.type] || 0) + 1;
    return {
      typeFreq: f,
      smartTypes: [...CANONICAL_TYPES].sort((a, b) => (f[b] || 0) - (f[a] || 0)),
    };
  }, [entries]);
  const { suggestions: aiTypeSuggestions, loading: aiTypeLoading, suggest: suggestTypes, clear: clearTypeSuggestions } = useTypeSuggestions();

  const [progress, setProgress] = useState<string | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [brainsOpen, setBrainsOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);
  const brainsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
      if (brainsRef.current && !brainsRef.current.contains(e.target as Node)) setBrainsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // AI suggestions based on selected entries' combined titles
  useEffect(() => {
    if (!typeOpen) return;
    const selectedEntries = entries.filter((e) => selectedIds.has(e.id));
    const text = selectedEntries.map((e) => e.title).join(", ");
    if (text) suggestTypes(text, Object.keys(typeFreq));
  }, [typeOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = selectedIds.size;
  const hasAction = !!targetType || targetBrainIds.size > 0;

  function toggleBrain(id: string) {
    setTargetBrainIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (!hasAction) return;
    const ids = [...selectedIds];
    const updated: Entry[] = [];
    let done = 0;

    setProgress(`Updating 0 / ${ids.length}…`);

    for (const id of ids) {
      if (targetType) {
        try {
          const res = await authFetch("/api/update-entry", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, type: targetType }),
          });
          if (res.ok) updated.push(await res.json());
        } catch { /* skip */ }
      }

      for (const brain_id of targetBrainIds) {
        try {
          await authFetch("/api/entry-brains", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entry_id: id, brain_id }),
          });
        } catch { /* skip */ }
      }

      done++;
      setProgress(`Updating ${done} / ${ids.length}…`);
    }

    setProgress(null);
    onDone(updated);
  }

  const selectedBrainNames = brains.filter((b) => targetBrainIds.has(b.id)).map((b) => b.name);

  return (
    <div className="fixed bottom-20 left-1/2 z-50 w-[min(92vw,480px)] -translate-x-1/2">
      <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-high p-4 shadow-[var(--shadow-lg)]">

        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-on-surface">
            {count} {count === 1 ? "entry" : "entries"} selected
          </span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {/* Type picker — upward dropdown */}
          <div ref={typeRef} className="relative flex flex-1 flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Change type
            </label>
            <button
              type="button"
              onClick={() => { setTypeOpen((p) => !p); setBrainsOpen(false); }}
              className="flex w-full items-center justify-between rounded-xl border border-outline-variant bg-transparent px-2.5 py-1.5 text-left text-xs text-on-surface outline-none transition-colors hover:bg-surface-container"
            >
              <span className="truncate">
                {targetType ? targetType.charAt(0).toUpperCase() + targetType.slice(1) : "— keep —"}
              </span>
              <svg
                className={`h-3 w-3 flex-shrink-0 transition-transform ${typeOpen ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {typeOpen && (
              <div className="absolute bottom-full left-0 right-0 z-[200] mb-1 max-h-[180px] overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-high shadow-[var(--shadow-md)]">
                <button
                  type="button"
                  onClick={() => { setTargetType(""); setTypeOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-on-surface-variant transition-colors hover:bg-surface-container"
                >
                  — keep —
                </button>
                {/* AI suggestions */}
                {aiTypeLoading && (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                    <span className="flex gap-0.5"><span className="typing-dot"/><span className="typing-dot"/><span className="typing-dot"/></span>
                    AI thinking…
                  </div>
                )}
                {!aiTypeLoading && aiTypeSuggestions.length > 0 && (
                  <>
                    {aiTypeSuggestions.map((t) => (
                      <button
                        key={`ai-${t}`}
                        type="button"
                        onClick={() => { setTargetType(t); setTypeOpen(false); clearTypeSuggestions(); }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs text-on-surface transition-colors hover:bg-surface-container ${targetType === t ? "bg-primary-container" : ""}`}
                      >
                        <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>AI</span>
                      </button>
                    ))}
                    <div className="mx-3 my-1 border-t" style={{ borderColor: "var(--color-outline-variant)" }} />
                  </>
                )}
                {/* Brain frequency-sorted types */}
                {smartTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTargetType(t); setTypeOpen(false); }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs text-on-surface transition-colors hover:bg-surface-container ${targetType === t ? "bg-primary-container" : ""}`}
                  >
                    <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                    {(typeFreq[t] || 0) > 0 && (
                      <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{typeFreq[t]}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Brain multi-picker */}
          <div ref={brainsRef} className="relative flex flex-1 flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Add to brains
            </label>
            <button
              type="button"
              onClick={() => { setBrainsOpen((p) => !p); setTypeOpen(false); }}
              className="flex w-full items-center justify-between rounded-xl border border-outline-variant bg-transparent px-2.5 py-1.5 text-left text-xs text-on-surface outline-none transition-colors hover:bg-surface-container"
            >
              <span className="truncate">
                {targetBrainIds.size === 0 ? "— none —" : selectedBrainNames.join(", ")}
              </span>
              <svg
                className={`h-3 w-3 flex-shrink-0 transition-transform ${brainsOpen ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {brainsOpen && (
              <div className="absolute bottom-full left-0 right-0 z-[200] mb-1 max-h-[180px] overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-high shadow-[var(--shadow-md)]">
                {brains.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBrain(b.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 ${targetBrainIds.has(b.id) ? "border-primary bg-primary" : "border-outline-variant bg-transparent"}`}>
                      {targetBrainIds.has(b.id) && (
                        <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                    <span className="truncate">{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Apply */}
        <Button
          onClick={apply}
          disabled={!hasAction || !!progress}
          className="w-full"
          size="lg"
        >
          {progress ?? `Apply to ${count} ${count === 1 ? "entry" : "entries"}`}
        </Button>
      </div>
    </div>
  );
}
