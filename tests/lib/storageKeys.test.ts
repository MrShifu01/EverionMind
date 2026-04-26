import { describe, it, expect } from "vitest";
import { KEYS } from "../../src/lib/storageKeys";

describe("KEYS", () => {
  it("GROQ_KEY is the correct literal", () => {
    expect(KEYS.GROQ_KEY).toBe("openbrain_groq_key");
  });
  it("GEMINI_KEY is the correct literal", () => {
    expect(KEYS.GEMINI_KEY).toBe("openbrain_gemini_key");
  });
  it("OFFLINE_QUEUE is the correct literal", () => {
    expect(KEYS.OFFLINE_QUEUE).toBe("openbrain_queue");
  });
  it("ENTRIES_CACHE is the correct literal", () => {
    expect(KEYS.ENTRIES_CACHE).toBe("openbrain_entries");
  });
  it("USAGE is the correct literal", () => {
    expect(KEYS.USAGE).toBe("openbrain_usage");
  });
  it("learningDecisions scopes to brainId", () => {
    expect(KEYS.learningDecisions("brain-abc")).toBe("openbrain_learning_decisions:brain-abc");
  });
  it("taskModel scopes to task name", () => {
    expect(KEYS.taskModel("capture")).toBe("openbrain_task_capture");
  });
});
