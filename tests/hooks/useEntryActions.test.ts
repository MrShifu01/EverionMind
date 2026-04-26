import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../src/lib/authFetch", () => ({
  authFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}));
vi.mock("../../src/lib/notifications", () => ({
  showError: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("../../src/lib/searchIndex", () => ({
  removeFromIndex: vi.fn(),
  indexEntry: vi.fn(),
}));
vi.mock("../../src/lib/offlineQueue", () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/lib/entriesCache", () => ({
  writeEntriesCache: vi.fn(),
}));
vi.mock("../../src/lib/aiSettings", () => ({
  getEmbedHeaders: vi.fn().mockReturnValue(null),
}));

import { useEntryActions } from "../../src/hooks/useEntryActions";

const makeEntry = (id: string) => ({
  id,
  title: `Entry ${id}`,
  content: "content",
  type: "note",
  tags: [],
  created_at: new Date().toISOString(),
  metadata: {},
});

describe("useEntryActions", () => {
  let entries: ReturnType<typeof makeEntry>[];
  let setEntries: ReturnType<typeof vi.fn>;
  let setSelected: ReturnType<typeof vi.fn>;
  let refreshCount: ReturnType<typeof vi.fn>;
  const isOnlineRef = { current: true };

  beforeEach(() => {
    entries = [makeEntry("a"), makeEntry("b"), makeEntry("c")];
    setEntries = vi.fn();
    setSelected = vi.fn();
    refreshCount = vi.fn();
    vi.clearAllMocks();
  });

  it("handleDelete removes entry from state optimistically", () => {
    const { result } = renderHook(() =>
      useEntryActions({
        entries: entries as any,
        setEntries: setEntries as any,
        setSelected: setSelected as any,
        isOnline: true,
        isOnlineRef,
        refreshCount: refreshCount as any,
        cryptoKey: null,
      }),
    );
    act(() => {
      result.current.handleDelete("a");
    });
    expect(setEntries).toHaveBeenCalled();
    expect(result.current.lastAction?.type).toBe("delete");
  });

  it("handleUndo restores deleted entry", () => {
    const { result } = renderHook(() =>
      useEntryActions({
        entries: entries as any,
        setEntries: setEntries as any,
        setSelected: setSelected as any,
        isOnline: true,
        isOnlineRef,
        refreshCount: refreshCount as any,
        cryptoKey: null,
      }),
    );
    act(() => {
      result.current.handleDelete("a");
    });
    act(() => {
      result.current.handleUndo();
    });
    expect(setEntries).toHaveBeenCalledTimes(2);
    expect(result.current.lastAction).toBeNull();
  });

  it("handleCreated sets lastAction to create", () => {
    const { result } = renderHook(() =>
      useEntryActions({
        entries: entries as any,
        setEntries: setEntries as any,
        setSelected: setSelected as any,
        isOnline: true,
        isOnlineRef,
        refreshCount: refreshCount as any,
        cryptoKey: null,
      }),
    );
    act(() => {
      result.current.handleCreated({ id: "new-id" } as any);
    });
    expect(result.current.lastAction?.type).toBe("create");
    expect(result.current.lastAction?.id).toBe("new-id");
  });

  it("saveError is null by default", () => {
    const { result } = renderHook(() =>
      useEntryActions({
        entries: entries as any,
        setEntries: setEntries as any,
        setSelected: setSelected as any,
        isOnline: true,
        isOnlineRef,
        refreshCount: refreshCount as any,
        cryptoKey: null,
      }),
    );
    expect(result.current.saveError).toBeNull();
  });
});
