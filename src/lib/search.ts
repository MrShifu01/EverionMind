import type { Entry } from "./types";

export interface ScoredEntry extends Entry {
  similarity?: number;
  score?: number;
}

export interface SearchStrategy {
  search(query: string, entries: Entry[], brainId?: string): Promise<ScoredEntry[]>;
}

// Unified search dispatcher
export async function search(
  query: string,
  entries: Entry[],
  strategy: SearchStrategy,
  brainId?: string
): Promise<ScoredEntry[]> {
  if (!query || !query.trim()) return [];
  return strategy.search(query, entries, brainId);
}
