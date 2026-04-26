import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const {
  mockAuthFetch,
  mockGetAll,
  mockRemove,
  mockEnqueue,
  mockPutFailed,
  mockGetAllFailed,
  mockClearFailed,
  mockGetEmbedHeaders,
} = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockGetAll: vi.fn(),
  mockRemove: vi.fn(),
  mockEnqueue: vi.fn(),
  mockPutFailed: vi.fn(),
  mockGetAllFailed: vi.fn(),
  mockClearFailed: vi.fn(),
  mockGetEmbedHeaders: vi.fn(),
}));

vi.mock("../../lib/authFetch", () => ({ authFetch: mockAuthFetch }));
vi.mock("../../lib/offlineQueue", () => ({
  getAll: mockGetAll,
  remove: mockRemove,
  enqueue: mockEnqueue,
  putFailed: mockPutFailed,
  getAllFailed: mockGetAllFailed,
  clearFailed: mockClearFailed,
}));
vi.mock("../../lib/aiSettings", () => ({ getEmbedHeaders: mockGetEmbedHeaders }));

import { useOfflineSync } from "../useOfflineSync";

const EMBED_HEADERS = { "X-Embed-Provider": "openai", "X-Embed-Key": "sk-test" };

function makeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: "op-1",
    url: "/api/capture",
    method: "POST",
    body: JSON.stringify({
      p_title: "Test Entry",
      p_content: "Some content",
      p_type: "note",
      p_metadata: {},
      p_tags: [],
      p_brain_id: "brain-1",
    }),
    created_at: new Date().toISOString(),
    tempId: "temp-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllFailed.mockResolvedValue([]);
  mockRemove.mockResolvedValue(undefined);
  mockGetEmbedHeaders.mockReturnValue(EMBED_HEADERS);
  mockAuthFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ id: "real-id-1" }),
  });
});

describe("useOfflineSync — embed headers on standard capture sync", () => {
  it("includes embed headers when syncing a queued non-secret capture op", async () => {
    mockGetAll.mockResolvedValueOnce([makeOp()]).mockResolvedValue([]);

    const { result } = renderHook(() => useOfflineSync());

    await act(async () => {
      await result.current.sync();
    });

    const captureCall = mockAuthFetch.mock.calls.find(([url]: any[]) => url === "/api/capture");
    expect(captureCall).toBeDefined();
    expect(captureCall![1].headers).toMatchObject(EMBED_HEADERS);
  });

  it("does NOT include embed headers when syncing a queued secret capture op", async () => {
    const secretBody = JSON.stringify({
      p_title: "Secret",
      p_content: "encrypted",
      p_type: "secret",
      p_metadata: {},
      p_tags: [],
      p_brain_id: "brain-1",
    });
    mockGetAll
      .mockResolvedValueOnce([makeOp({ id: "op-2", body: secretBody, tempId: "temp-2" })])
      .mockResolvedValue([]);

    const { result } = renderHook(() => useOfflineSync());

    await act(async () => {
      await result.current.sync();
    });

    const captureCall = mockAuthFetch.mock.calls.find(([url]: any[]) => url === "/api/capture");
    expect(captureCall).toBeDefined();
    expect(captureCall![1].headers).not.toMatchObject({ "X-Embed-Provider": "openai" });
  });
});
