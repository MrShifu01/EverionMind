import { describe, it, expect } from "vitest";
import { buildVersionSnapshot, diffVersions } from "../../src/lib/entryVersioning";
describe("entryVersioning (S7-6)", () => {
  const entry = { id: "e1", title: "Burger", content: "beef", type: "recipe", tags: ["food"] };
  it("buildVersionSnapshot captures entry fields", () => {
    const snap = buildVersionSnapshot(entry);
    expect(snap.title).toBe("Burger");
    expect(snap.snapshot_at).toBeDefined();
  });
  it("diffVersions returns changed fields", () => {
    const v1 = { title: "Burger", content: "beef", tags: ["food"] };
    const v2 = { title: "Smash Burger", content: "beef", tags: ["food"] };
    const diff = diffVersions(v1, v2);
    expect(diff).toContain("title");
    expect(diff).not.toContain("content");
  });
  it("diffVersions returns empty when identical", () => {
    expect(diffVersions(entry, { ...entry })).toHaveLength(0);
  });
});
