import type { Entry } from '../types';

const index = new Map<string, Set<string>>();

export function indexEntry(entry: Entry): void {
  const tokens = tokenize(`${entry.title} ${entry.content || ''} ${(entry.tags || []).join(' ')}`);
  tokens.forEach(token => {
    if (!index.has(token)) index.set(token, new Set());
    index.get(token)!.add(entry.id);
  });
}

export function removeFromIndex(entryId: string): void {
  index.forEach(ids => ids.delete(entryId));
}

export function searchIndex(query: string): Set<string> | null {
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const sets = tokens.map(t => index.get(t) || new Set<string>());
  return new Set(sets.flatMap(s => [...s]));
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
