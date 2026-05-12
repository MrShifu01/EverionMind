import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/_lib/generateEmbedding.js", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("retrievalCore", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  });

  it("keeps short lookup tokens and routes keyword expansion through ranked FTS", async () => {
    const ftsBodies: Array<Record<string, unknown>> = [];
    const fetchUrls: string[] = [];

    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      fetchUrls.push(url);
      if (url.includes("/important_memories")) return jsonResponse([]);
      if (url.includes("/rpc/match_entries")) return jsonResponse([]);
      if (url.includes("/rpc/search_entries_fts")) {
        ftsBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([
          {
            id: "entry-id",
            title: "My ID Number",
            content: "ID number is 1234567890.",
            type: "document",
            tags: [],
            metadata: null,
            brain_id: "brain-1",
            rank: 1,
          },
        ]);
      }
      if (url.includes("/concept_graphs")) return jsonResponse([]);
      return jsonResponse([]);
    });

    const { retrieveEntries } = await import("../../api/_lib/retrievalCore.js");
    const result = await retrieveEntries("what is my ID", "brain-1", "gemini-key", 5);

    expect(ftsBodies[0]).toMatchObject({
      p_brain_ids: ["brain-1"],
      p_query: "id",
    });
    expect(fetchUrls.some((url) => url.includes("search_tsv=wfts"))).toBe(false);
    expect(result.entries[0]?.id).toBe("entry-id");
  });
});
