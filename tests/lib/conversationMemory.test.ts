import { describe, it, expect, beforeEach } from "vitest";
import { addTurn, getHistory, clearHistory, trimHistory } from "../../src/lib/conversationMemory";
describe("conversationMemory (S6-8)", () => {
  beforeEach(() => { clearHistory("b1"); });
  it("stores and retrieves turns", () => {
    addTurn("b1", "user", "hello");
    addTurn("b1", "assistant", "hi");
    expect(getHistory("b1")).toHaveLength(2);
  });
  it("trimHistory keeps last N pairs", () => {
    for (let i = 0; i < 15; i++) { addTurn("b1","user",`q${i}`); addTurn("b1","assistant",`a${i}`); }
    const trimmed = trimHistory(getHistory("b1"), 10);
    expect(trimmed.length).toBeLessThanOrEqual(10);
  });
  it("isolated per brainId", () => {
    addTurn("b1","user","a"); addTurn("b2","user","b");
    expect(getHistory("b1")).toHaveLength(1);
    expect(getHistory("b2")).toHaveLength(1);
  });
});
