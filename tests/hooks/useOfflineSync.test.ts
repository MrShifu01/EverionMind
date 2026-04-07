import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";
import { enqueue, clear } from "../../src/lib/offlineQueue";
import type { OfflineOp } from "../../src/types";
import type { Mock } from "vitest";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnValue({ upsert: vi.fn() }),
  },
}));

vi.mock("../../src/lib/authFetch", () => ({
  authFetch: vi.fn(),
}));
import { authFetch } from "../../src/lib/authFetch";
import { useOfflineSync } from "../../src/hooks/useOfflineSync";

describe("useOfflineSync", () => {
  beforeEach(async () => {
    await clear();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("isOnline reflects navigator.onLine on mount", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useOfflineSync());
    expect(result.current.isOnline).toBe(false);
  });

  it("isOnline becomes false when offline event fires", async () => {
    const { result } = renderHook(() => useOfflineSync());
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.isOnline).toBe(false);
  });

  it("isOnline becomes true when online event fires", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    (authFetch as Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    const { result } = renderHook(() => useOfflineSync());
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.isOnline).toBe(true);
  });

  it("pendingCount reflects queue length on mount", async () => {
    await enqueue({
      id: "a",
      url: "/api/capture",
      method: "POST",
      body: "{}",
      created_at: new Date().toISOString(),
    });
    await enqueue({
      id: "b",
      url: "/api/capture",
      method: "POST",
      body: "{}",
      created_at: new Date().toISOString(),
    });
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.pendingCount).toBe(2));
  });

  it("drains queue on online event — successful ops are removed", async () => {
    (authFetch as Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    await enqueue({
      id: "op-1",
      url: "/api/capture",
      method: "POST",
      body: "{}",
      created_at: new Date().toISOString(),
    });
    const { result } = renderHook(() => useOfflineSync());
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(authFetch as Mock).toHaveBeenCalledWith(
      "/api/capture",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("404 responses are treated as success and removed from queue", async () => {
    (authFetch as Mock).mockResolvedValue({ ok: false, status: 404 });
    await enqueue({
      id: "op-2",
      url: "/api/delete-entry",
      method: "DELETE",
      body: "{}",
      created_at: new Date().toISOString(),
    });
    const { result } = renderHook(() => useOfflineSync());

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
  });

  it("5xx errors leave op in queue", async () => {
    (authFetch as Mock).mockResolvedValue({ ok: false, status: 500 });
    await enqueue({
      id: "op-3",
      url: "/api/capture",
      method: "POST",
      body: "{}",
      created_at: new Date().toISOString(),
    });
    const { result } = renderHook(() => useOfflineSync());

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(authFetch as Mock).toHaveBeenCalled());
    expect(result.current.pendingCount).toBe(1);
  });

  it("drops ops older than 7 days without calling authFetch", async () => {
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await enqueue({
      id: "stale",
      url: "/api/capture",
      method: "POST",
      body: "{}",
      created_at: stale,
    });
    const { result } = renderHook(() => useOfflineSync());

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(authFetch as Mock).not.toHaveBeenCalled();
  });

  it("calls onEntryIdUpdate when a create op returns a new id", async () => {
    (authFetch as Mock).mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "real-id" }),
    });
    await enqueue({
      id: "op-4",
      url: "/api/capture",
      method: "POST",
      body: "{}",
      created_at: new Date().toISOString(),
      tempId: "temp-123",
    });
    const onEntryIdUpdate = vi.fn();
    renderHook(() => useOfflineSync({ onEntryIdUpdate }));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(onEntryIdUpdate).toHaveBeenCalledWith("temp-123", "real-id"));
  });

  it("does not run concurrent drains", async () => {
    let resolveFirst: (() => void) | undefined;
    (authFetch as Mock).mockImplementation(
      () =>
        new Promise((res) => {
          resolveFirst = () => res({ ok: true, status: 200, json: () => Promise.resolve({}) });
        }),
    );
    await enqueue({
      id: "op-5",
      url: "/api/capture",
      method: "POST",
      body: "{}",
      created_at: new Date().toISOString(),
    });
    const { result } = renderHook(() => useOfflineSync());

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    act(() => {
      window.dispatchEvent(new Event("online"));
    }); // second fire while draining

    await act(async () => {
      resolveFirst?.();
    });
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(authFetch as Mock).toHaveBeenCalledTimes(1); // only once despite two online events
  });
});
