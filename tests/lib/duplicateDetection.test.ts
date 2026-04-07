import { describe, it, expect } from "vitest";
import { scoreTitle, findDuplicates } from "../../src/lib/duplicateDetection";
import type { Entry } from "../../src/types";

describe("scoreTitle", () => {
  it("returns 100 for identical titles", () => {
    expect(scoreTitle("Hello World", "Hello World")).toBe(100);
  });

  it("returns 100 for case-insensitive identical titles", () => {
    expect(scoreTitle("Hello World", "hello world")).toBe(100);
  });

  it("returns 70 for substring match", () => {
    expect(scoreTitle("Hello", "Hello World")).toBe(70);
  });

  it("returns partial score for word overlap", () => {
    const score = scoreTitle("Hello World", "Hello Universe");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(70);
  });

  it("returns 0 for no overlap", () => {
    expect(scoreTitle("abc", "xyz")).toBe(0);
  });
});

describe("findDuplicates", () => {
  const entries: Entry[] = [
    { id: "1", title: "Doctor Appointment", type: "reminder" },
    { id: "2", title: "Buy groceries", type: "reminder" },
    { id: "3", title: "Doctor Visit", type: "note" },
  ];

  it("finds duplicates above threshold", () => {
    const dupes = findDuplicates("Doctor Appointment", entries);
    expect(dupes.length).toBeGreaterThanOrEqual(1);
    expect(dupes[0].id).toBe("1");
  });

  it("returns empty for blank title", () => {
    expect(findDuplicates("   ", entries)).toEqual([]);
  });

  it("returns empty when no matches above threshold", () => {
    expect(findDuplicates("xyzzy foobar", entries)).toEqual([]);
  });
});
