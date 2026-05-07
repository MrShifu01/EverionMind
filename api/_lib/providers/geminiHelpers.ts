export interface GeminiTextPart {
  text?: string;
  thought?: boolean;
  [key: string]: unknown;
}

export interface GeminiGenerateContentBodyOptions {
  system?: string;
  contents: Array<Record<string, unknown>>;
  generationConfig?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
}

export function buildGeminiGenerateContentBody({
  system,
  contents,
  generationConfig,
  tools,
}: GeminiGenerateContentBodyOptions): Record<string, unknown> {
  const body: Record<string, unknown> = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (generationConfig) body.generationConfig = generationConfig;
  if (tools) body.tools = tools;
  return body;
}

export function geminiGenerationConfig(
  model: string,
  base: Record<string, unknown>,
): Record<string, unknown> {
  if (model.startsWith("gemini-3")) {
    return { ...base, thinkingConfig: { thinkingLevel: "low" } };
  }
  return base;
}

export function pickGeminiAnswerText(parts: GeminiTextPart[] | undefined | null): string {
  const safeParts = Array.isArray(parts) ? parts : [];
  const nonThought = safeParts.filter((part) => !part.thought);
  const text = nonThought
    .map((part) => part.text || "")
    .join("")
    .trim();
  return (
    text ||
    safeParts
      .map((part) => part.text || "")
      .join("")
      .trim()
  );
}

export function geminiCandidateParts(data: unknown): GeminiTextPart[] {
  const parts = (data as any)?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts : [];
}
