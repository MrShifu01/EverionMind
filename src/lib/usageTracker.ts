import { KEYS } from "./storageKeys";

export interface UsageRecord {
  date: string; // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
}

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

function estimateCost(inputTokens: number, outputTokens: number, provider: string, model: string): number {
  if (provider === "anthropic" && model.startsWith("claude-haiku")) {
    return inputTokens * 0.00000025 + outputTokens * 0.00000125;
  }
  if (provider === "openai" && model === "gpt-4o-mini") {
    return inputTokens * 0.00000015 + outputTokens * 0.0000006;
  }
  return 0;
}

export function getMonthlyUsage(): MonthlySummary {
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const records = loadRecords().filter((r) => r.date.startsWith(currentMonth));

  let inputTokens = 0;
  let outputTokens = 0;
  let estimatedUsd = 0;

  for (const r of records) {
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    estimatedUsd += estimateCost(r.inputTokens, r.outputTokens, r.provider, r.model);
  }

  return { inputTokens, outputTokens, estimatedUsd };
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
