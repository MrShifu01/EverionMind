/**
 * Tests for api/search.ts — semantic search handler.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: "POST",
    query: {},
    headers: { authorization: "Bearer test-token" },
    body: {},
    socket: { remoteAddress: "127.0.0.1" },
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

vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../api/_lib/generateEmbedding.js", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
  buildEntryText: vi.fn().mockReturnValue("text"),
}));

vi.mock("../../api/_lib/securityHeaders.js", () => ({
  applySecurityHeaders: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(async () => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [
      { id: "e1", similarity: 0.85 },
      { id: "e2", similarity: 0.6 },
    ],
  });
  // Reset mocked modules state
  const { verifyAuth } = await import("../../api/_lib/verifyAuth.js");
  const { rateLimit } = await import("../../api/_lib/rateLimit.js");
  vi.mocked(verifyAuth).mockResolvedValue({ id: "user-1" });
  vi.mocked(rateLimit).mockResolvedValue(true);
});

describe("search handler", () => {
  it("returns results even without x-embed-key header (uses server Gemini key)", async () => {
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({ body: { query: "hello world", brain_id: "brain-1" } });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.fallback).toBe(false);
  });

  it("returns fallback:true when query is empty", async () => {
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({
      headers: { authorization: "Bearer test-token", "x-embed-key": "sk-test" },
      body: { query: "", brain_id: "brain-1" },
    });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ fallback: true });
  });

  it("returns fallback:true when query is whitespace only", async () => {
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({
      headers: { authorization: "Bearer test-token", "x-embed-key": "sk-test" },
      body: { query: "   ", brain_id: "brain-1" },
    });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ fallback: true });
  });

  it("returns 400 when query exceeds 500 chars", async () => {
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({
      headers: { authorization: "Bearer test-token", "x-embed-key": "sk-test" },
      body: { query: "a".repeat(501), brain_id: "brain-1" },
    });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Query too long" });
  });

  it("returns 401 when auth fails", async () => {
    const { verifyAuth } = await import("../../api/_lib/verifyAuth.js");
    vi.mocked(verifyAuth).mockResolvedValueOnce(null);
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({
      headers: { authorization: "Bearer bad-token", "x-embed-key": "sk-test" },
      body: { query: "hello", brain_id: "brain-1" },
    });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 429 when rate limited", async () => {
    const { rateLimit } = await import("../../api/_lib/rateLimit.js");
    vi.mocked(rateLimit).mockResolvedValueOnce(false);
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({
      headers: { authorization: "Bearer test-token", "x-embed-key": "sk-test" },
      body: { query: "hello", brain_id: "brain-1" },
    });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it("calls generateEmbedding and match_entries RPC, returns results with fallback:false", async () => {
    const { generateEmbedding } = await import("../../api/_lib/generateEmbedding.js");
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({
      headers: {
        authorization: "Bearer test-token",
        "x-embed-key": "sk-test",
        "x-embed-provider": "openai",
      },
      body: { query: "burger recipe", brain_id: "brain-1" },
    });
    const res = makeRes();
    await handler(req as any, res as any);

    expect(generateEmbedding).toHaveBeenCalledWith(
      "burger recipe",
      "test-gemini-key",
    );
    expect(mockFetch).toHaveBeenCalled();
    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain("match_entries");
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.fallback).toBe(false);
    expect(Array.isArray(jsonArg.results)).toBe(true);
  });

  it("filters out results with similarity below threshold (0.3)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "e1", similarity: 0.85 },
        { id: "e2", similarity: 0.2 }, // below threshold
        { id: "e3", similarity: 0.29 }, // below threshold
        { id: "e4", similarity: 0.31 }, // above threshold
      ],
    });
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({
      headers: { authorization: "Bearer test-token", "x-embed-key": "sk-test" },
      body: { query: "tacos", brain_id: "brain-1" },
    });
    const res = makeRes();
    await handler(req as any, res as any);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.fallback).toBe(false);
    expect(jsonArg.results).toHaveLength(2);
    expect(jsonArg.results.map((r: any) => r.id)).toEqual(["e1", "e4"]);
  });

  it("returns fallback:true when Supabase RPC fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({
      headers: { authorization: "Bearer test-token", "x-embed-key": "sk-test" },
      body: { query: "burgers", brain_id: "brain-1" },
    });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ fallback: true });
  });

  it("returns 405 for unsupported methods (e.g. DELETE)", async () => {
    const handler = (await import("../../api/search.js")).default;
    const req = makeReq({ method: "DELETE", body: {} });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
