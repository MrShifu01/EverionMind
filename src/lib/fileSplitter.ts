/**
 * AI-powered file content splitting utilities.
 * Takes extracted text from uploaded files and determines
 * if/how it should be split into multiple OpenBrain entries.
 */

const VALID_CAPTURE_TYPES = [
  "note", "person", "place", "idea", "contact",
  "document", "reminder", "color", "decision", "secret",
] as const;

type CaptureType = typeof VALID_CAPTURE_TYPES[number];

interface SplitEntry {
  title: string;
  content: string;
  type: CaptureType;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

/**
 * Normalise an AI-returned type value to a valid CaptureType.
 * Falls back to "note" if the value is missing or not in the allowed list.
 */
export function normaliseType(type: string | undefined | null): CaptureType {
  return VALID_CAPTURE_TYPES.includes(type as CaptureType)
    ? (type as CaptureType)
    : "note";
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
 */
export function parseAISplitResponse(raw: string): SplitEntry[] {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e: any) => e && typeof e.title === "string" && e.title.trim())
      .map((e: any) => ({
        ...e,
        type: normaliseType(e.type),
      }));
  } catch {
    return [];
  }
}
