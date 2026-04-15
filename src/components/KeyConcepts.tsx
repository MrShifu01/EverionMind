import { useState } from "react";
import type { Concept } from "../types";

interface KeyConceptsProps {
  concepts: Concept[];
  activeConcept?: string;
  onConceptClick: (label: string | undefined) => void;
}

export default function KeyConcepts({ concepts, activeConcept, onConceptClick }: KeyConceptsProps) {
  const [expanded, setExpanded] = useState(false);
  if (concepts.length === 0) return null;

  const visible = expanded ? concepts : concepts.slice(0, 5);

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: "var(--color-surface-container-low)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      <button
        type="button"
        className="mb-2.5 flex w-full items-center justify-between"
        onClick={() => setExpanded((p) => !p)}
      >
        <span
          className="text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          Key Themes
        </span>
        <svg
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          style={{ color: "var(--color-on-surface-variant)" }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((c) => {
          const isActive = activeConcept === c.label;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onConceptClick(isActive ? undefined : c.label)}
              className="press-scale flex items-center gap-1.5 rounded-full px-2.5 py-2.5 text-xs font-medium transition-all"
              style={{
                background: isActive
                  ? "var(--color-primary)"
                  : "var(--color-secondary-container)",
                color: isActive
                  ? "var(--color-on-primary)"
                  : "var(--color-secondary)",
              }}
            >
              {c.label}
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] tabular-nums"
                style={{
                  background: isActive
                    ? "rgba(255,255,255,0.2)"
                    : "var(--color-surface-container)",
                  color: isActive
                    ? "var(--color-on-primary)"
                    : "var(--color-on-surface-variant)",
                }}
              >
                {c.source_entries.length}
              </span>
            </button>
          );
        })}
        {!expanded && concepts.length > 5 && (
          <span
            className="self-center px-1 text-xs"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            +{concepts.length - 5} more
          </span>
        )}
      </div>
    </div>
  );
}
