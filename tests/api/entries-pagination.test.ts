/**
 * Tests for entry pagination in api/entries.ts
 * - GET with ?limit=2 returns first 2 entries + nextCursor when more exist
 * - GET with ?cursor=<iso-date> returns entries created_at < cursor
 * - When total results <= limit, nextCursor is null
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  return res;
}

vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../api/_lib/checkBrainAccess.js", () => ({
  checkBrainAccess: vi.fn().mockResolvedValue(true),
}));

const BRAIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Fake entries for pagination tests (ordered newest-first)
const ENTRIES = [
  { id: "1", title: "Entry 1", type: "note", created_at: "2024-01-05T00:00:00Z" },
  { id: "2", title: "Entry 2", type: "note", created_at: "2024-01-04T00:00:00Z" },
  { id: "3", title: "Entry 3", type: "note", created_at: "2024-01-03T00:00:00Z" },
];

describe("api/entries — pagination", () => {
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

    // Default fetch: RPC returns all 3 entries
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(ENTRIES),
      status: 200,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const mod = await import("../../api/entries");
    handler = mod.default;
  });

  it("returns first 2 entries + nextCursor when more exist", async () => {
    // Return 3 entries from fetch (limit+1 fetch trick: limit=2, fetch 3)
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(ENTRIES), // 3 items
      status: 200,
    });

    const req = {
      method: "GET",
      query: { brain_id: BRAIN_ID, limit: "2" },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseArg = res.json.mock.calls[0][0];

    // Should have entries array with 2 items (sliced)
    expect(responseArg.entries).toHaveLength(2);
    // Should have a nextCursor pointing to created_at of last returned entry
    expect(responseArg.nextCursor).toBe(ENTRIES[1].created_at);
    expect(responseArg.hasMore).toBe(true);
  });

  it("returns no nextCursor when results fit in limit", async () => {
    // Only 2 entries returned — within limit=5
    const twoEntries = ENTRIES.slice(0, 2);
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(twoEntries),
      status: 200,
    });

    const req = {
      method: "GET",
      query: { brain_id: BRAIN_ID, limit: "5" },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseArg = res.json.mock.calls[0][0];
    expect(responseArg.entries).toHaveLength(2);
    expect(responseArg.nextCursor).toBeNull();
    expect(responseArg.hasMore).toBe(false);
  });

  it("uses cursor parameter in query to Supabase", async () => {
    const cursor = "2024-01-04T00:00:00Z";
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([ENTRIES[2]]), // only oldest entry
      status: 200,
    });

    const req = {
      method: "GET",
      query: { brain_id: BRAIN_ID, cursor },
      headers: {},
    };
    const res = makeRes();
    await handler(req, res);

    // Verify that some fetch URL contains the cursor filter
    const hasCursor = fetchSpy.mock.calls.some(([url]: any[]) =>
      url.includes(encodeURIComponent(cursor)),
    );
    expect(hasCursor).toBe(true);
  });
});
