import { beforeEach, describe, expect, it, vi } from "vitest";

const quotaMock = vi.fn();
const fetchUserTierMock = vi.fn();
const googleAiFetchMock = vi.fn();

vi.mock("../../api/_lib/enrichQuota.js", () => ({
  checkAndConsumeQuota: quotaMock,
  fetchUserTier: fetchUserTierMock,
}));

vi.mock("../../api/_lib/googleAi.js", () => ({
  googleAiModelUrl: (model: string, endpoint: string) =>
    `https://gemini.test/models/${model}:${endpoint}`,
  googleAiFetch: googleAiFetchMock,
}));

describe("aiProvider boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    quotaMock.mockReset();
    fetchUserTierMock.mockReset();
    googleAiFetchMock.mockReset();
  });

  it("blocks provider calls when metered quota is denied", async () => {
    quotaMock.mockResolvedValue({ allowed: false, used: 20, limit: 20, errored: false });

    const { callAI } = await import("../../api/_lib/aiProvider.js");
    const text = await callAI(
      { provider: "gemini", apiKey: "key", model: "gemini-test" },
      "system",
      "content",
      { quota: { userId: "user-1", tier: "free" } },
    );

    expect(text).toBe("");
    expect(quotaMock).toHaveBeenCalledWith("user-1", "free");
    expect(googleAiFetchMock).not.toHaveBeenCalled();
  });

  it("uses the shared Gemini parser to ignore thought parts", async () => {
    quotaMock.mockResolvedValue({ allowed: true, used: 1, limit: 20, errored: false });
    googleAiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ thought: true, text: "internal" }, { text: "answer" }],
            },
          },
        ],
      }),
    } as Response);

    const { callAI } = await import("../../api/_lib/aiProvider.js");
    const text = await callAI(
      { provider: "gemini", apiKey: "key", model: "gemini-test" },
      "system",
      "content",
      { quota: { userId: "user-1", tier: "free" } },
    );

    expect(text).toBe("answer");
    expect(googleAiFetchMock).toHaveBeenCalledOnce();
  });
});
