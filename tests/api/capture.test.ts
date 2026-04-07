/**
 * Tests for api/capture.ts — type normalisation behaviour.
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
  return res;
}

vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../api/_lib/checkBrainAccess.js", () => ({
  checkBrainAccess: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../api/_lib/generateEmbedding.js", () => ({
  generateEmbedding: vi.fn().mockResolvedValue([]),
  buildEntryText: vi.fn().mockReturnValue(""),
}));

// Mock fetch globally to simulate Supabase responses
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  // Default: Supabase capture RPC returns success
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: "entry-123" }),
    text: async () => "",
  });
});

describe("capture handler — type normalisation", () => {
  it("accepts a valid type and passes it to Supabase", async () => {
    const handler = (await import("../../api/capture")).default;
    const req = makeReq({ body: { p_title: "Test", p_type: "document" } });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).not.toHaveBeenCalledWith(400);
    const supabaseBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(supabaseBody.p_type).toBe("document");
  });

  it("normalises an AI-invented type ('company') to 'note' instead of 400ing", async () => {
    const handler = (await import("../../api/capture")).default;
    const req = makeReq({ body: { p_title: "Smash Social Club", p_type: "company" } });
    const res = makeRes();
    await handler(req as any, res as any);
    // Must NOT return 400
    expect(res.status).not.toHaveBeenCalledWith(400);
    // Must normalise type to "note" before forwarding to Supabase
    const supabaseBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(supabaseBody.p_type).toBe("note");
  });

  it("normalises 'director' type to 'note'", async () => {
    const handler = (await import("../../api/capture")).default;
    const req = makeReq({ body: { p_title: "John Smith", p_type: "director" } });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).not.toHaveBeenCalledWith(400);
    const supabaseBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(supabaseBody.p_type).toBe("note");
  });

  it("still rejects a missing title", async () => {
    const handler = (await import("../../api/capture")).default;
    const req = makeReq({ body: { p_title: "", p_type: "note" } });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
