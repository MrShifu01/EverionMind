import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

vi.mock("../../src/lib/authFetch", () => ({
  authFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}));
vi.mock("../../src/lib/offlineQueue", () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/lib/entriesCache", () => ({
  writeEntriesCache: vi.fn(),
  readEntriesCache: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/lib/searchIndex", () => ({
  indexEntry: vi.fn(),
  removeFromIndex: vi.fn(),
}));
vi.mock("../../src/lib/notifications", () => ({
  captureError: vi.fn(),
}));

import { EntryRepository } from "../../src/lib/entryRepository";

const makeEntry = (id = "e1") => ({
  id, title: "Test", content: "body", type: "note" as const,
  tags: [], created_at: new Date().toISOString(), metadata: {},
});

describe("EntryRepository", () => {
  let repo: EntryRepository;
  let getEntries: ReturnType<typeof vi.fn>;
  let setEntries: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getEntries = vi.fn().mockReturnValue([makeEntry()]);
    setEntries = vi.fn();
    repo = new EntryRepository({ getEntries, setEntries, isOnline: true, refreshCount: vi.fn() });
    vi.clearAllMocks();
    getEntries.mockReturnValue([makeEntry()]);
  });

  it("save optimistically adds entry to state", async () => {
    const newEntry = makeEntry("new-1");
    await repo.save(newEntry);
    expect(setEntries).toHaveBeenCalled();
  });

  it("delete optimistically removes entry from state", async () => {
    await repo.delete("e1");
    expect(setEntries).toHaveBeenCalled();
  });

  it("update optimistically patches entry in state", async () => {
    await repo.update("e1", { title: "Updated" });
    expect(setEntries).toHaveBeenCalled();
  });

  it("restore re-adds a deleted entry", async () => {
    const entry = makeEntry("e1");
    await repo.restore(entry);
    expect(setEntries).toHaveBeenCalled();
  });
});
