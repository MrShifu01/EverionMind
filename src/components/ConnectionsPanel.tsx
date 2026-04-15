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
  conceptsLoading?: boolean;
}

export function ConnectionsPanel({
  entryConcepts,
  conceptRelated,
  typeIcons,
  conceptsLoading,
}: ConnectionsPanelProps) {
  if (!entryConcepts.length && !conceptRelated.length) {
    if (!conceptsLoading) return null;
    return (
      <div className="space-y-4 pt-1">
        <div>
          <div className="mb-2 h-2.5 w-16 animate-pulse rounded-full" style={{ background: "var(--color-outline-variant)" }} />
          <div className="flex flex-wrap gap-1.5">
            {[48, 64, 40].map((w) => (
              <div key={w} className="h-5 animate-pulse rounded-full" style={{ width: w, background: "var(--color-outline-variant)" }} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 h-2.5 w-24 animate-pulse rounded-full" style={{ background: "var(--color-outline-variant)" }} />
          {[1, 2].map((i) => (
            <div key={i} className="mb-1.5 h-8 animate-pulse rounded-lg" style={{ background: "var(--color-outline-variant)" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
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
