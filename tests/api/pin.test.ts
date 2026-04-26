import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiReq, makeApiRes } from "../helpers/mockApiReq";

// Set env vars for Supabase client initialization
process.env.VITE_SUPABASE_URL = "https://mock.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-key";

vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));
vi.mock("../../api/_lib/rateLimit.js", () => ({ rateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock("../../api/_lib/securityHeaders.js", () => ({ applySecurityHeaders: vi.fn() }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const setupReq = (overrides: any = {}) =>
  makeApiReq({
    method: "POST",
    query: { action: "setup", resource: "pin" },
    body: { hash: "a".repeat(64), salt: "b".repeat(32) },
    ...overrides,
  });

describe("POST /api/pin?action=setup", () => {
  it("stores hash and salt, returns ok", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(setupReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("rejects invalid hash (not 64 hex chars)", async () => {
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(setupReq({ body: { hash: "short", salt: "b".repeat(32) } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects invalid salt", async () => {
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(setupReq({ body: { hash: "a".repeat(64), salt: "x" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("POST /api/pin?action=verify", () => {
  it("returns valid:true when hash matches", async () => {
    const hash = "a".repeat(64);
    mockFetch.mockResolvedValue({ ok: true, json: async () => [{ pin_hash: hash }] });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({ query: { action: "verify", resource: "pin" }, body: { hash } }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ valid: true });
  });

  it("returns valid:false when hash doesn't match", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [{ pin_hash: "b".repeat(64) }] });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        query: { action: "verify", resource: "pin" },
        body: { hash: "a".repeat(64) },
      }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ valid: false });
  });

  it("returns noPinSet when no record", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        query: { action: "verify", resource: "pin" },
        body: { hash: "a".repeat(64) },
      }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ valid: false, noPinSet: true });
  });
});

describe("DELETE /api/pin?action=delete", () => {
  it("clears pin_hash and returns ok", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({ method: "DELETE", query: { action: "delete", resource: "pin" }, body: {} }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
