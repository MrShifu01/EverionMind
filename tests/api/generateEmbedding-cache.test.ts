import { beforeEach, describe, expect, it, vi } from "vitest";

const googleAiFetchMock = vi.fn();

vi.mock("../../api/_lib/googleAi.js", () => ({
  googleAiFetch: googleAiFetchMock,
  googleAiModelUrl: (model: string, action: string) => `https://example.test/${model}:${action}`,
}));

function embeddingResponse(value = 0.1) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ embedding: { values: Array(768).fill(value) } }),
    text: async () => "",
  };
}

beforeEach(async () => {
  googleAiFetchMock.mockReset();
  const { _clearEmbeddingCacheForTests } = await import("../../api/_lib/generateEmbedding.js");
  _clearEmbeddingCacheForTests();
});

describe("generateEmbedding cache", () => {
  it("reuses the cached vector for repeated identical text and key", async () => {
    googleAiFetchMock.mockResolvedValue(embeddingResponse(0.2));
    const { generateEmbedding } = await import("../../api/_lib/generateEmbedding.js");

    const first = await generateEmbedding("same query", "key-a");
    const second = await generateEmbedding("same query", "key-a");

    expect(googleAiFetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("deduplicates concurrent identical embedding requests", async () => {
    googleAiFetchMock.mockResolvedValue(embeddingResponse(0.3));
    const { generateEmbedding } = await import("../../api/_lib/generateEmbedding.js");

    const [first, second] = await Promise.all([
      generateEmbedding("concurrent query", "key-a"),
      generateEmbedding("concurrent query", "key-a"),
    ]);

    expect(googleAiFetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("does not share cache entries across provider keys", async () => {
    googleAiFetchMock
      .mockResolvedValueOnce(embeddingResponse(0.4))
      .mockResolvedValueOnce(embeddingResponse(0.5));
    const { generateEmbedding } = await import("../../api/_lib/generateEmbedding.js");

    await generateEmbedding("same query", "key-a");
    await generateEmbedding("same query", "key-b");

    expect(googleAiFetchMock).toHaveBeenCalledTimes(2);
  });
});
