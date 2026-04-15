export function computeCompletenessScore(title: string, content: string, type: string, tags: string[], metadata: Record<string, any>): number {
  let score = 0;
  const titleLen = (title || "").trim().length;
  if (titleLen >= 5) score += 10; else if (titleLen >= 3) score += 5;
  if (titleLen >= 15) score += 5;
  const words = (content || "").trim().split(/\s+/).filter(Boolean).length;
  const contentLen = (content || "").trim().length;
  if (words >= 3) score += 5;
  if (words >= 10) score += 10;
  if (words >= 25) score += 10;
  if (contentLen >= 200) score += 10;
  const tagCount = (tags || []).length;
  if (tagCount >= 1) score += 5;
  if (tagCount >= 2) score += 5;
  if (tagCount >= 3) score += 5;
  const meta = metadata || {};
  const meaningfulKeys = Object.entries(meta).filter(([k, v]) => v !== null && v !== undefined && v !== "" && k !== "workspace" && k !== "completeness_score");
  if (meaningfulKeys.length >= 1) score += 5;
  if (meaningfulKeys.length >= 2) score += 5;
  if (meaningfulKeys.length >= 3) score += 5;
  if (meaningfulKeys.length >= 5) score += 5;
  const genericTypes = new Set(["note", "other", ""]);
  if (!genericTypes.has(type || "note")) score += 10;
  if (words >= 3 && content && title) {
    const tNorm = title.toLowerCase().trim();
    const cNorm = content.toLowerCase().trim();
    if (!cNorm.startsWith(tNorm) && cNorm !== tNorm) score += 5;
  }
  return Math.min(100, Math.max(0, score));
}
