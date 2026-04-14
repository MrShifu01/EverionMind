import { describe, it, expect, beforeEach } from "vitest";

// localStorage is provided by jsdom in the test environment

describe("usageTracker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("recordUsage adds a record to localStorage", async () => {
    const { recordUsage } = await import("../../src/lib/usageTracker");
    recordUsage({
      date: "2026-04-07",
      type: "llm",
      inputTokens: 100,
      outputTokens: 50,
      provider: "anthropic",
      model: "gemini-2.5-flash-lite",
    });
    const raw = localStorage.getItem("openbrain_usage");
    expect(raw).not.toBeNull();
    const records = JSON.parse(raw!);
    expect(records).toHaveLength(1);
    expect(records[0].inputTokens).toBe(100);
    expect(records[0].outputTokens).toBe(50);
  });

  it("recordUsage appends multiple records", async () => {
    const { recordUsage } = await import("../../src/lib/usageTracker");
    recordUsage({
      date: "2026-04-07",
      type: "llm",
      inputTokens: 10,
      outputTokens: 5,
      provider: "anthropic",
      model: "gemini-2.5-flash-lite",
    });
    recordUsage({
      date: "2026-04-07",
      type: "llm",
      inputTokens: 20,
      outputTokens: 10,
      provider: "openai",
      model: "gpt-4o-mini",
    });
    const records = JSON.parse(localStorage.getItem("openbrain_usage")!);
    expect(records).toHaveLength(2);
  });

  it("getMonthlyUsage aggregates tokens for the current month only", async () => {
    const { recordUsage, getMonthlyUsage } = await import("../../src/lib/usageTracker");

    // Current month (2026-04)
    recordUsage({
      date: "2026-04-01",
      type: "llm",
      inputTokens: 1000,
      outputTokens: 500,
      provider: "anthropic",
      model: "gemini-2.5-flash-lite",
    });
    recordUsage({
      date: "2026-04-07",
      type: "llm",
      inputTokens: 2000,
      outputTokens: 1000,
      provider: "anthropic",
      model: "gemini-2.5-flash-lite",
    });
    // Previous month — should be excluded
    recordUsage({
      date: "2026-03-15",
      type: "llm",
      inputTokens: 9999,
      outputTokens: 9999,
      provider: "anthropic",
      model: "gemini-2.5-flash-lite",
    });

    const result = getMonthlyUsage();
    expect(result.inputTokens).toBe(3000);
    expect(result.outputTokens).toBe(1500);
  });

  it("getMonthlyUsage returns 0 cost for unknown provider/model", async () => {
    const { recordUsage, getMonthlyUsage } = await import("../../src/lib/usageTracker");
    recordUsage({
      date: "2026-04-07",
      type: "llm",
      inputTokens: 500,
      outputTokens: 250,
      provider: "openrouter",
      model: "some/model",
    });

    const result = getMonthlyUsage();
    expect(result.estimatedUsd).toBe(0);
  });

  it("clearUsage empties the localStorage key", async () => {
    const { recordUsage, clearUsage } = await import("../../src/lib/usageTracker");
    recordUsage({
      date: "2026-04-07",
      type: "llm",
      inputTokens: 100,
      outputTokens: 50,
      provider: "anthropic",
      model: "gemini-2.5-flash-lite",
    });
    clearUsage();
    const raw = localStorage.getItem("openbrain_usage");
    expect(raw).toBeNull();
  });

  it("getMonthlyUsage returns zeros when no records exist", async () => {
    const { getMonthlyUsage } = await import("../../src/lib/usageTracker");
    const result = getMonthlyUsage();
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.estimatedUsd).toBe(0);
  });
});

describe("extractTokenUsage", () => {
  it("extracts Anthropic token format", async () => {
    const { extractTokenUsage } = await import("../../src/lib/usageTracker");
    const result = extractTokenUsage({ usage: { input_tokens: 100, output_tokens: 50 } });
    expect(result).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it("extracts OpenAI/OpenRouter token format", async () => {
    const { extractTokenUsage } = await import("../../src/lib/usageTracker");
    const result = extractTokenUsage({ usage: { prompt_tokens: 200, completion_tokens: 80 } });
    expect(result).toEqual({ inputTokens: 200, outputTokens: 80 });
  });

  it("returns zeros for unknown format", async () => {
    const { extractTokenUsage } = await import("../../src/lib/usageTracker");
    expect(extractTokenUsage({})).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(extractTokenUsage(null)).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(extractTokenUsage({ something: "else" })).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
