import { describe, it, expect } from "vitest";
import { extractConcepts, mergeGraph } from "../lib/conceptGraph";
import type { ConceptGraph } from "../lib/conceptGraph";

// Normalization is tested through extractConcepts (normalize is internal).
// Two labels that produce the same normalized key must collapse into one concept.

describe("normalize — possessive forms", () => {
  it("Smith's Practice and Smiths Practice produce the same concept", () => {
    const result = extractConcepts([
      { label: "Smith's Practice", entry_ids: ["e1"] },
      { label: "Smiths Practice", entry_ids: ["e2"] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].source_entries).toContain("e1");
    expect(result[0].source_entries).toContain("e2");
  });

  it("John's notes and Johns notes produce the same concept", () => {
    const result = extractConcepts([
      { label: "John's notes", entry_ids: ["e1"] },
      { label: "Johns notes", entry_ids: ["e2"] },
    ]);
    expect(result).toHaveLength(1);
  });

  it("right-quote apostrophe (\u2019) is stripped like a straight apostrophe", () => {
    const result = extractConcepts([
      { label: "Doctor\u2019s Office", entry_ids: ["e1"] },
      { label: "Doctors Office", entry_ids: ["e2"] },
    ]);
    expect(result).toHaveLength(1);
  });

  it("distinct labels remain distinct", () => {
    const result = extractConcepts([
      { label: "Smith's Practice", entry_ids: ["e1"] },
      { label: "Jones Practice", entry_ids: ["e2"] },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("normalize — punctuation and case", () => {
  it("same label with different casing merges", () => {
    const result = extractConcepts([
      { label: "React Hooks", entry_ids: ["e1"] },
      { label: "react hooks", entry_ids: ["e2"] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].frequency).toBe(2);
  });

  it("leading/trailing whitespace is ignored", () => {
    const result = extractConcepts([
      { label: "  machine learning  ", entry_ids: ["e1"] },
      { label: "machine learning", entry_ids: ["e2"] },
    ]);
    expect(result).toHaveLength(1);
  });

  it("special characters are stripped", () => {
    const result = extractConcepts([
      { label: "C++ programming", entry_ids: ["e1"] },
      { label: "C programming", entry_ids: ["e2"] },
    ]);
    // "c programming" and "c programming" — same after stripping "++"
    expect(result).toHaveLength(1);
  });
});

describe("mergeGraph — concept deduplication", () => {
  const base: ConceptGraph = {
    version: 2,
    concepts: [
      { id: "smiths practice", label: "Smith's Practice", source_entries: ["e1"], frequency: 1 },
    ],
    relationships: [],
  };
  const incoming: ConceptGraph = {
    version: 2,
    concepts: [
      { id: "smiths practice", label: "Smiths Practice", source_entries: ["e2"], frequency: 1 },
    ],
    relationships: [],
  };

  it("merges concepts with the same id, combining source_entries", () => {
    const result = mergeGraph(base, incoming);
    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].source_entries).toContain("e1");
    expect(result.concepts[0].source_entries).toContain("e2");
    expect(result.concepts[0].frequency).toBe(2);
  });
});
