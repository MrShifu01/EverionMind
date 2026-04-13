/**
 * Extracts and validates the text nudge from an AI response.
 * - Skips "thinking" content blocks (extended thinking mode)
 * - Strips inline <think> / <thinking> XML tags some models emit
 * - Rejects responses that look like leaked instruction text, JSON, or raw metadata
 * - Returns null if nothing usable is found
 */
export function extractNudgeText(data: any): string | null {
  if (!data?.content?.length) return null;

  const textBlock = data.content.find((b: any) => b.type === "text" && typeof b.text === "string");
  if (!textBlock) return null;

  const cleaned = textBlock.text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();

  if (!cleaned) return null;

  // Reject if it looks like JSON or a data structure
  if (cleaned.startsWith("{") || cleaned.startsWith("[")) return null;

  // Reject if it contains template placeholders (instruction bleed)
  if (/\{\{.*?\}\}/.test(cleaned)) return null;

  // Reject if it's too short to be useful (but allow short factual answers)
  if (cleaned.length < 3) return null;

  // Reject if it looks like raw metadata (e.g. "Tuesday0", "key: value", ISO dates alone)
  if (/^\w+\d+$/.test(cleaned)) return null; // e.g. "Tuesday0"
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null; // bare ISO date

  // Reject lines that look like key:value metadata dumps
  const lines = cleaned.split("\n").filter(Boolean);
  const metadataLineCount = lines.filter(
    (l: string) => /^[\w_]+:\s/.test(l) && l.split(":").length === 2,
  ).length;
  if (metadataLineCount > lines.length / 2) return null;

  return cleaned;
}
