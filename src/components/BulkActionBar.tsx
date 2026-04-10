import { useState, useRef, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { CANONICAL_TYPES } from "../types";
import { getUserProvider, getUserApiKey, getOpenRouterKey, getOpenRouterModel, getUserModel } from "../lib/aiSettings";
import type { Brain, Entry } from "../types";

interface Props {
  selectedIds: Set<string>;
  entries: Entry[];
  brains: Brain[];
  onDone: (updatedEntries: Entry[]) => void;
  onCancel: () => void;
}

export default function BulkActionBar({ selectedIds, entries: _entries, brains, onDone, onCancel }: Props) {
  const [targetType, setTargetType] = useState("");
  const [targetBrainIds, setTargetBrainIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [brainsOpen, setBrainsOpen] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
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

  const count = selectedIds.size;
  const hasAction = !!targetType || targetBrainIds.size > 0;

  async function suggestType() {
    setAiTyping(true);
    try {
      const selected = _entries.filter(e => selectedIds.has(e.id)).slice(0, 5);
      const sample = selected.map(e => `- ${e.title}: ${(e.content || "").slice(0, 120)}`).join("\n");
      const provider = getUserProvider();
      const apiKey = provider === "openrouter" ? getOpenRouterKey() : getUserApiKey();
      const model = provider === "openrouter" ? (getOpenRouterModel() || "") : getUserModel();
      const endpoint = provider === "openai" ? "/api/openai" : provider === "openrouter" ? "/api/openrouter" : "/api/anthropic";
      const types = CANONICAL_TYPES.filter(t => t !== "secret");
      const res = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-api-key": apiKey || "", "x-provider": provider, "x-model": model },
        body: JSON.stringify({
          system: `Reply with ONE word only — the best category for these entries. Pick from: ${types.join(", ")}. No explanation.`,
          messages: [{ role: "user", content: `Entries:\n${sample}` }],
          max_tokens: 20,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const full = (data.content?.[0]?.text || data.choices?.[0]?.message?.content || "").trim().toLowerCase();
        const raw = full.replace(/[^a-z]/g, " ");
        // Find whichever type appears EARLIEST in the response
        const match = types
          .map(t => ({ t, idx: raw.search(new RegExp(`\\b${t}\\b`)) }))
          .filter(m => m.idx >= 0)
          .sort((a, b) => a.idx - b.idx)[0]?.t;
        if (match) setTargetType(match);
        else console.warn("[bulkSuggestType] no match, got:", full);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("[bulkSuggestType]", res.status, errData);
      }
    } catch (err: any) {
      console.error("[bulkSuggestType]", err);
    }
    setAiTyping(false);
  }

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

  const dropdownStyle: React.CSSProperties = {
    background: "var(--color-surface-container-high)",
    borderColor: "var(--color-outline-variant)",
    maxHeight: "180px",
  };

  return (
    <div
      className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2"
      style={{ width: "min(92vw, 480px)" }}
    >
      <div
        className="flex flex-col gap-3 rounded-2xl border p-4 shadow-lg"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
          boxShadow: "var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.18))",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>
            {count} {count === 1 ? "entry" : "entries"} selected
          </span>
          <button
            onClick={onCancel}
            className="rounded-lg px-2.5 py-1 text-xs transition-opacity hover:opacity-70"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Cancel
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {/* Type picker — custom upward dropdown */}
          <div ref={typeRef} className="relative flex flex-1 flex-col gap-1">
            <div className="flex items-center justify-between">
              <label
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                Change type
              </label>
              <button
                type="button"
                onClick={suggestType}
                disabled={aiTyping}
                className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition-all disabled:opacity-50"
                style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}
              >
                {aiTyping ? "…" : "✦ AI"}
              </button>
            </div>
            <button
              onClick={() => { setTypeOpen((p) => !p); setBrainsOpen(false); }}
              className="flex w-full items-center justify-between rounded-xl border bg-transparent px-2.5 py-1.5 text-left text-xs outline-none"
              style={{ borderColor: "var(--color-outline-variant)", color: "var(--color-on-surface)" }}
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
              <div
                className="absolute bottom-full left-0 right-0 z-10 mb-1 overflow-y-auto rounded-xl border shadow-lg"
                style={dropdownStyle}
              >
                <button
                  onClick={() => { setTargetType(""); setTypeOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-white/10"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  — keep —
                </button>
                {CANONICAL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTargetType(t); setTypeOpen(false); }}
                    className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-white/10"
                    style={{
                      color: "var(--color-on-surface)",
                      background: targetType === t ? "var(--color-primary-container)" : undefined,
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Brain multi-picker */}
          <div ref={brainsRef} className="relative flex flex-1 flex-col gap-1">
            <label
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              Add to brains
            </label>
            <button
              onClick={() => { setBrainsOpen((p) => !p); setTypeOpen(false); }}
              className="flex w-full items-center justify-between rounded-xl border bg-transparent px-2.5 py-1.5 text-left text-xs outline-none"
              style={{ borderColor: "var(--color-outline-variant)", color: "var(--color-on-surface)" }}
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
              <div
                className="absolute bottom-full left-0 right-0 z-10 mb-1 overflow-y-auto rounded-xl border shadow-lg"
                style={dropdownStyle}
              >
                {brains.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => toggleBrain(b.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-white/10"
                    style={{ color: "var(--color-on-surface)" }}
                  >
                    <div
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded"
                      style={{
                        border: `2px solid ${targetBrainIds.has(b.id) ? "var(--color-primary)" : "var(--color-outline-variant)"}`,
                        background: targetBrainIds.has(b.id) ? "var(--color-primary)" : "transparent",
                      }}
                    >
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
        <button
          onClick={apply}
          disabled={!hasAction || !!progress}
          className="w-full rounded-xl py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          {progress ?? `Apply to ${count} ${count === 1 ? "entry" : "entries"}`}
        </button>
      </div>
    </div>
  );
}
