import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/learningEngine", () => ({
  getLearningsContext: vi.fn(),
}));

import { getLearningsContext } from "../../src/lib/learningEngine";
import { buildSystemPrompt } from "../../src/lib/systemPromptBuilder";

const mockGetLearnings = getLearningsContext as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetLearnings.mockReturnValue("");
});

describe("buildSystemPrompt", () => {
  it("returns empty string when called with no arguments", () => {
    expect(buildSystemPrompt({})).toBe("");
  });

  it("returns base unchanged when no memoryGuide or brainId", () => {
    expect(buildSystemPrompt({ base: "You are helpful." })).toBe("You are helpful.");
  });

  it("prepends memory guide in Classification Guide / Task format", () => {
    const result = buildSystemPrompt({ base: "Classify this.", memoryGuide: "Use types: note, task." });
    expect(result).toBe(
      "[Classification Guide]\nUse types: note, task.\n\n[Task]\nClassify this.",
    );
  });

  it("appends learnings block when brainId is provided and learnings exist", () => {
    mockGetLearnings.mockReturnValue("User prefers short titles.");
    const result = buildSystemPrompt({ base: "Do something.", brainId: "brain-1", withLearnings: true });
    expect(result).toContain("--- USER LEARNING CONTEXT ---");
    expect(result).toContain("User prefers short titles.");
    expect(result).toContain("--- END LEARNING CONTEXT ---");
    expect(mockGetLearnings).toHaveBeenCalledWith("brain-1");
  });

  it("does not append learnings block when getLearningsContext returns empty string", () => {
    mockGetLearnings.mockReturnValue("");
    const result = buildSystemPrompt({ base: "Do something.", brainId: "brain-1", withLearnings: true });
    expect(result).toBe("Do something.");
    expect(result).not.toContain("LEARNING CONTEXT");
  });

  it("composes guide then base then learnings in correct order", () => {
    mockGetLearnings.mockReturnValue("Prefer note type.");
    const result = buildSystemPrompt({
      base: "Classify.",
      memoryGuide: "Guide here.",
      brainId: "brain-2", withLearnings: true,
    });
    const guideIdx = result.indexOf("[Classification Guide]");
    const taskIdx = result.indexOf("[Task]");
    const learnIdx = result.indexOf("USER LEARNING CONTEXT");
    expect(guideIdx).toBeLessThan(taskIdx);
    expect(taskIdx).toBeLessThan(learnIdx);
  });
});
