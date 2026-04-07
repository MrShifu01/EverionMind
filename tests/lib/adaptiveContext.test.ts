import { describe, it, expect } from "vitest";
import { truncateToContextWindow, getContextLimit } from "../../src/lib/adaptiveContext";

describe("adaptiveContext (S6-4)", () => {
  it("getContextLimit returns smaller limit for smaller models", () => {
    expect(getContextLimit("claude-haiku-4-5-20251001")).toBeLessThan(getContextLimit("claude-opus-4-6"));
  });

  it("truncateToContextWindow truncates entries to fit char budget", () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`, title: `Entry ${i}`, content: "x".repeat(500), similarity: 0.9 - i * 0.01,
    }));
    const result = truncateToContextWindow(entries, 5000);
    const totalChars = result.reduce((sum, e) => sum + (e.title?.length ?? 0) + (e.content?.length ?? 0), 0);
    expect(totalChars).toBeLessThanOrEqual(5000);
  });

  it("truncateToContextWindow keeps high-similarity entries first", () => {
    const entries = [
      { id: "a", title: "Low", content: "x".repeat(100), similarity: 0.3 },
      { id: "b", title: "High", content: "x".repeat(100), similarity: 0.9 },
    ];
    const result = truncateToContextWindow(entries, 150);
    expect(result[0].id).toBe("b");
  });
});
