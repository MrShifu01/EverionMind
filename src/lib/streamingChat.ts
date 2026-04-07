export function buildSSELine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
export function parseSSEChunk(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta") return obj.delta.text ?? "";
    if (obj.choices?.[0]?.delta?.content) return obj.choices[0].delta.content;
  } catch { /* */ }
  return "";
}
