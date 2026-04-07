import { describe, it, expect } from "vitest";
import { chunkEntries, buildBatchQueue } from "../../src/lib/batchEmbed";
describe("batchEmbed (S7-3)", () => {
  const entries = Array.from({length: 12}, (_, i) => ({ id: `e${i}`, title: `E${i}`, content: "" }));
  it("chunkEntries splits into batches of given size", () => {
    const chunks = chunkEntries(entries, 5);
    expect(chunks[0]).toHaveLength(5);
    expect(chunks[1]).toHaveLength(5);
    expect(chunks[2]).toHaveLength(2);
  });
  it("buildBatchQueue returns one job per chunk", () => {
    const queue = buildBatchQueue(entries, "brain-1", 5);
    expect(queue).toHaveLength(3);
    expect(queue[0].brain_id).toBe("brain-1");
  });
});
