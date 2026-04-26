import { describe, it, expect } from "vitest";

function priceTier(pricing?: { prompt?: string }): { label: string; color: string } {
  const p = parseFloat(pricing?.prompt ?? "1");
  if (p === 0) return { label: "Free", color: "#22c55e" };
  if (p < 0.000001) return { label: "Cheap", color: "#4ECDC4" };
  if (p < 0.00001) return { label: "Normal", color: "#888" };
  return { label: "Expensive", color: "#FF6B35" };
}

describe("priceTier", () => {
  it("labels free models", () => {
    expect(priceTier({ prompt: "0" }).label).toBe("Free");
  });
  it("labels cheap models", () => {
    expect(priceTier({ prompt: "0.0000005" }).label).toBe("Cheap");
  });
  it("labels normal models", () => {
    expect(priceTier({ prompt: "0.000005" }).label).toBe("Normal");
  });
  it("labels expensive models", () => {
    expect(priceTier({ prompt: "0.05" }).label).toBe("Expensive");
  });
  it("defaults missing pricing to expensive", () => {
    expect(priceTier(undefined).label).toBe("Expensive");
  });
});
