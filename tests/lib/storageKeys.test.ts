import { describe, it, expect } from "vitest";
import { KEYS } from "../../src/lib/storageKeys";

describe("KEYS", () => {
  it("AI_API_KEY is the correct literal", () => {
    expect(KEYS.AI_API_KEY).toBe("openbrain_api_key");
  });

  it("OFFLINE_QUEUE is the correct literal", () => {
    expect(KEYS.OFFLINE_QUEUE).toBe("openbrain_queue");
  });

  it("learningDecisions scopes to brainId", () => {
    expect(KEYS.learningDecisions("brain-abc")).toBe("openbrain_learning_decisions:brain-abc");
  });

  it("learningSummary scopes to brainId", () => {
    expect(KEYS.learningSummary("brain-abc")).toBe("openbrain_learning_summary:brain-abc");
  });

  it("taskModel scopes to task name", () => {
    expect(KEYS.taskModel("capture")).toBe("openbrain_task_capture");
  });

  it("ENTRIES_CACHE is the correct literal", () => {
    expect(KEYS.ENTRIES_CACHE).toBe("openbrain_entries");
  });
});
