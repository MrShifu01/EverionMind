import { describe, it, expect } from "vitest";
import { PRIORITY_WEIGHTS, sortBySuggestionPriority } from "../useRefineAnalysis";

describe("sortBySuggestionPriority", () => {
  it("sorts higher-weight types before lower-weight types", () => {
    const suggestions = [
      { type: "TAG_SUGGESTED", entryId: "a", field: "tags", suggestedValue: "", reason: "" },
      { type: "SENSITIVE_DATA", entryId: "b", field: "type", suggestedValue: "secret", reason: "" },
      { type: "STALE_REMINDER", entryId: "c", field: "metadata.due_date", suggestedValue: "", reason: "" },
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
    const sorted = sortBySuggestionPriority(suggestions as any);
    expect(sorted[0].entryId).toBe("a");
    expect(sorted[1].entryId).toBe("b");
  });

  it("PRIORITY_WEIGHTS has entries for all known types", () => {
    const known = [
      "SENSITIVE_DATA", "MERGE_SUGGESTED", "STALE_REMINDER", "DEAD_URL",
      "DUPLICATE_ENTRY", "TYPE_MISMATCH", "PHONE_FOUND", "EMAIL_FOUND",
      "DATE_FOUND", "LINK_SUGGESTED", "CLUSTER_SUGGESTED", "CONTENT_WEAK",
      "TAG_SUGGESTED", "TITLE_POOR", "ORPHAN_DETECTED", "SPLIT_SUGGESTED",
      "URL_FOUND", "WEAK_LABEL",
    ];
    known.forEach((t) => expect(PRIORITY_WEIGHTS).toHaveProperty(t));
  });
});
