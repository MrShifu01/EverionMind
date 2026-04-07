/**
 * Extracts the text nudge from an Anthropic-style AI response.
 * - Skips "thinking" content blocks (extended thinking mode)
 * - Strips inline <think> / <thinking> XML tags some models emit
 * - Returns null if nothing usable is found
 */
export function extractNudgeText(data: any): string | null {
  if (!data?.content?.length) return null;

  const textBlock = data.content.find(
    (b: any) => b.type === "text" && typeof b.text === "string",
  );
  if (!textBlock) return null;

  const cleaned = textBlock.text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();

  return cleaned || null;
}
