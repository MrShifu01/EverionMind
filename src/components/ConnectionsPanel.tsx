import { useState } from "react";
import { resolveIcon } from "../lib/typeIcons";
import type { Entry } from "../types";

interface RelatedLink {
  from: string;
  to: string;
  rel?: string;
  similarity?: number;
  other?: Entry;
  dir: string;
}

interface ConceptItem {
  id: string;
  label: string;
}

interface ConceptRelatedItem {
  entryId: string;
  entry?: Entry;
  sharedConcepts: string[];
}

interface ConnectionsPanelProps {
  related: RelatedLink[];
  entryConcepts: ConceptItem[];
  conceptRelated: ConceptRelatedItem[];
  typeIcons: Record<string, string>;
}

const VISIBLE_COUNT = 3;

export function ConnectionsPanel({
  related,
  entryConcepts,
  conceptRelated,
  typeIcons,
}: ConnectionsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!related.length && !entryConcepts.length && !conceptRelated.length) return null;

  // Group related connections by the connected entry's type
  const grouped = new Map<string, RelatedLink[]>();
  for (const r of related) {
    if (!r.other) continue;
    const type = r.other.type || "other";
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(r);
  }

  // Flatten into display order, honouring the expand cap
  const allVisible = [...grouped.values()].flat();
  const displayed = expanded ? allVisible : allVisible.slice(0, VISIBLE_COUNT);
  const hiddenCount = allVisible.length - VISIBLE_COUNT;

  return (
    <>
      {related.length > 0 && (
        <div className="pt-1">
          <p
            className="mb-2 text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Connections
          </p>
          {displayed.map((r, i) => (
            <div
              key={i}
              className="mb-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-surface-container)" }}
            >
              <span>{resolveIcon(r.other!.type, typeIcons)}</span>
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                style={{
                  background: "var(--color-secondary-container)",
                  color: "var(--color-secondary)",
                }}
              >
                {r.other!.type}
              </span>
              <span className="text-on-surface-variant/50 shrink-0">{r.dir}</span>
              <span className="text-on-surface flex-1 truncate">{r.other!.title}</span>
              {r.rel && (
                <span className="text-on-surface-variant/50 shrink-0 text-[10px] tracking-widest uppercase">
                  {r.rel}
                </span>
              )}
            </div>
          ))}
          {!expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-0.5 text-[11px] underline"
              style={{ color: "var(--color-primary)" }}
            >
              See all {allVisible.length} connections
            </button>
          )}
          {expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-0.5 text-[11px] underline"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              Show less
            </button>
          )}
        </div>
      )}
      {entryConcepts.length > 0 && (
        <div className="pt-1">
          <p
            className="mb-2 text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Concepts
          </p>
          <div className="flex flex-wrap gap-1.5">
            {entryConcepts.map((c) => (
              <span
                key={c.id}
                className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: "var(--color-secondary-container)",
                  color: "var(--color-secondary)",
                }}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {conceptRelated.length > 0 && (
        <div className="pt-1">
          <p
            className="mb-2 text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Related by Concepts
          </p>
          {conceptRelated.map((r) => (
            <div
              key={r.entryId}
              className="mb-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-surface-container)" }}
            >
              <span>{resolveIcon(r.entry!.type, typeIcons)}</span>
              <span className="text-on-surface flex-1 truncate">{r.entry!.title}</span>
              <span className="text-on-surface-variant/50 text-[10px]">
                {r.sharedConcepts.slice(0, 2).join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
