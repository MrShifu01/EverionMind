import { describe, it, expect } from "vitest";
import { QueuedOperation, enqueue, dequeue, peekQueue } from "../../src/lib/entryQueue";
describe("entryQueue (S7-1)", () => {
  it("enqueue adds operation", () => {
    const q: QueuedOperation[] = [];
    enqueue(q, { type:"create", entry_id:"e1", payload:{} });
    expect(q).toHaveLength(1);
  });
  it("dequeue removes and returns head", () => {
    const q: QueuedOperation[] = [];
    enqueue(q, { type:"create", entry_id:"e1", payload:{} });
    enqueue(q, { type:"update", entry_id:"e2", payload:{} });
    expect(dequeue(q)?.entry_id).toBe("e1");
    expect(q).toHaveLength(1);
  });
  it("peekQueue returns head without removing", () => {
    const q: QueuedOperation[] = [];
    enqueue(q, { type:"delete", entry_id:"e1", payload:{} });
    expect(peekQueue(q)?.entry_id).toBe("e1");
    expect(q).toHaveLength(1);
  });
});
