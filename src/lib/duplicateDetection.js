/* ─── Duplicate Detection ─── */

/**
 * Scores the title similarity between two strings (0–100).
 * @param {string} a - First title string.
 * @param {string} b - Second title string.
 * @returns {number} Similarity score: 100 = identical, 70 = substring match, lower = word-overlap ratio.
 */
export function scoreTitle(a, b) {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 70;
  const aSet = new Set(a.split(/\W+/).filter(Boolean));
  const bArr = b.split(/\W+/).filter(Boolean);
  const hits = bArr.filter(w => aSet.has(w)).length;
  return Math.round((hits / Math.max(aSet.size, bArr.length, 1)) * 100);
}

/**
 * Returns entries from the list whose title is similar to the given title.
 * @param {string} title - The candidate title to check.
 * @param {Array} entries - The existing entries array.
 * @param {number} [threshold=50] - Minimum score to consider a duplicate.
 * @returns {Array} Matching entries sorted by score descending.
 */
export function findDuplicates(title, entries, threshold = 50) {
  if (!title.trim()) return [];
  return entries
    .map(e => ({ entry: e, score: scoreTitle(title, e.title) }))
    .filter(({ score }) => score > threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}
