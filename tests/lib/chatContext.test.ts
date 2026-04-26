import { describe, it, expect } from "vitest";
import { scoreEntriesForQuery } from "../../src/lib/chatContext";

const entries = [
  {
    id: "1",
    title: "Chilli Spice Mix",
    content: "cumin, coriander, mustard, smoked paprika",
    type: "note",
    tags: ["recipe", "spice", "mix"],
  },
  {
    id: "2",
    title: "SMASH SOCIAL CLUB",
    content: "Private company registration",
    type: "company",
    tags: ["business"],
  },
  {
    id: "3",
    title: "Beef Burger Recipe",
    content: "Beef patty, brioche bun, smash technique",
    type: "recipe",
    tags: ["recipe", "burger"],
  },
  { id: "4", title: "CIPC Number", content: "2024/123456/07", type: "document", tags: ["legal"] },
  {
    id: "5",
    title: "Garlic Sauce",
    content: "Garlic, mayo, lemon",
    type: "recipe",
    tags: ["recipe", "sauce"],
  },
];

describe("scoreEntriesForQuery", () => {
  it("surfaces entries whose TAGS match the query keyword", () => {
    const results = scoreEntriesForQuery(entries, "recipes");
    const ids = results.map((e) => e.id);
    expect(ids).toContain("1"); // has 'recipe' tag
    expect(ids).toContain("3"); // has 'recipe' tag + type
    expect(ids).toContain("5"); // has 'recipe' tag + type
  });

  it("surfaces entries whose TYPE matches the query keyword", () => {
    const results = scoreEntriesForQuery(entries, "recipe");
    const recipeEntries = results.filter((e) => e.type === "recipe" || e.tags.includes("recipe"));
    expect(recipeEntries.length).toBeGreaterThanOrEqual(3);
  });

  it("surfaces entries whose TITLE contains the query keyword", () => {
    const results = scoreEntriesForQuery(entries, "chilli spice");
    expect(results[0].id).toBe("1"); // should be the top result
  });

  it("surfaces entries whose CONTENT contains the query keyword", () => {
    const results = scoreEntriesForQuery(entries, "smoked paprika");
    expect(results[0].id).toBe("1");
  });

  it("ranks non-matching entries at the end but includes them", () => {
    const results = scoreEntriesForQuery(entries, "recipes");
    expect(results).toHaveLength(entries.length);
    // Business/legal entries should rank lower than recipe ones
    const cipcIdx = results.findIndex((e) => e.id === "4");
    const smashIdx = results.findIndex((e) => e.id === "2");
    const recipeIdx = results.findIndex((e) => e.id === "1");
    expect(recipeIdx).toBeLessThan(cipcIdx);
    expect(recipeIdx).toBeLessThan(smashIdx);
  });

  it("is case-insensitive", () => {
    const results = scoreEntriesForQuery(entries, "RECIPE");
    const ids = results.slice(0, 3).map((e) => e.id);
    expect(ids).toContain("3");
    expect(ids).toContain("5");
  });

  it("handles empty query by returning entries in original order", () => {
    const results = scoreEntriesForQuery(entries, "");
    expect(results).toHaveLength(entries.length);
  });

  it("handles a query with multiple words — all must match for top score", () => {
    const results = scoreEntriesForQuery(entries, "beef burger");
    expect(results[0].id).toBe("3");
  });
});
