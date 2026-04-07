import { describe, it, expect } from "vitest";
import { SUGGESTIONS } from "../../src/data/personalSuggestions";
import { BUSINESS_SUGGESTIONS } from "../../src/data/businessSuggestions";
import { FAMILY_SUGGESTIONS } from "../../src/data/familySuggestions";
import type { Suggestion } from "../../src/types";

describe("personalSuggestions", () => {
  it("exports a non-empty array of Suggestion objects", () => {
    expect(SUGGESTIONS.length).toBeGreaterThan(0);
    const first: Suggestion = SUGGESTIONS[0];
    expect(first.q).toBeTruthy();
    expect(first.cat).toBeTruthy();
    expect(["high", "medium", "low"]).toContain(first.p);
  });

  it("every item has required fields", () => {
    SUGGESTIONS.forEach((s: Suggestion) => {
      expect(typeof s.q).toBe("string");
      expect(typeof s.cat).toBe("string");
      expect(["high", "medium", "low"]).toContain(s.p);
    });
  });
});

describe("businessSuggestions", () => {
  it("exports a non-empty array of Suggestion objects", () => {
    expect(BUSINESS_SUGGESTIONS.length).toBeGreaterThan(0);
    const first: Suggestion = BUSINESS_SUGGESTIONS[0];
    expect(first.q).toBeTruthy();
    expect(first.cat).toBeTruthy();
    expect(["high", "medium", "low"]).toContain(first.p);
  });
});

describe("familySuggestions", () => {
  it("exports a non-empty array of Suggestion objects", () => {
    expect(FAMILY_SUGGESTIONS.length).toBeGreaterThan(0);
    const first: Suggestion = FAMILY_SUGGESTIONS[0];
    expect(first.q).toBeTruthy();
    expect(first.cat).toBeTruthy();
    expect(["high", "medium", "low"]).toContain(first.p);
  });
});
