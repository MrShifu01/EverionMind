import type { Entry } from "../types";

/**
 * Compute a completeness score (0-100) for an entry based on how much
 * useful information it contains. No AI needed — pure heuristic.
 */
export function computeCompletenessScore(entry: Entry): number {
  let score = 0;

  // Title quality (0-15)
  const titleLen = (entry.title || "").trim().length;
  if (titleLen >= 5) score += 10;
  else if (titleLen >= 3) score += 5;
  if (titleLen >= 15) score += 5; // descriptive title bonus

  // Content depth (0-35)
  const contentLen = (entry.content || "").trim().length;
  const contentWords = (entry.content || "").trim().split(/\s+/).filter(Boolean).length;
  if (contentWords >= 3) score += 5;
  if (contentWords >= 10) score += 10;
  if (contentWords >= 25) score += 10;
  if (contentLen >= 200) score += 10;

  // Tags (0-15)
  const tagCount = (entry.tags || []).length;
  if (tagCount >= 1) score += 5;
  if (tagCount >= 2) score += 5;
  if (tagCount >= 3) score += 5;

  // Metadata richness (0-20)
  const meta = entry.metadata || {};
  const meaningfulKeys = Object.entries(meta).filter(
    ([k, v]) =>
      v !== null && v !== undefined && v !== "" && k !== "workspace" && k !== "completeness_score",
  );
  if (meaningfulKeys.length >= 1) score += 5;
  if (meaningfulKeys.length >= 2) score += 5;
  if (meaningfulKeys.length >= 3) score += 5;
  if (meaningfulKeys.length >= 5) score += 5;

  // Type specificity (0-10)
  const genericTypes = new Set(["note", "other", ""]);
  if (!genericTypes.has(entry.type || "note")) score += 10;

  // Content doesn't just repeat title (0-5)
  if (contentWords >= 3 && entry.content && entry.title) {
    const titleNorm = entry.title.toLowerCase().trim();
    const contentNorm = (entry.content || "").toLowerCase().trim();
    if (!contentNorm.startsWith(titleNorm) && contentNorm !== titleNorm) {
      score += 5;
    }
  }

  return Math.min(100, Math.max(0, score));
}
