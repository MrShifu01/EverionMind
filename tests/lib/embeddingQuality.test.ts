import { describe, it, expect } from "vitest";
import { scoreEmbeddingQuality, EmbeddingQuality } from "../../src/lib/embeddingQuality";
describe("scoreEmbeddingQuality (S6-6)", () => {
  it("flags zero vector as poor", () => {
    expect(scoreEmbeddingQuality(new Array(1536).fill(0))).toBe(EmbeddingQuality.Poor);
  });
  it("flags very short vector as poor", () => {
    expect(scoreEmbeddingQuality([0.1, 0.2])).toBe(EmbeddingQuality.Poor);
  });
  it("accepts a normal-length non-zero vector as good", () => {
    const v = Array.from({length: 1536}, (_, i) => Math.sin(i));
    expect(scoreEmbeddingQuality(v)).toBe(EmbeddingQuality.Good);
  });
  it("flags NaN-containing vector as poor", () => {
    const v = new Array(1536).fill(0.1); v[100] = NaN;
    expect(scoreEmbeddingQuality(v)).toBe(EmbeddingQuality.Poor);
  });
});
