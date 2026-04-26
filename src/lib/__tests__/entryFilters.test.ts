import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyEntryFilters } from "../entryFilters";
import type { Entry } from "../../types";

// Fixed "now" = 2026-04-08T12:00:00Z
const NOW = new Date("2026-04-08T12:00:00Z");

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    title: "Test",
    type: "note",
    created_at: NOW.toISOString(),
    ...overrides,
  } as Entry;
}

const TODAY = "2026-04-08T08:00:00Z";
const YESTERDAY = "2026-04-07T10:00:00Z";
const FIVE_DAYS_AGO = "2026-04-03T10:00:00Z";
const THIRTY_DAYS_AGO = "2026-03-09T14:00:00Z"; // 29d 22h before NOW — inside 30-day window
const FORTY_DAYS_AGO = "2026-02-27T10:00:00Z";

const ENTRIES: Entry[] = [
  entry({ id: "1", type: "note", created_at: TODAY, pinned: true }),
  entry({ id: "2", type: "idea", created_at: YESTERDAY }),
  entry({ id: "3", type: "contact", created_at: FIVE_DAYS_AGO }),
  entry({ id: "4", type: "reminder", created_at: THIRTY_DAYS_AGO }),
  entry({ id: "5", type: "note", created_at: FORTY_DAYS_AGO }),
];

describe("applyEntryFilters — type", () => {
  it("returns all entries for type 'all'", () => {
    const result = applyEntryFilters(ENTRIES, { type: "all", date: "all", sort: "newest" });
    expect(result).toHaveLength(5);
  });

  it("returns only notes", () => {
    const result = applyEntryFilters(ENTRIES, { type: "note", date: "all", sort: "newest" });
    expect(result.map((e) => e.id)).toEqual(["1", "5"]);
  });

  it("returns only ideas", () => {
    const result = applyEntryFilters(ENTRIES, { type: "idea", date: "all", sort: "newest" });
    expect(result.map((e) => e.id)).toEqual(["2"]);
  });

  it("returns empty array when no match", () => {
    const result = applyEntryFilters(ENTRIES, { type: "secret", date: "all", sort: "newest" });
    expect(result).toHaveLength(0);
  });
});

describe("applyEntryFilters — date (relative to 2026-04-08T12:00:00Z)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("'today' returns only entries created on same calendar day", () => {
    const result = applyEntryFilters(ENTRIES, { type: "all", date: "today", sort: "newest" });
    expect(result.map((e) => e.id)).toEqual(["1"]);
  });

  it("'week' returns entries within past 7 days (including today)", () => {
    // TODAY (0d ago), YESTERDAY (1d ago), FIVE_DAYS_AGO (5d ago) — all within 7d
    const result = applyEntryFilters(ENTRIES, { type: "all", date: "week", sort: "newest" });
    expect(result.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });

  it("'month' returns entries within past 30 days", () => {
    // TODAY, YESTERDAY, FIVE_DAYS_AGO, THIRTY_DAYS_AGO (30d ago exactly counts)
    const result = applyEntryFilters(ENTRIES, { type: "all", date: "month", sort: "newest" });
    expect(result.map((e) => e.id)).toContain("1");
    expect(result.map((e) => e.id)).toContain("4");
    expect(result.map((e) => e.id)).not.toContain("5");
  });

  it("'all' returns all entries regardless of date", () => {
    const result = applyEntryFilters(ENTRIES, { type: "all", date: "all", sort: "newest" });
    expect(result).toHaveLength(5);
  });
});

describe("applyEntryFilters — sort", () => {
  it("'newest' puts most recent first", () => {
    const result = applyEntryFilters(ENTRIES, { type: "all", date: "all", sort: "newest" });
    const dates = result.map((e) => new Date(e.created_at!).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it("'oldest' puts oldest first", () => {
    const result = applyEntryFilters(ENTRIES, { type: "all", date: "all", sort: "oldest" });
    const dates = result.map((e) => new Date(e.created_at!).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it("'pinned' puts pinned entries first, then newest", () => {
    const result = applyEntryFilters(ENTRIES, { type: "all", date: "all", sort: "pinned" });
    expect(result[0].id).toBe("1"); // only pinned entry
    // rest should be newest first
    const rest = result.slice(1);
    const dates = rest.map((e) => new Date(e.created_at!).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});

describe("applyEntryFilters — combined", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("type + date combined narrows correctly", () => {
    // type=note, date=week: only entry 1 (today), not entry 5 (40d ago)
    const result = applyEntryFilters(ENTRIES, { type: "note", date: "week", sort: "newest" });
    expect(result.map((e) => e.id)).toEqual(["1"]);
  });

  it("does not mutate original array", () => {
    const copy = [...ENTRIES];
    applyEntryFilters(ENTRIES, { type: "all", date: "all", sort: "oldest" });
    expect(ENTRIES).toEqual(copy);
  });
});
