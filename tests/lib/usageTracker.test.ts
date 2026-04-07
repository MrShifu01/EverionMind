import { describe, it, expect, beforeEach, vi } from "vitest";

// localStorage is provided by jsdom in the test environment

describe("usageTracker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("recordUsage adds a record to localStorage", async () => {
    const { recordUsage } = await import("../../src/lib/usageTracker");
    recordUsage({
      date: "2026-04-07",
      inputTokens: 100,
      outputTokens: 50,
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
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
    recordUsage({ date: "2026-04-07", inputTokens: 10, outputTokens: 5, provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    recordUsage({ date: "2026-04-07", inputTokens: 20, outputTokens: 10, provider: "openai", model: "gpt-4o-mini" });
    const records = JSON.parse(localStorage.getItem("openbrain_usage")!);
    expect(records).toHaveLength(2);
  });

  it("getMonthlyUsage aggregates tokens for the current month only", async () => {
    const { recordUsage, getMonthlyUsage } = await import("../../src/lib/usageTracker");

    // Current month (2026-04)
    recordUsage({ date: "2026-04-01", inputTokens: 1000, outputTokens: 500, provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    recordUsage({ date: "2026-04-07", inputTokens: 2000, outputTokens: 1000, provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    // Previous month — should be excluded
    recordUsage({ date: "2026-03-15", inputTokens: 9999, outputTokens: 9999, provider: "anthropic", model: "claude-haiku-4-5-20251001" });

    const result = getMonthlyUsage();
    expect(result.inputTokens).toBe(3000);
    expect(result.outputTokens).toBe(1500);
  });

  it("getMonthlyUsage estimates USD cost for Anthropic Haiku", async () => {
    const { recordUsage, getMonthlyUsage } = await import("../../src/lib/usageTracker");
    recordUsage({ date: "2026-04-07", inputTokens: 1_000_000, outputTokens: 1_000_000, provider: "anthropic", model: "claude-haiku-4-5-20251001" });

    const result = getMonthlyUsage();
    // 1M input * 0.00000025 + 1M output * 0.00000125 = 0.25 + 1.25 = 1.50
    expect(result.estimatedUsd).toBeCloseTo(1.5, 5);
  });

  it("getMonthlyUsage estimates USD cost for OpenAI gpt-4o-mini", async () => {
    const { recordUsage, getMonthlyUsage } = await import("../../src/lib/usageTracker");
    recordUsage({ date: "2026-04-07", inputTokens: 1_000_000, outputTokens: 1_000_000, provider: "openai", model: "gpt-4o-mini" });

    const result = getMonthlyUsage();
    // 1M input * 0.00000015 + 1M output * 0.0000006 = 0.15 + 0.60 = 0.75
    expect(result.estimatedUsd).toBeCloseTo(0.75, 5);
  });

  it("getMonthlyUsage returns 0 cost for unknown provider/model", async () => {
    const { recordUsage, getMonthlyUsage } = await import("../../src/lib/usageTracker");
    recordUsage({ date: "2026-04-07", inputTokens: 500, outputTokens: 250, provider: "openrouter", model: "some/model" });

    const result = getMonthlyUsage();
    expect(result.estimatedUsd).toBe(0);
  });

  it("clearUsage empties the localStorage key", async () => {
    const { recordUsage, clearUsage } = await import("../../src/lib/usageTracker");
    recordUsage({ date: "2026-04-07", inputTokens: 100, outputTokens: 50, provider: "anthropic", model: "claude-haiku-4-5-20251001" });
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
