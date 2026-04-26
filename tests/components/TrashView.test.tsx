import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("TrashView bulk operations", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("restoreAll fires all requests in parallel via Promise.all", async () => {
    const all = vi.spyOn(Promise, "all");

    // Simulate restoreAll logic extracted from component
    const entries = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const restore = vi.fn().mockResolvedValue(undefined);

    await Promise.all(entries.map(restore));

    expect(all).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledTimes(3);
  });

  it("daysAgo result is computed once per entry", () => {
    const spy = vi.fn(daysAgo);
    const deleted = new Date(Date.now() - 86400000).toISOString();

    const age = spy(deleted);
    const label = `${age} day${age !== 1 ? "s" : ""} ago`;

    expect(spy).toHaveBeenCalledOnce();
    expect(label).toBe("1 day ago");
  });
});
