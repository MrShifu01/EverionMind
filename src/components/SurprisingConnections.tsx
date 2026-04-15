import { useMemo, useState } from "react";
import { TC } from "../data/constants";
import { loadGraph } from "../lib/conceptGraph";
import { findSurprisingConnections } from "../lib/surpriseScore";
import type { Entry } from "../types";
import type { SurprisingConnection } from "../lib/surpriseScore";

interface SurprisingConnectionsProps {
  entries: Entry[];
  brainId?: string;
  onSelect?: (entry: Entry) => void;
}

const CONFIDENCE_DOT: Record<string, string> = {
  extracted: "rgb(22,163,74)",
  inferred: "rgb(217,119,6)",
};

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/** Key for storing when connections were first discovered */
const DISCOVERY_KEY = (brainId: string) => `surprise_discovered_${brainId}`;

/** Check if the notes (why text) should still be shown — only within 2 days of discovery */
function shouldShowNotes(brainId: string): boolean {
  try {
    const stored = localStorage.getItem(DISCOVERY_KEY(brainId));
    if (!stored) return true; // first time — will be set below
    return Date.now() - Number(stored) < TWO_DAYS_MS;
  } catch {
    return true;
  }
}

/** Mark the current time as when connections were discovered */
function markDiscovered(brainId: string): void {
  try {
    if (!localStorage.getItem(DISCOVERY_KEY(brainId))) {
      localStorage.setItem(DISCOVERY_KEY(brainId), String(Date.now()));
    }
  } catch { /* quota */ }
}

export default function SurprisingConnections({
  entries,
  brainId,
  onSelect,
}: SurprisingConnectionsProps) {
  const [open, setOpen] = useState(false);

  const surprises = useMemo<SurprisingConnection[]>(() => {
    if (!brainId) return [];
    try {
      const graph = loadGraph(brainId);
      if (graph.concepts.length === 0) return [];
      const results = findSurprisingConnections(graph, entries, 5);
      if (results.length > 0) markDiscovered(brainId);
      return results;
    } catch (err) {
      console.error("[SurprisingConnections] failed to compute connections", err);
      return [];
    }
  }, [brainId, entries]);

  const showNotes = brainId ? shouldShowNotes(brainId) : false;

  if (surprises.length === 0) return null;

  return (
    <div className="space-y-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-2"
      >
        <svg
          className="h-3 w-3 transition-transform duration-200"
          style={{
            color: "var(--color-on-surface-variant)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        <p
          className="text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          Surprising Connections ({surprises.length})
        </p>
      </button>
      {open && (
        <div className="space-y-3 pt-1">
          {surprises.map((s, i) => (
            <div
              key={i}
              className="space-y-2 rounded-2xl p-4"
              style={{
                background: "var(--color-surface-container)",
                border: "1px solid var(--color-outline-variant)",
              }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSelect?.(s.entryA)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <span className="text-sm">
                    {(TC as Record<string, any>)[s.entryA.type]?.i || "\ud83d\udcdd"}
                  </span>
                  <span
                    className="truncate text-xs font-medium"
                    style={{ color: "var(--color-on-surface)" }}
                  >
                    {s.entryA.title}
                  </span>
                </button>
                <span
                  className="flex-shrink-0 text-xs"
                  style={{ color: "var(--color-primary)" }}
                >
                  \u27f7
                </span>
                <button
                  onClick={() => onSelect?.(s.entryB)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-right"
                >
                  <span
                    className="truncate text-xs font-medium"
                    style={{ color: "var(--color-on-surface)" }}
                  >
                    {s.entryB.title}
                  </span>
                  <span className="text-sm">
                    {(TC as Record<string, any>)[s.entryB.type]?.i || "\ud83d\udcdd"}
                  </span>
                </button>
              </div>
              {showNotes && (
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  {s.why}
                </p>
              )}
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: CONFIDENCE_DOT[s.confidence] || CONFIDENCE_DOT.inferred }}
                />
                <span
                  className="text-[10px] capitalize"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  {s.confidence}
                </span>
                <div className="flex flex-1 flex-wrap justify-end gap-1">
                  {s.sharedConcepts.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className="rounded-full px-2 py-0.5 text-[9px] font-medium"
                      style={{
                        background: "var(--color-secondary-container)",
                        color: "var(--color-secondary)",
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
