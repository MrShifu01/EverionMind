import { describe, it, expect } from "vitest";
import {
  PRIORITY_WEIGHTS,
  sortBySuggestionPriority,
  detectOrphans,
  detectStaleReminders,
  getChangedEntries,
  findWeakLinks,
  normalizeName,
  findNameCandidates,
  detectClusters,
} from "../useRefineAnalysis";

// ─── Priority scoring ──────────────────────────────────────────────────────

describe("sortBySuggestionPriority", () => {
  it("sorts higher-weight types before lower-weight types", () => {
    const suggestions = [
      { type: "TAG_SUGGESTED", entryId: "a", field: "tags", suggestedValue: "", reason: "" },
      { type: "SENSITIVE_DATA", entryId: "b", field: "type", suggestedValue: "secret", reason: "" },
      {
        type: "STALE_REMINDER",
        entryId: "c",
        field: "metadata.due_date",
        suggestedValue: "",
        reason: "",
      },
    ];
    const sorted = sortBySuggestionPriority(suggestions as any);
    expect(sorted[0].type).toBe("SENSITIVE_DATA");
    expect(sorted[1].type).toBe("STALE_REMINDER");
    expect(sorted[2].type).toBe("TAG_SUGGESTED");
  });

  it("items with equal weight preserve original order (stable)", () => {
    const suggestions = [
      { type: "TAG_SUGGESTED", entryId: "a", field: "tags", suggestedValue: "x", reason: "" },
      { type: "TAG_SUGGESTED", entryId: "b", field: "tags", suggestedValue: "y", reason: "" },
    ];
    const sorted = sortBySuggestionPriority(suggestions as any) as any[];
    expect(sorted[0].entryId).toBe("a");
    expect(sorted[1].entryId).toBe("b");
  });

  it("PRIORITY_WEIGHTS has entries for all known types", () => {
    const known = [
      "SENSITIVE_DATA",
      "MERGE_SUGGESTED",
      "STALE_REMINDER",
      "DEAD_URL",
      "DUPLICATE_ENTRY",
      "TYPE_MISMATCH",
      "PHONE_FOUND",
      "EMAIL_FOUND",
      "DATE_FOUND",
      "LINK_SUGGESTED",
      "CLUSTER_SUGGESTED",
      "CONTENT_WEAK",
      "TAG_SUGGESTED",
      "TITLE_POOR",
      "ORPHAN_DETECTED",
      "SPLIT_SUGGESTED",
      "URL_FOUND",
      "WEAK_LABEL",
    ];
    known.forEach((t) => expect(PRIORITY_WEIGHTS).toHaveProperty(t));
  });
});

// ─── Orphan detection ──────────────────────────────────────────────────────

describe("detectOrphans", () => {
  const base = { id: "e1", title: "Test", type: "note", content: "", tags: [], metadata: {} };

  it("flags entry with no links and no tags", () => {
    const result = detectOrphans([base as any], []);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("ORPHAN_DETECTED");
    expect(result[0].entryId).toBe("e1");
  });

  it("does not flag entry that has tags", () => {
    expect(detectOrphans([{ ...base, tags: ["foo"] } as any], [])).toHaveLength(0);
  });

  it("does not flag entry that has a link (from)", () => {
    expect(detectOrphans([base as any], [{ from: "e1", to: "e2" }])).toHaveLength(0);
  });

  it("does not flag entry that appears as link target", () => {
    expect(detectOrphans([base as any], [{ from: "e2", to: "e1" }])).toHaveLength(0);
  });

  it("does not flag encrypted entries", () => {
    expect(detectOrphans([{ ...base, encrypted: true } as any], [])).toHaveLength(0);
  });
});

// ─── Stale reminder detection ──────────────────────────────────────────────

