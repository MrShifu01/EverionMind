/**
 * Tests for failed ops store in src/lib/offlineQueue.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { putFailed, getAllFailed, clearFailed, clear } from "../../src/lib/offlineQueue";
import type { OfflineOp } from "../../src/types";

const makeOp = (id: string): OfflineOp => ({
  id,
  url: "/api/capture",
  method: "POST",
  body: "{}",
  created_at: new Date().toISOString(),
});

describe("offlineQueue — failed ops store", () => {
  beforeEach(async () => {
    await clearFailed();
    await clear();
  });

  it("putFailed stores an op in the failed store", async () => {
    await putFailed(makeOp("f1"));
    const all = await getAllFailed();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("f1");
  });

  it("getAllFailed retrieves all failed ops", async () => {
    await putFailed(makeOp("f1"));
    await putFailed(makeOp("f2"));
    await putFailed(makeOp("f3"));
    const all = await getAllFailed();
    expect(all).toHaveLength(3);
    expect(all.map((o) => o.id).sort()).toEqual(["f1", "f2", "f3"]);
  });

  it("clearFailed empties the failed store", async () => {
    await putFailed(makeOp("f1"));
    await putFailed(makeOp("f2"));
    await clearFailed();
    const all = await getAllFailed();
    expect(all).toHaveLength(0);
  });

  it("failed store is separate from the main queue store", async () => {
    const { enqueue, getAll } = await import("../../src/lib/offlineQueue");
    await enqueue(makeOp("q1"));
    await putFailed(makeOp("fail-1"));

    const queue = await getAll();
    const failed = await getAllFailed();

    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("q1");
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe("fail-1");
  });

  it("putFailed is idempotent for same id", async () => {
    const op = makeOp("f-dup");
    await putFailed(op);
    await putFailed(op);
    const all = await getAllFailed();
    expect(all).toHaveLength(1);
  });
});
