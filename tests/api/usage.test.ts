import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../api/_lib/sbHeaders.js", () => ({
  sbHeaders: () => ({ "Content-Type": "application/json" }),
}));

// Must import after mocks
const { checkAndIncrement } = await import("../../api/_lib/usage.js");

function rpcOk(count: number) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => count });
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.resetModules();
});

describe("checkAndIncrement", () => {
  it("BYOK users are always allowed regardless of tier", async () => {
    const result = await checkAndIncrement("uid", "chats", "free", true);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("free tier (no BYOK) is always blocked", async () => {
    const result = await checkAndIncrement("uid", "chats", "free", false);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.pct).toBe(100);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("starter chat within limit is allowed", async () => {
    rpcOk(50); // 50 out of 200
    const result = await checkAndIncrement("uid", "chats", "starter", false);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(150);
    expect(result.pct).toBe(25);
  });

  it("starter chat at limit is blocked", async () => {
    rpcOk(200); // exactly at limit
    const result = await checkAndIncrement("uid", "chats", "starter", false);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.pct).toBe(100);
  });

  it("starter chat over limit is blocked", async () => {
    rpcOk(201);
    const result = await checkAndIncrement("uid", "chats", "starter", false);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("pro improve is always allowed (unlimited)", async () => {
    rpcOk(9999);
    const result = await checkAndIncrement("uid", "improve", "pro", false);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    expect(result.pct).toBe(0);
  });

  it("DB failure throws quota_check_failed and logs error (callers return 503)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(checkAndIncrement("uid", "chats", "starter", false)).rejects.toMatchObject({
      message: "quota_check_failed",
      status: 503,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[usage]"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("calls increment_usage RPC with correct params", async () => {
    rpcOk(1);
    const period = new Date().toISOString().slice(0, 7);
    await checkAndIncrement("user-123", "captures", "starter", false);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/rpc/increment_usage"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ p_user_id: "user-123", p_period: period, p_action: "captures" }),
      }),
    );
  });
});
