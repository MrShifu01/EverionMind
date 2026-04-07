/**
 * S6-4: Adaptive context window — truncate retrieved entries to fit model limits.
 */

const MODEL_LIMITS: Record<string, number> = {
  "claude-haiku-4-5-20251001": 8000,
  "claude-sonnet-4-6": 16000,
  "claude-opus-4-6": 32000,
  "gpt-4o-mini": 8000,
  "gpt-4o": 16000,
  "gpt-4.1": 16000,
};

export function getContextLimit(model: string): number {
  return MODEL_LIMITS[model] ?? 8000;
}

export interface ContextEntry {
  id: string;
  title?: string;
  content?: string;
  similarity?: number;
  [key: string]: unknown;
}

export function truncateToContextWindow(entries: ContextEntry[], charBudget: number): ContextEntry[] {
  const sorted = [...entries].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  const result: ContextEntry[] = [];
  let used = 0;
  for (const e of sorted) {
    const size = (e.title?.length ?? 0) + (e.content?.length ?? 0);
    if (used + size > charBudget) break;
    result.push(e);
    used += size;
  }
  return result;
}
