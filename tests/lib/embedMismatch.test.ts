import { describe, it, expect } from "vitest";

describe("embed provider mismatch", () => {
  it("detects mismatch when switching provider", () => {
    const entries = [
      { id: "1", embedding_provider: "openai" },
      { id: "2", embedding_provider: "openai" },
      { id: "3", embedding_provider: null },
    ];
    const currentProvider = "openai";
    const newProvider = "google";
    const embeddedWithOld = entries.filter(
      e => e.embedding_provider && e.embedding_provider !== newProvider
    ).length;
    expect(embeddedWithOld).toBe(2);
  });
  it("no mismatch when selecting same provider", () => {
    const entries = [{ id: "1", embedding_provider: "openai" }];
    const newProvider = "openai";
    const mismatched = entries.filter(
      e => e.embedding_provider && e.embedding_provider !== newProvider
    ).length;
    expect(mismatched).toBe(0);
  });
});
