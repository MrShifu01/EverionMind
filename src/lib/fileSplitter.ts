/**
 * AI-powered file content splitting utilities.
 * Takes extracted text from uploaded files and determines
 * if/how it should be split into multiple OpenBrain entries.
 *
 * Entry types are flexible — the AI chooses the most descriptive label.
 * The only reserved type is "secret", which triggers E2E encryption.
 */

interface SplitEntry {
  title: string;
  content: string;
  type: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}
/**
 * Heuristic check: should this content be sent to AI for splitting?
 * Returns true if content is long enough and has structural indicators
 * of multiple distinct items (sections, numbered lists, etc.)
 */
export function shouldSplitContent(content: string): boolean {
  if (!content || content.length < 100) return false;

  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 4) return false;

  // Check for structural indicators of multiple sections
  const sectionIndicators = [
    /^#{1,3}\s/m, // Markdown headers
    /^recipe\s*\d*\s*:/im, // "Recipe 1:", "Recipe:"
    /^\d+[.)]\s/m, // Numbered lists
    /^[-•]\s/m, // Bullet lists
    /^(directors?|company|address|tax|registration)/im, // Document sections
    /\n\n[A-Z][A-Za-z\s]+:\s*\n/, // Section headers followed by content
  ];

  const matchCount = sectionIndicators.filter((re) => re.test(content)).length;

  // Multiple section indicators + sufficient length = likely multi-entry content
  return matchCount >= 1 && content.length > 150;
}

/**
 * Build the user message for the FILE_SPLIT AI prompt.
 */
export function buildSplitPrompt(content: string, brainType: string): string {
  return `Brain type: ${brainType}\n\nFile content:\n${content}`;
}

/**
 * Parse the AI response from a FILE_SPLIT call into entry objects.
 * Types are passed through as-is — AI decides the best descriptive label.
 * Falls back to "note" only when the type field is missing or empty.
 */
export function parseAISplitResponse(raw: string): SplitEntry[] {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  const candidate = jsonMatch ? jsonMatch[1] : cleaned;

  const normalise = (parsed: any): SplitEntry[] => {
    const arr = Array.isArray(parsed) ? parsed : parsed?.title ? [parsed] : [];
    return arr
      .filter((e: any) => e && typeof e.title === "string" && e.title.trim())
      .map((e: any) => ({
        ...e,
        type: typeof e.type === "string" && e.type.trim() ? e.type.trim() : "note",
      }));
  };

  // Fast path — valid JSON
  try {
    return normalise(JSON.parse(candidate));
  } catch {
    // Slow path — truncated response. Recover all complete entries before the break.
    try {
      // Find the last complete object in the array by trimming from the last "},"  or  "}]"
      const lastComplete = candidate.lastIndexOf("},");
      const lastEnd = candidate.lastIndexOf("}]");
      const cutAt = Math.max(lastComplete, lastEnd);
      if (cutAt > 0) {
        const recovered = candidate.slice(0, cutAt + 1) + "]";
        return normalise(JSON.parse(recovered));
      }
    } catch {
      // nothing recoverable
    }
    return [];
  }
}
