/**
 * S3-5: Tests for embed retry with exponential backoff.
 * generateEmbedding should be retried up to 3 times before failing.
 *
 * embed is now a sub-route of /api/capture (?action=embed) and goes through
 * the withAuth middleware. Tests exercise the default export end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: "POST",
    query: { action: "embed" },
    headers: {
      authorization: "Bearer test-token",
    },
    body: { entry_id: "entry-abc" },
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

vi.mock("../../api/_lib/checkBrainAccess.js", () => ({
  checkBrainAccess: vi.fn().mockResolvedValue({ role: "owner" }),
}));

vi.mock("../../api/_lib/securityHeaders.js", () => ({
  applySecurityHeaders: vi.fn(),
}));

const mockGenerateEmbedding = vi.fn();
vi.mock("../../api/_lib/generateEmbedding.js", () => ({
  generateEmbedding: (...args: any[]) => mockGenerateEmbedding(...args),
  generateEmbeddingsBatch: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  buildEntryText: vi.fn().mockReturnValue("title content"),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.stubGlobal("setTimeout", (fn: () => void, _ms: number) => {
  fn();
  return 0;
});

beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
  mockGenerateEmbedding.mockReset();
  process.env.GEMINI_API_KEY = "test-gemini-key";

  // Supabase fetch: entry lookup + patch both succeed
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [
      { id: "entry-abc", title: "T", content: "C", tags: [], brain_id: "brain-1" },
    ],
    text: async () => "",
    headers: { get: () => "0/1" },
  });
});

describe("embed handler — retry on transient failure (S3-5)", () => {
  it("succeeds on first attempt when no error", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    const handler = (await import("../../api/capture")).default;
    const req = makeReq();
    const res = makeRes();
    await handler(req as any, res as any);
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("retries up to 3 times on transient error then succeeds", async () => {
    mockGenerateEmbedding
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValue([0.1, 0.2, 0.3]);

    const handler = (await import("../../api/capture")).default;
    const req = makeReq();
    const res = makeRes();
    await handler(req as any, res as any);
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("returns 502 after all 3 attempts fail", async () => {
    mockGenerateEmbedding.mockRejectedValue(new Error("persistent error"));

    const handler = (await import("../../api/capture")).default;
    const req = makeReq();
    const res = makeRes();
    await handler(req as any, res as any);
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
