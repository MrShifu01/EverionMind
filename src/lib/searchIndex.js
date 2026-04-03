/**
 * Simple inverted index for fast entry search.
 * Built at write time, queried at search time — O(k) instead of O(n).
 */

const index = new Map(); // token -> Set of entry IDs

export function indexEntry(entry) {
  const tokens = tokenize(`${entry.title} ${entry.content || ''} ${(entry.tags || []).join(' ')}`);
  tokens.forEach(token => {
    if (!index.has(token)) index.set(token, new Set());
    index.get(token).add(entry.id);
  });
}

export function removeFromIndex(entryId) {
  index.forEach(ids => ids.delete(entryId));
}

export function searchIndex(query) {
  const tokens = tokenize(query);
  if (!tokens.length) return null; // null means "no index filter"
  const sets = tokens.map(t => index.get(t) || new Set());
  // Union of all matching entry IDs
  return new Set(sets.flatMap(s => [...s]));
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
