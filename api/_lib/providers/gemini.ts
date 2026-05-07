import type {
  ChatRound,
  ChatStep,
  CompletionOptions,
  CompletionResult,
  ProviderAdapter,
  ProviderConfig,
  ToolSpec,
} from "./types.js";

import { googleAiFetch, googleAiModelUrl } from "../googleAi.js";
import {
  buildGeminiGenerateContentBody,
  geminiCandidateParts,
  geminiGenerationConfig,
  pickGeminiAnswerText,
} from "./geminiHelpers.js";

function toMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export const gemini: ProviderAdapter = {
  async completion(opts: CompletionOptions, config: ProviderConfig): Promise<CompletionResult> {
    let generationConfig: Record<string, unknown> = { maxOutputTokens: opts.max_tokens || 1000 };
    if (opts.json) generationConfig.responseMimeType = "application/json";
    generationConfig = geminiGenerationConfig(config.model, generationConfig);
    const body = buildGeminiGenerateContentBody({
      contents: toMessages(opts.messages),
      generationConfig,
      system: opts.system ? opts.system.slice(0, 10000) : undefined,
    });

    const r = await googleAiFetch(config.key, googleAiModelUrl(config.model, "generateContent"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await r.json();
    if (!r.ok) return { ok: false, status: r.status, error: data };

    const parts = geminiCandidateParts(data);
    return { ok: true, status: 200, text: pickGeminiAnswerText(parts) };
  },

  async chatStep(round: ChatRound, config: ProviderConfig): Promise<ChatStep> {
    const body = buildGeminiGenerateContentBody({
      contents: round.messages,
      tools: [{ functionDeclarations: round.tools as unknown as ToolSpec[] }],
      system: round.system,
      generationConfig: geminiGenerationConfig(config.model, {
        maxOutputTokens: round.max_tokens || 2000,
      }),
    });
    const r = await googleAiFetch(config.key, googleAiModelUrl(config.model, "generateContent"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await r.json();
    if (!r.ok) return { ok: false, status: r.status, error: data };

    const parts = geminiCandidateParts(data);
    const funcCall = parts.find(
      (p): p is { functionCall: { name: string; args: Record<string, any> } } =>
        typeof p.functionCall === "object" && p.functionCall !== null,
    );

    if (!funcCall) {
      return { ok: true, status: 200, text: pickGeminiAnswerText(parts) };
    }

    const leading = parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join("")
      .trim();
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
      parts: [
        { functionResponse: { name: step.toolCall!.name, response: { result: toolResult } } },
      ],
    });
  },
};

export async function extractFile(
  { fileData, mimeType }: { fileData: string; mimeType: string },
  { model, key, prompt }: { model: string; key: string; prompt: string },
): Promise<CompletionResult> {
  const parts: any[] = [{ inlineData: { mimeType, data: fileData } }, { text: prompt }];
  const r = await googleAiFetch(key, googleAiModelUrl(model, "generateContent"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 32k output tokens ≈ ~120K characters ≈ ~80–100 dense PDF pages. Gemini
    // 2.5 supports up to 65535; 32768 leaves headroom and stays well within
    // the model's per-request budget for typical brand-guideline / report
    // sized documents.
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: 32768 },
    }),
  });
  const data: any = await r.json();
  if (!r.ok) return { ok: false, status: r.status, error: data };

  const xParts: any[] = data.candidates?.[0]?.content?.parts || [];
  return { ok: true, status: 200, text: pickGeminiAnswerText(xParts) };
}
