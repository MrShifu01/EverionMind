import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/aiSettings", () => ({
  isAIConfigured: vi.fn().mockReturnValue(true),
  getModelForTask: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/lib/systemPromptBuilder", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue(""),
}));

vi.mock("../../src/lib/authFetch", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "../../src/lib/authFetch";
import { callAI } from "../../src/lib/ai";

const mockAuthFetch = authFetch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthFetch.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("callAI endpoint routing", () => {
  it("always routes to /api/llm?provider=google (server-side Gemini)", async () => {
    await callAI({ messages: [{ role: "user", content: "hi" }] });
    const [url] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/llm?provider=google");
  });

  it("uses google regardless of user provider setting", async () => {
    await callAI({ messages: [{ role: "user", content: "hi" }] });
    const [url] = mockAuthFetch.mock.calls[0];
    expect(url).toBe("/api/llm?provider=google");
  });
});

describe("callAI message normalisation", () => {
  it("unknown provider uses anthropic message format (no transformation)", async () => {
    const imageMessage = {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
      ],
    };
    await callAI({ messages: [imageMessage] });
    // The body should contain the original Anthropic-style block, not the OpenAI url format
    const body = JSON.parse(mockAuthFetch.mock.calls[0][1].body);
    expect(body.messages[0].content[0].type).toBe("image");
    expect(body.messages[0].content[0].source).toBeDefined();
    expect(body.messages[0].content[0].image_url).toBeUndefined();
  });
});
