import { KEYS } from "./storageKeys";

export type UsageType = "llm" | "transcription" | "embedding";

export interface UsageRecord {
  date: string; // YYYY-MM-DD
  type: UsageType;
  provider: string;
  model: string;
  // LLM
  inputTokens?: number;
  outputTokens?: number;
  // Transcription
  audioBytes?: number;
  // Embedding
  embeddingCount?: number;
}

export interface LlmSummary {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

export interface TranscriptionSummary {
  calls: number;
  audioBytes: number;
  estimatedUsd: number;
}

export interface EmbeddingSummary {
  calls: number;
}

export interface MonthlyBreakdown {
  llm: LlmSummary & { byProvider: Record<string, LlmSummary> };
  transcription: TranscriptionSummary & { byProvider: Record<string, TranscriptionSummary> };
  embedding: EmbeddingSummary & { byProvider: Record<string, EmbeddingSummary> };
}

// Legacy type kept for backward compat
export interface MonthlySummary {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

function loadRecords(): UsageRecord[] {
  try {
    const raw = localStorage.getItem(KEYS.USAGE);
    if (!raw) return [];
    return JSON.parse(raw) as UsageRecord[];
  } catch {
    return [];
  }
}

function saveRecords(records: UsageRecord[]): void {
  localStorage.setItem(KEYS.USAGE, JSON.stringify(records));
}

export function recordUsage(record: UsageRecord): void {
  const records = loadRecords();
  records.push(record);
  saveRecords(records);
}

function estimateLlmCost(inputTokens: number, outputTokens: number, provider: string, model: string): number {
  if (provider === "anthropic") {
    if (model.includes("haiku"))  return inputTokens * 0.00000025  + outputTokens * 0.00000125;
    if (model.includes("sonnet")) return inputTokens * 0.000003     + outputTokens * 0.000015;
    if (model.includes("opus"))   return inputTokens * 0.000015     + outputTokens * 0.000075;
  }
  if (provider === "openai") {
    if (model === "gpt-4o-mini")        return inputTokens * 0.00000015 + outputTokens * 0.0000006;
    if (model === "gpt-4o")             return inputTokens * 0.0000025  + outputTokens * 0.00001;
    if (model.startsWith("gpt-4.1"))    return inputTokens * 0.000002   + outputTokens * 0.000008;
  }
  // OpenRouter: pricing varies by model
  return 0;
}

function estimateTranscriptionCost(audioBytes: number, provider: string): number {
  // Assume ~16 KB/s typical compressed audio bitrate → seconds = bytes / 16000
  const seconds = audioBytes / 16000;
  if (provider === "groq")   return seconds * (0.111 / 3600); // $0.111/hour
  if (provider === "openai") return seconds * (0.006 / 60);   // $0.006/min
  return 0;
}

export function getMonthlyBreakdown(): MonthlyBreakdown {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const records = loadRecords().filter(r => r.date.startsWith(currentMonth));

  const result: MonthlyBreakdown = {
    llm: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0, byProvider: {} },
    transcription: { calls: 0, audioBytes: 0, estimatedUsd: 0, byProvider: {} },
    embedding: { calls: 0, byProvider: {} },
  };

  for (const r of records) {
    const type: UsageType = (r.type as UsageType) ?? "llm"; // old records without type → llm
    const p = r.provider;

    if (type === "llm") {
      const inp = r.inputTokens ?? 0;
      const out = r.outputTokens ?? 0;
      const usd = estimateLlmCost(inp, out, p, r.model);
      result.llm.inputTokens += inp;
      result.llm.outputTokens += out;
      result.llm.estimatedUsd += usd;
      if (!result.llm.byProvider[p]) result.llm.byProvider[p] = { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };
      result.llm.byProvider[p].inputTokens += inp;
      result.llm.byProvider[p].outputTokens += out;
      result.llm.byProvider[p].estimatedUsd += usd;
    } else if (type === "transcription") {
      const bytes = r.audioBytes ?? 0;
      const usd = estimateTranscriptionCost(bytes, p);
      result.transcription.calls += 1;
      result.transcription.audioBytes += bytes;
      result.transcription.estimatedUsd += usd;
      if (!result.transcription.byProvider[p]) result.transcription.byProvider[p] = { calls: 0, audioBytes: 0, estimatedUsd: 0 };
      result.transcription.byProvider[p].calls += 1;
      result.transcription.byProvider[p].audioBytes += bytes;
      result.transcription.byProvider[p].estimatedUsd += usd;
    } else if (type === "embedding") {
      const count = r.embeddingCount ?? 1;
      result.embedding.calls += count;
      if (!result.embedding.byProvider[p]) result.embedding.byProvider[p] = { calls: 0 };
      result.embedding.byProvider[p].calls += count;
    }
  }

  return result;
}

// Backward-compat shim
export function getMonthlyUsage(): MonthlySummary {
  const bd = getMonthlyBreakdown();
  return { inputTokens: bd.llm.inputTokens, outputTokens: bd.llm.outputTokens, estimatedUsd: bd.llm.estimatedUsd };
}

export function clearUsage(): void {
  localStorage.removeItem(KEYS.USAGE);
}

export function extractTokenUsage(body: unknown): { inputTokens: number; outputTokens: number } {
  if (!body || typeof body !== "object") return { inputTokens: 0, outputTokens: 0 };
  const b = body as any;
  // Anthropic format
  if (b.usage?.input_tokens != null) {
    return { inputTokens: b.usage.input_tokens, outputTokens: b.usage.output_tokens ?? 0 };
  }
  // OpenAI / OpenRouter format
  if (b.usage?.prompt_tokens != null) {
    return { inputTokens: b.usage.prompt_tokens, outputTokens: b.usage.completion_tokens ?? 0 };
  }
  return { inputTokens: 0, outputTokens: 0 };
}
