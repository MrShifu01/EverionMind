/**
 * Tests for api/llm.ts — including the merged transcribe action.
 * Verifies that the transcribe action is handled within the llm handler
 * rather than as a separate serverless function.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal mock request/response helpers
function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: "POST",
    query: {},
    headers: {},
    body: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  return res;
}

// Mock verifyAuth and rateLimit so we can test handler logic in isolation
vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));

describe("api/llm — transcribe action", () => {
  let handler: (req: any, res: any) => Promise<void>;

  beforeEach(async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    vi.resetModules();
    // Re-mock after resetModules
    vi.mock("../../api/_lib/verifyAuth.js", () => ({
      verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
    }));
    vi.mock("../../api/_lib/rateLimit.js", () => ({
      rateLimit: vi.fn().mockResolvedValue(true),
    }));
    const mod = await import("../../api/llm.js");
    handler = mod.default;
  });

  it("returns 405 for GET requests to transcribe action", async () => {
    const req = makeReq({ method: "GET", query: { action: "transcribe" } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });


  it("returns 400 when audio field is missing", async () => {
    const req = makeReq({
      query: { action: "transcribe" },
      headers: {},
      body: { mimeType: "audio/webm" },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("audio") }),
    );
  });

  it("returns 400 when mimeType field is missing", async () => {
    const req = makeReq({
      query: { action: "transcribe" },
      headers: {},
      body: { audio: "dmFsaWQ=" },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("mimeType") }),
    );
  });

  it("applies stricter rate limit (10) for transcribe action", async () => {
    const { rateLimit } = await import("../../api/_lib/rateLimit.js");
    const req = makeReq({
      query: { action: "transcribe" },
      headers: { "x-groq-api-key": "test-key" },
      body: { audio: "dmFsaWQ=", mimeType: "audio/webm" },
    });
    const res = makeRes();
    // Mock fetch to avoid real network call
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "hello" }),
    } as any);
    await handler(req, res);
    expect(rateLimit).toHaveBeenCalledWith(expect.anything(), 10);
  });
});

