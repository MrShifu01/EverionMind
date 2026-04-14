import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/lib/ai", () => ({
  callAI: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}));
vi.mock("../../src/lib/extractNudgeText", () => ({
  extractNudgeText: vi.fn().mockReturnValue(null),
}));

import { useNudge } from "../../src/hooks/useNudge";

describe("useNudge", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("returns null nudge initially when localStorage is empty", () => {
    const { result } = renderHook(() =>
      useNudge({ entriesLoaded: false, entries: [], activeBrain: null }),
    );
    expect(result.current.nudge).toBeNull();
  });

  it("returns stored nudge from localStorage", () => {
    localStorage.setItem("openbrain_nudge", "You have 3 items to review");
    const { result } = renderHook(() =>
      useNudge({ entriesLoaded: false, entries: [], activeBrain: null }),
    );
    expect(result.current.nudge).toBe("You have 3 items to review");
  });

  it("setNudge updates the nudge value", () => {
    const { result } = renderHook(() =>
      useNudge({ entriesLoaded: false, entries: [], activeBrain: null }),
    );
    const { act } = require("@testing-library/react");
    act(() => {
      result.current.setNudge("new nudge");
    });
    expect(result.current.nudge).toBe("new nudge");
  });
});
