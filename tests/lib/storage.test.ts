import { describe, it, expect, beforeEach } from "vitest";
import { StorageAdapter } from "../../src/lib/storage";

describe("StorageAdapter", () => {
  let store: StorageAdapter;
  beforeEach(() => { localStorage.clear(); store = new StorageAdapter(); });

  it("set and get a value", () => {
    store.set("k", { x: 1 });
    expect(store.get("k")).toEqual({ x: 1 });
  });

  it("get returns null for missing key", () => {
    expect(store.get("missing")).toBeNull();
  });

  it("remove deletes a key", () => {
    store.set("k", "v");
    store.remove("k");
    expect(store.get("k")).toBeNull();
  });
});
