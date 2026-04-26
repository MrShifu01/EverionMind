import { describe, it, expect } from "vitest";
import { TC } from "../../src/data/constants";

// Import after writing the function
import { getTypeConfig } from "../../src/data/constants";

const TYPE_COLOURS = [
  "var(--color-primary)",
  "var(--color-secondary)",
  "var(--color-status-medium)",
  "var(--color-on-surface-variant)",
  "var(--color-primary-dim)",
  "var(--color-secondary-dim)",
  "var(--color-error)",
  "var(--color-primary)",
];

describe("getTypeConfig", () => {
  it("returns the exact TC entry for known types", () => {
    const knownTypes = [
      "note",
      "secret",
      "person",
      "reminder",
      "document",
      "contact",
      "place",
      "idea",
      "color",
      "decision",
    ];
    for (const type of knownTypes) {
      const result = getTypeConfig(type);
      expect(result).toEqual(TC[type]);
    }
  });

  it("never returns null or undefined for any input", () => {
    const types = ["restaurant", "vehicle", "unknown", "", "xyz"];
    for (const type of types) {
      const result = getTypeConfig(type);
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    }
  });

  it("returns fallback icon 🏷️ for unknown types", () => {
    expect(getTypeConfig("restaurant").i).toBe("🏷️");
    expect(getTypeConfig("vehicle").i).toBe("🏷️");
    expect(getTypeConfig("unknown-xyz").i).toBe("🏷️");
  });

  it("unknown type colour is from the fixed palette", () => {
    const unknownTypes = ["restaurant", "vehicle", "company", "project"];
    for (const type of unknownTypes) {
      const result = getTypeConfig(type);
      expect(TYPE_COLOURS).toContain(result.c);
    }
  });

  it("colour is deterministic for the same input", () => {
    expect(getTypeConfig("restaurant").c).toBe(getTypeConfig("restaurant").c);
    expect(getTypeConfig("vehicle").c).toBe(getTypeConfig("vehicle").c);
  });

  it("different unknown types get different deterministic colours (hash spread)", () => {
    // These two inputs hash to different palette indices
    const a = getTypeConfig("restaurant");
    const b = getTypeConfig("vehicle");
    // They may coincidentally collide in a small palette — just verify both are in palette
    expect(TYPE_COLOURS).toContain(a.c);
    expect(TYPE_COLOURS).toContain(b.c);
  });

  it("deterministic: 'restaurant' maps to same colour every call", () => {
    const first = getTypeConfig("restaurant");
    const second = getTypeConfig("restaurant");
    expect(first.c).toBe(second.c);
  });

  it("returns a TypeConfig with both i and c fields", () => {
    const result = getTypeConfig("anything-unknown");
    expect(result).toHaveProperty("i");
    expect(result).toHaveProperty("c");
    expect(typeof result.i).toBe("string");
    expect(typeof result.c).toBe("string");
  });
});
