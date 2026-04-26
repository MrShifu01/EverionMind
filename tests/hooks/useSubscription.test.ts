import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}));

import { useSubscription } from "../../src/lib/useSubscription";

function makeQueryBuilder(data: any, error: any = null) {
  const builder: any = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue({ data, error });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data, error });
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("useSubscription", () => {
  it("returns isLoading=true initially", () => {
    mockFrom.mockReturnValue(makeQueryBuilder(null));
    const { result } = renderHook(() => useSubscription());
    expect(result.current.isLoading).toBe(true);
  });

  it("returns free tier when user_profiles has tier=free", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "free", tier_expires_at: null, stripe_subscription_id: null });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("free");
  });

  it("returns starter tier and correct limits", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "starter", tier_expires_at: null });
      if (table === "user_usage")
        return makeQueryBuilder({ captures: 100, chats: 50, voice: 5, improve: 10 });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("starter");
    expect(result.current.limits.captures).toBe(500);
    expect(result.current.usage.captures).toBe(100);
    expect(result.current.pct.captures).toBe(20);
  });

  it("returns free when tier_expires_at is in the past", async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "pro", tier_expires_at: pastDate });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("free");
  });

  it("returns pro when tier_expires_at is in the future", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "pro", tier_expires_at: futureDate });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("pro");
  });

  it("pct.improve is undefined for pro (unlimited)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "pro", tier_expires_at: null });
      if (table === "user_usage")
        return makeQueryBuilder({ captures: 0, chats: 0, voice: 0, improve: 500 });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pct.improve).toBeUndefined();
  });
});
