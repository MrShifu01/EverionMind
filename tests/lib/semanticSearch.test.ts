/**
 * Tests for semanticSearch() in src/lib/searchIndex.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Entry } from "../../src/types";

// Mock chatContext so scoreEntriesForQuery is predictable
vi.mock("../../src/lib/chatContext", () => ({
  scoreEntriesForQuery: vi.fn((entries: Entry[], _query: string) => [...entries]),
}));

// Mock aiFetch to control embed headers
vi.mock("../../src/lib/aiFetch", () => ({
  getEmbedHeaders: vi.fn().mockReturnValue(null),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const sampleEntries: Entry[] = [
  { id: "e1", title: "Burger recipe", type: "note", tags: ["food"] },
  { id: "e2", title: "Taco tuesday", type: "note", tags: ["food"] },
  { id: "e3", title: "Staff roster", type: "document", tags: ["hr"] },
];

describe("semanticSearch", () => {
  it("when isOnline=false returns keyword-scored entries", async () => {
    const { semanticSearch } = await import("../../src/lib/searchIndex");
    const result = await semanticSearch("burger", "brain-1", sampleEntries, false, null);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual(sampleEntries);
  });

  it("when isOnline=true and no embedHeaders returns keyword-scored results", async () => {
    const { semanticSearch } = await import("../../src/lib/searchIndex");
    const result = await semanticSearch("burger", "brain-1", sampleEntries, true, null);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual(sampleEntries);
  });

  it("when isOnline=true and embedHeaders provided and API returns fallback:false returns semantic results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fallback: false,
        results: [
          { id: "e1", similarity: 0.9 },
          { id: "e3", similarity: 0.5 },
        ],
      }),
    });
    const { semanticSearch } = await import("../../src/lib/searchIndex");
    const headers = { "x-embed-key": "sk-test", "x-embed-provider": "openai" };
    const result = await semanticSearch("burger", "brain-1", sampleEntries, true, headers);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/search");
    expect(opts.method).toBe("POST");
    // Should contain embed headers
    expect(opts.headers["x-embed-key"]).toBe("sk-test");
    // Should return entries matching the semantic result IDs in order
    expect(result.map((e: Entry) => e.id)).toEqual(["e1", "e3"]);
  });

  it("when API returns fallback:true falls back to keyword scoring", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ fallback: true }),
    });
    const { semanticSearch } = await import("../../src/lib/searchIndex");
    const headers = { "x-embed-key": "sk-test", "x-embed-provider": "openai" };
    const result = await semanticSearch("burger", "brain-1", sampleEntries, true, headers);
    expect(result).toEqual(sampleEntries);
  });

  it("when fetch throws falls back to keyword scoring", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const { semanticSearch } = await import("../../src/lib/searchIndex");
    const headers = { "x-embed-key": "sk-test", "x-embed-provider": "openai" };
    const result = await semanticSearch("burger", "brain-1", sampleEntries, true, headers);
    expect(result).toEqual(sampleEntries);
  });

  it("returns all entries unchanged when query is empty", async () => {
    const { semanticSearch } = await import("../../src/lib/searchIndex");
    const result = await semanticSearch("", "brain-1", sampleEntries, true, {
      "x-embed-key": "sk-test",
    });
    expect(result).toBe(sampleEntries);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