describe("detectStaleReminders", () => {
  it("flags entry whose due_date is in the past", () => {
    const entry = {
      id: "r1",
      title: "Pay invoice",
      type: "reminder",
      metadata: { due_date: "2020-01-01" },
      tags: [],
      content: "",
    };
    const result = detectStaleReminders([entry as any]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("STALE_REMINDER");
    expect(result[0].entryId).toBe("r1");
  });

  it("does not flag entry with future due_date", () => {
    const entry = {
      id: "r2",
      title: "Future",
      type: "reminder",
      metadata: { due_date: "2099-12-31" },
      tags: [],
      content: "",
    };
    expect(detectStaleReminders([entry as any])).toHaveLength(0);
  });

  it("does not flag entry with no due_date", () => {
    const entry = { id: "r3", title: "No date", type: "note", metadata: {}, tags: [], content: "" };
    expect(detectStaleReminders([entry as any])).toHaveLength(0);
  });

  it("does not flag encrypted entries", () => {
    const entry = {
      id: "r4",
      title: "Secret",
      type: "reminder",
      metadata: { due_date: "2020-01-01" },
      encrypted: true,
      tags: [],
      content: "",
    };
    expect(detectStaleReminders([entry as any])).toHaveLength(0);
  });
});

// ─── Delta scanning ────────────────────────────────────────────────────────

describe("getChangedEntries", () => {
  const now = new Date().toISOString();
  const old = "2020-01-01T00:00:00.000Z";
  const lastScan = "2024-01-01T00:00:00.000Z";

  it("returns entries updated after lastScannedAt", () => {
    const entries = [
      { id: "a", updated_at: now, title: "New", type: "note" },
      { id: "b", updated_at: old, title: "Old", type: "note" },
    ];
    const result = getChangedEntries(entries as any, lastScan);
    expect(result.map((e) => e.id)).toEqual(["a"]);
  });

  it("returns all entries if no lastScannedAt", () => {
    const entries = [
      { id: "a", updated_at: now, title: "A", type: "note" },
      { id: "b", updated_at: old, title: "B", type: "note" },
    ];
    expect(getChangedEntries(entries as any, null)).toHaveLength(2);
  });

  it("includes entries with no updated_at when lastScannedAt is set", () => {
    const entries = [{ id: "a", title: "No date", type: "note" }];
    expect(getChangedEntries(entries as any, lastScan)).toHaveLength(1);
  });
});

// ─── Weak label detection ──────────────────────────────────────────────────

describe("findWeakLinks", () => {
  it("identifies weak labels", () => {
    const links = [
      { from: "a", to: "b", rel: "relates to" },
      { from: "c", to: "d", rel: "works at" },
      { from: "e", to: "f", rel: "related" },
      { from: "g", to: "h", rel: "similar" },
    ];
    const result = findWeakLinks(links as any);
    expect(result.map((l) => l.from)).toEqual(["a", "e", "g"]);
  });

  it("is case-insensitive", () => {
    expect(findWeakLinks([{ from: "a", to: "b", rel: "Relates To" } as any])).toHaveLength(1);
  });

  it("returns empty if no weak links", () => {
    expect(findWeakLinks([{ from: "a", to: "b", rel: "supplies" } as any])).toHaveLength(0);
  });

  it("ignores links without rel", () => {
    expect(findWeakLinks([{ from: "a", to: "b" } as any])).toHaveLength(0);
  });
});

// ─── Duplicate name detection ──────────────────────────────────────────────

describe("normalizeName", () => {
  it("lowercases and removes punctuation", () => {
    expect(normalizeName("John Smith")).toBe("john smith");
    expect(normalizeName("J. Smith")).toBe("j smith");
    expect(normalizeName("John S.")).toBe("john s");
  });
});

describe("findNameCandidates", () => {
  it("returns pairs with shared significant name tokens", () => {
    const entries = [
      { id: "a", title: "John Smith", type: "person", content: "", tags: [], metadata: {} },
      { id: "b", title: "J. Smith", type: "person", content: "", tags: [], metadata: {} },
      { id: "c", title: "Unrelated", type: "note", content: "", tags: [], metadata: {} },
    ];
    const pairs = findNameCandidates(entries as any);
    expect(pairs.length).toBeGreaterThan(0);
    const ids = pairs[0].map((e) => e.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("does not pair entries with no title overlap", () => {
    const entries = [
      { id: "a", title: "Alpha Corp", type: "company", content: "", tags: [], metadata: {} },
      { id: "b", title: "Beta Ltd", type: "company", content: "", tags: [], metadata: {} },
    ];
    expect(findNameCandidates(entries as any)).toHaveLength(0);
  });

  it("does not pair encrypted entries", () => {
    const entries = [
      {
        id: "a",
        title: "John Smith",
        type: "person",
        encrypted: true,
        content: "",
        tags: [],
        metadata: {},
      },
      { id: "b", title: "J. Smith", type: "person", content: "", tags: [], metadata: {} },
    ];
    expect(findNameCandidates(entries as any)).toHaveLength(0);
  });
});

// ─── Cluster detection ─────────────────────────────────────────────────────

describe("detectClusters", () => {
  it("detects cluster from shared tags (3+ entries)", () => {
    const entries = [
      { id: "a", title: "A", type: "note", tags: ["supplier", "food"], content: "", metadata: {} },
      { id: "b", title: "B", type: "note", tags: ["supplier", "food"], content: "", metadata: {} },
      { id: "c", title: "C", type: "note", tags: ["supplier", "food"], content: "", metadata: {} },
      { id: "d", title: "D", type: "note", tags: ["unrelated"], content: "", metadata: {} },
    ];
    const clusters = detectClusters(entries as any, []);
    expect(clusters.length).toBeGreaterThan(0);
    const members = clusters[0].memberIds;
    expect(members).toContain("a");
    expect(members).toContain("b");
    expect(members).toContain("c");
    expect(members).not.toContain("d");
  });

  it("does not flag clusters with fewer than 3 members", () => {
    const entries = [
      { id: "a", title: "A", type: "note", tags: ["x", "y"], content: "", metadata: {} },
      { id: "b", title: "B", type: "note", tags: ["x", "y"], content: "", metadata: {} },
    ];
    expect(detectClusters(entries as any, [])).toHaveLength(0);
  });

  it("detects cluster from link density (triangle)", () => {
    const entries = [
      { id: "a", title: "A", type: "note", tags: [], content: "", metadata: {} },
      { id: "b", title: "B", type: "note", tags: [], content: "", metadata: {} },
      { id: "c", title: "C", type: "note", tags: [], content: "", metadata: {} },
    ];
    const links = [
      { from: "a", to: "b", rel: "works at" },
      { from: "b", to: "c", rel: "supplies" },
      { from: "a", to: "c", rel: "owns" },
    ];
    const clusters = detectClusters(entries as any, links as any);
    expect(clusters.length).toBeGreaterThan(0);
  });
});
