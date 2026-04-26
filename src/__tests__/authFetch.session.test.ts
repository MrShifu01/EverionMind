import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
const { mockGetSession, mockOnAuthStateChange, mockFetch, mockTrackEmbedding } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockFetch: vi.fn(),
  mockTrackEmbedding: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

vi.mock("../lib/usageTracker", () => ({
  trackEmbeddingIfPresent: mockTrackEmbedding,
}));

vi.stubGlobal("fetch", mockFetch);

import { authFetch, _resetSessionCache } from "../lib/authFetch";

function makeSession(token = "tok-abc") {
  return { data: { session: { access_token: token } } };
}

function makeResponse(status = 200) {
  return new Response(null, { status });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetSessionCache();
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mockFetch.mockResolvedValue(makeResponse());
});

describe("session token caching", () => {
  it("calls getSession once and reuses token for subsequent requests within TTL", async () => {
    mockGetSession.mockResolvedValue(makeSession("tok-1"));

    await authFetch("/api/a");
    await authFetch("/api/b");
    await authFetch("/api/c");

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    const calls = mockFetch.mock.calls;
    for (const [, opts] of calls) {
      expect((opts as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok-1" });
    }
  });

  it("re-fetches session after cache is invalidated via _resetSessionCache", async () => {
    mockGetSession
      .mockResolvedValueOnce(makeSession("tok-first"))
      .mockResolvedValueOnce(makeSession("tok-second"));

    await authFetch("/api/a");
    _resetSessionCache();
    await authFetch("/api/b");

    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer tok-first" },
    });
    expect(mockFetch.mock.calls[1][1]).toMatchObject({
      headers: { Authorization: "Bearer tok-second" },
    });
  });

  it("sends no Authorization header when there is no active session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await authFetch("/api/anon");

    const [, opts] = mockFetch.mock.calls[0];
    expect(
      (opts as RequestInit & { headers: Record<string, string> }).headers?.Authorization,
    ).toBeUndefined();
  });
});

describe("embedding tracking", () => {
  it("calls trackEmbeddingIfPresent with each response", async () => {
    mockGetSession.mockResolvedValue(makeSession());
    const resp = makeResponse();
    mockFetch.mockResolvedValue(resp);

    await authFetch("/api/embed");

    expect(mockTrackEmbedding).toHaveBeenCalledWith(resp);
  });
});
