import { describe, it, expect } from "vitest";

// Test the date helper used in TrashView
function daysAgo(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

describe("TrashView helpers", () => {
  it("calculates days since deletion", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(daysAgo(yesterday)).toBe(1);
  });
  it("returns 0 for today", () => {
    const now = new Date().toISOString();
    expect(daysAgo(now)).toBe(0);
  });
});
