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

function estimateLlmCost(
  _inputTokens: number,
  _outputTokens: number,
  _provider: string,
  _model: string,
): number {
  return 0;
}

function estimateTranscriptionCost(audioBytes: number, provider: string): number {
  // Assume ~16 KB/s typical compressed audio bitrate → seconds = bytes / 16000
  const seconds = audioBytes / 16000;
  if (provider === "groq") return seconds * (0.111 / 3600); // $0.111/hour
  return 0;
}

export function getMonthlyBreakdown(): MonthlyBreakdown {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const records = loadRecords().filter((r) => r.date.startsWith(currentMonth));

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
      if (!result.llm.byProvider[p])
        result.llm.byProvider[p] = { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };
      result.llm.byProvider[p].inputTokens += inp;
      result.llm.byProvider[p].outputTokens += out;
      result.llm.byProvider[p].estimatedUsd += usd;
    } else if (type === "transcription") {
      const bytes = r.audioBytes ?? 0;
      const usd = estimateTranscriptionCost(bytes, p);
      result.transcription.calls += 1;
      result.transcription.audioBytes += bytes;
      result.transcription.estimatedUsd += usd;
      if (!result.transcription.byProvider[p])
        result.transcription.byProvider[p] = { calls: 0, audioBytes: 0, estimatedUsd: 0 };
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
  return {
    inputTokens: bd.llm.inputTokens,
    outputTokens: bd.llm.outputTokens,
    estimatedUsd: bd.llm.estimatedUsd,
  };
}

export function clearUsage(): void {
  localStorage.removeItem(KEYS.USAGE);
}

/** Track embedding usage from an X-Embedding-Usage response header. Called by authFetch. */
export function trackEmbeddingIfPresent(response: Response): void {
  const header = response.headers.get("X-Embedding-Usage");
  if (!header) return;
  try {
    const { provider, model, count } = JSON.parse(header) as {
      provider: string;
      model: string;
      count: number;
    };
    recordUsage({
      date: new Date().toISOString().slice(0, 10),
      type: "embedding",
      provider,
      model,
      embeddingCount: count,
    });
  } catch (err) {
    console.error("[authFetch]", err);
  }
}

export function extractTokenUsage(body: unknown): { inputTokens: number; outputTokens: number } {
  if (!body || typeof body !== "object") return { inputTokens: 0, outputTokens: 0 };
  const b = body as any;
  if (b.usage?.input_tokens != null) {
    return { inputTokens: b.usage.input_tokens, outputTokens: b.usage.output_tokens ?? 0 };
  }
  if (b.usage?.prompt_tokens != null) {
    return { inputTokens: b.usage.prompt_tokens, outputTokens: b.usage.completion_tokens ?? 0 };
  }
  return { inputTokens: 0, outputTokens: 0 };
}
