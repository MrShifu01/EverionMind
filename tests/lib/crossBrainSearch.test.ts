import { describe, it, expect } from "vitest";
import { mergeCrossBrainResults } from "../../src/lib/crossBrainSearch";
describe("crossBrainSearch (S6-5)", () => {
  it("merges and deduplicates by id across brains", () => {
    const r = [
      [{ id:"a", similarity:0.9, brain_id:"b1" }, { id:"b", similarity:0.7, brain_id:"b1" }],
      [{ id:"b", similarity:0.8, brain_id:"b2" }, { id:"c", similarity:0.6, brain_id:"b2" }],
    ];
    const merged = mergeCrossBrainResults(r, 3);
    expect(merged.map(e=>e.id)).toEqual(["a","b","c"]);
  });
  it("respects limit", () => {
    const r = [[{ id:"a",similarity:0.9,brain_id:"b1"},{id:"b",similarity:0.8,brain_id:"b1"}]];
    expect(mergeCrossBrainResults(r, 1)).toHaveLength(1);
  });
});
