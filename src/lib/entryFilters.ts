import type { Entry } from "../types";
import { loadGraph } from "./conceptGraph";

export type DateFilter = "all" | "today" | "week" | "month";
export type SortOrder = "newest" | "oldest" | "pinned";

export interface EntryFilterState {
  type: string; // "all" or a specific type string
  date: DateFilter;
  sort: SortOrder;
  concept?: string; // filter by concept label
  brainId?: string; // needed for concept lookup
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(n: number, from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d;
}

export function applyEntryFilters(entries: Entry[], filters: EntryFilterState): Entry[] {
  const now = new Date();
  // Secrets live in the Vault; insights are feed-only — always exclude both from the main grid
  let result = entries.filter((e) => e.type !== "secret" && e.type !== "insight");

  // ── Type filter ──
  if (filters.type !== "all") {
    result = result.filter((e) => e.type === filters.type);
  }

  // ── Concept filter ──
  if (filters.concept && filters.brainId) {
    const graph = loadGraph(filters.brainId);
    const concept = graph.concepts.find((c) => c.label === filters.concept);
    if (concept) {
      const entryIds = new Set(concept.source_entries);
      result = result.filter((e) => entryIds.has(e.id));
    }
  }

  // ── Date filter ──
  if (filters.date !== "all") {
    const todayStart = startOfDay(now);

    if (filters.date === "today") {
      result = result.filter((e) => {
        if (!e.created_at) return false;
        return new Date(e.created_at) >= todayStart;
      });
    } else if (filters.date === "week") {
      const weekAgo = daysAgo(7, now);
      result = result.filter((e) => {
        if (!e.created_at) return false;
        return new Date(e.created_at) >= weekAgo;
      });
    } else if (filters.date === "month") {
      const monthAgo = daysAgo(30, now);
      result = result.filter((e) => {
        if (!e.created_at) return false;
        return new Date(e.created_at) >= monthAgo;
      });
    }
  }

  // ── Sort ──
  if (filters.sort === "newest") {
    result.sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    );
  } else if (filters.sort === "oldest") {
    result.sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    );
  } else if (filters.sort === "pinned") {
    result.sort((a, b) => {
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pb !== pa) return pb - pa;
      // Within same pinned tier: newest first
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }

  return result;
}

/** Returns unique types present in the entry list, excluding "secret". */
export function getEntryTypes(entries: Entry[]): string[] {
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.type && e.type !== "secret" && e.type !== "insight") seen.add(e.type);
  }
  return Array.from(seen).sort();
}
