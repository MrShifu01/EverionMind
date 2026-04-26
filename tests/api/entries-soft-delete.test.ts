/**
 * Tests for soft-delete in api/entries.ts
 * - DELETE sets deleted_at instead of hard deleting
 * - GET excludes entries with deleted_at set
 * - GET with ?trash=true returns soft-deleted entries
 * - PATCH with ?action=restore clears deleted_at
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));
vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../api/_lib/checkBrainAccess.js", () => ({
  checkBrainAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../api/_lib/securityHeaders.js", () => ({
  applySecurityHeaders: vi.fn(),
}));

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  return res;
}

const ENTRY_ID = "entry-uuid-1234";
const BRAIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("api/entries — soft delete", () => {
  let handler: (req: any, res: any) => Promise<void>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    vi.doMock("../../api/_lib/verifyAuth.js", () => ({
      verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
    }));
    vi.doMock("../../api/_lib/rateLimit.js", () => ({
      rateLimit: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../api/_lib/checkBrainAccess.js", () => ({
      checkBrainAccess: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../api/_lib/securityHeaders.js", () => ({
      applySecurityHeaders: vi.fn(),
    }));

    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const mod = await import("../../api/entries");
    handler = mod.default;
  });

  it("DELETE sets deleted_at via PATCH instead of hard deleting", async () => {
    // First fetch: look up entry's brain_id
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([{ brain_id: BRAIN_ID }]),
      })
      // Second fetch: the soft-delete PATCH
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      })
      // Third fetch (fire-and-forget audit log)
      .mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });

    const req = {
      method: "DELETE",
      query: {},
      headers: {},
      body: { id: ENTRY_ID },
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // The actual PATCH call should use PATCH method (not DELETE) with deleted_at
    const patchCall = fetchSpy.mock.calls.find(
      ([url, opts]) =>
        opts?.method === "PATCH" && url.includes("entries") && url.includes(ENTRY_ID),
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].body);
    expect(patchBody).toHaveProperty("deleted_at");
    expect(typeof patchBody.deleted_at).toBe("string");
    // Verify it's a valid ISO date
    expect(new Date(patchBody.deleted_at).toISOString()).toBe(patchBody.deleted_at);
  });

  it("GET excludes soft-deleted entries (deleted_at=is.null in fallback path or RPC used)", async () => {
    // When RPC fails, the fallback direct query must include deleted_at=is.null
    fetchSpy
      // First call: entry_brains (shared entries lookup)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
        status: 200,
      })
      // Second call: RPC fails, triggers fallback
      .mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue([]),
        status: 500,
      })
      // Third call: fallback direct query with deleted_at=is.null
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
        status: 200,
      });

    const req = {
      method: "GET",
      query: { brain_id: BRAIN_ID },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);

    // The fallback direct query should include the deleted_at=is.null filter
    const hasDeletedFilter = fetchSpy.mock.calls.some(([url]: any[]) =>
      url.includes("deleted_at=is.null"),
    );
    expect(hasDeletedFilter).toBe(true);
  });

  it("GET with ?trash=true filters for soft-deleted entries", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
      status: 200,
    });

    const req = {
      method: "GET",
      query: { brain_id: BRAIN_ID, trash: "true" },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);

    // The query should include the "not is null" filter for deleted_at
    const hasTrashFilter = fetchSpy.mock.calls.some(
      ([url]: any[]) => url.includes("deleted_at=not.is.null") || url.includes("not.is.null"),
    );
    expect(hasTrashFilter).toBe(true);
  });

  it("PATCH with ?action=restore clears deleted_at", async () => {
    // First fetch: look up entry's brain_id
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([{ brain_id: BRAIN_ID }]),
      })
      // Second fetch: the restore PATCH
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([{ id: ENTRY_ID, deleted_at: null }]),
      })
      // Audit log
      .mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });

    const req = {
      method: "PATCH",
      query: { action: "restore" },
      headers: {},
      body: { id: ENTRY_ID },
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // The PATCH should set deleted_at to null
    const restoreCall = fetchSpy.mock.calls.find(
      ([url, opts]) =>
        opts?.method === "PATCH" && url.includes("entries") && url.includes(ENTRY_ID),
    );
    expect(restoreCall).toBeDefined();
    const body = JSON.parse(restoreCall![1].body);
    expect(body.deleted_at).toBeNull();
  });

  it("DELETE with ?permanent=true hard-deletes the entry (must accept id in request body)", async () => {
    // First fetch: look up entry's brain_id
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([{ brain_id: BRAIN_ID }]),
      })
      // Second fetch: the hard-delete
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      })
      // Audit log
      .mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });

    const req = {
      method: "DELETE",
      query: { permanent: "true" },
      headers: {},
      body: { id: ENTRY_ID },
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // The hard-delete should use DELETE method (not PATCH)
    const deleteCall = fetchSpy.mock.calls.find(
      ([url, opts]) =>
        opts?.method === "DELETE" && url.includes("entries") && url.includes(ENTRY_ID),
    );
    expect(deleteCall).toBeDefined();
  });
});
