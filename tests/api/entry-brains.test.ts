/**
 * Tests for api/entry-brains.ts — multi-brain assignment management
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: "GET",
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

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("GET /api/entry-brains", () => {
  it("returns 400 when entry_id is missing", async () => {
    const handler = (await import("../../api/entry-brains")).default;
    const req = makeReq({ method: "GET", query: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns the list of brain_ids for an entry", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { brain_id: "brain-a" },
        { brain_id: "brain-b" },
      ],
    });
    const handler = (await import("../../api/entry-brains")).default;
    const req = makeReq({ method: "GET", query: { entry_id: "entry-1" } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(["brain-a", "brain-b"]);
  });

  it("returns 401 when unauthenticated", async () => {
    const { verifyAuth } = await import("../../api/_lib/verifyAuth.js");
    vi.mocked(verifyAuth).mockResolvedValueOnce(null);
    const handler = (await import("../../api/entry-brains")).default;
    const req = makeReq({ method: "GET", query: { entry_id: "entry-1" } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("POST /api/entry-brains", () => {
  it("returns 400 when entry_id or brain_id is missing", async () => {
    const handler = (await import("../../api/entry-brains")).default;
    const req = makeReq({ method: "POST", body: { entry_id: "e1" } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("inserts the entry_brains row and returns 200", async () => {
    // First call: verify entry ownership
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ brain_id: "brain-primary" }],
    });
    // Second call: insert entry_brains row
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const handler = (await import("../../api/entry-brains")).default;
    const req = makeReq({ method: "POST", body: { entry_id: "e1", brain_id: "brain-b" } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("DELETE /api/entry-brains", () => {
  it("returns 400 when entry_id or brain_id is missing", async () => {
    const handler = (await import("../../api/entry-brains")).default;
    const req = makeReq({ method: "DELETE", query: { entry_id: "e1" } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("deletes the row and returns 200", async () => {
    // First call: verify entry ownership
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ brain_id: "brain-primary" }],
    });
    // Second call: delete entry_brains row
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const handler = (await import("../../api/entry-brains")).default;
    const req = makeReq({ method: "DELETE", query: { entry_id: "e1", brain_id: "brain-b" } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 405 for unsupported methods", async () => {
    const handler = (await import("../../api/entry-brains")).default;
    const req = makeReq({ method: "PUT", body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
