/**
 * Tests for buildChatContext() in src/lib/chatContext.ts
 */
import { describe, it, expect } from "vitest";
import type { Entry, Link } from "../../src/types";

const entries: Entry[] = [
  {
    id: "e1",
    title: "Burger Special",
    type: "note",
    tags: ["food"],
    content: "Our signature smash burger with special sauce.",
  },
  {
    id: "e2",
    title: "Staff Handbook",
    type: "document",
    tags: ["hr"],
    content: "Rules and guidelines for staff.",
  },
  {
    id: "e3",
    title: "Supplier Contact",
    type: "contact",
    tags: ["supply"],
    content: "Fresh Meat Co contact info.",
  },
];

const links: Link[] = [
  { from: "e1", to: "e2", rel: "references" },
  { from: "e1", to: "e3", rel: "uses" },
];

describe("buildChatContext", () => {
  it("returns a string including entry titles", async () => {
    const { buildChatContext } = await import("../../src/lib/chatContext");
    const result = buildChatContext(entries, [], "burger");
    expect(typeof result).toBe("string");
    expect(result).toContain("Burger Special");
  });

  it("includes linked entry titles for entries with outgoing links", async () => {
    const { buildChatContext } = await import("../../src/lib/chatContext");
    const result = buildChatContext(entries, links, "burger");
    // e1 links to e2 and e3, so their titles should appear in context for e1
    expect(result).toContain("Staff Handbook");
    expect(result).toContain("Supplier Contact");
    expect(result).toContain("Related to:");
  });

  it("includes a Sources: section listing entry titles used", async () => {
    const { buildChatContext } = await import("../../src/lib/chatContext");
    const result = buildChatContext(entries, [], "burger");
    expect(result).toContain("Sources:");
    // At least one entry title should appear in Sources line
    const sourcesLine = result.split("\n").find((l) => l.startsWith("Sources:"));
    expect(sourcesLine).toBeDefined();
    expect(sourcesLine!.length).toBeGreaterThan("Sources: ".length);
  });

  it("handles empty links array without error", async () => {
    const { buildChatContext } = await import("../../src/lib/chatContext");
    const result = buildChatContext(entries, [], "staff");
    expect(result).not.toContain("Related to:");
    expect(result).toContain("Sources:");
  });

  it("truncates long content to 500 chars in context", async () => {
    const { buildChatContext } = await import("../../src/lib/chatContext");
    const longEntry: Entry = {
      id: "e99",
      title: "Long Entry",
      type: "note",
      tags: [],
      content: "x".repeat(1000),
    };
    const result = buildChatContext([longEntry], [], "long");
    // The content slice should stop at 500
    expect(result).not.toContain("x".repeat(501));
  });

  it("handles entries with no content gracefully", async () => {
    const { buildChatContext } = await import("../../src/lib/chatContext");
    const noContentEntry: Entry = { id: "e5", title: "No Content", type: "note", tags: [] };
    const result = buildChatContext([noContentEntry], [], "content");
    expect(result).toContain("No Content");
  });
});
