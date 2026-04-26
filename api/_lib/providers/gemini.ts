import type {
  ChatRound,
  ChatStep,
  CompletionOptions,
  CompletionResult,
  ProviderAdapter,
  ProviderConfig,
  ToolSpec,
} from "./types.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function url(model: string, endpoint: string, key: string): string {
  return `${BASE}/${model}:${endpoint}?key=${encodeURIComponent(key)}`;
}

function toMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function pickAnswerText(parts: any[]): string {
  const nonThought = parts.filter((p: any) => !p.thought);
  const text = nonThought.map((p: any) => p.text || "").join("").trim();
  return text || parts.map((p: any) => p.text || "").join("").trim();
}

export const gemini: ProviderAdapter = {
  async completion(opts: CompletionOptions, config: ProviderConfig): Promise<CompletionResult> {
    const body: Record<string, any> = {
      contents: toMessages(opts.messages),
      generationConfig: { maxOutputTokens: opts.max_tokens || 1000 },
    };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system.slice(0, 10000) }] };

    const r = await fetch(url(config.model, "generateContent", config.key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await r.json();
    if (!r.ok) return { ok: false, status: r.status, error: data };

    const parts: any[] = data.candidates?.[0]?.content?.parts || [];
    return { ok: true, status: 200, text: pickAnswerText(parts) };
  },

  async chatStep(round: ChatRound, config: ProviderConfig): Promise<ChatStep> {
    const body = {
      contents: round.messages,
      tools: [{ functionDeclarations: round.tools as unknown as ToolSpec[] }],
      systemInstruction: { parts: [{ text: round.system }] },
      generationConfig: { maxOutputTokens: round.max_tokens || 2000 },
    };
    const r = await fetch(url(config.model, "generateContent", config.key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await r.json();
    if (!r.ok) return { ok: false, status: r.status, error: data };

    const parts: any[] = data.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p: any) => p.functionCall);

    if (!funcCall) {
      return { ok: true, status: 200, text: pickAnswerText(parts) };
    }

    const leading = parts.filter((p: any) => p.text).map((p: any) => p.text).join("").trim();
    return {
      ok: true,
      status: 200,
      text: leading || undefined,
      toolCall: { name: funcCall.functionCall.name, args: funcCall.functionCall.args },
      rawAssistantMessage: parts,
    };
  },

  appendToolResult(messages: any[], step: ChatStep, toolResult: unknown): void {
    messages.push({ role: "model", parts: step.rawAssistantMessage });
    messages.push({
      role: "user",
      parts: [{ functionResponse: { name: step.toolCall!.name, response: { result: toolResult } } }],
    });
  },
};

export async function extractFile(
  { fileData, mimeType }: { fileData: string; mimeType: string },
  { model, key, prompt }: { model: string; key: string; prompt: string },
): Promise<CompletionResult> {
  const parts: any[] = [{ inlineData: { mimeType, data: fileData } }, { text: prompt }];
  const r = await fetch(url(model, "generateContent", key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 32k output tokens ≈ ~120K characters ≈ ~80–100 dense PDF pages. Gemini
    // 2.5 supports up to 65535; 32768 leaves headroom and stays well within
    // the model's per-request budget for typical brand-guideline / report
    // sized documents.
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: 32768 } }),
  });
  const data: any = await r.json();
  if (!r.ok) return { ok: false, status: r.status, error: data };

  const xParts: any[] = data.candidates?.[0]?.content?.parts || [];
  return { ok: true, status: 200, text: pickAnswerText(xParts) };
}

export function messagesToGeminiContents(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return toMessages(messages);
}
