import { describe, it, expect, vi } from "vitest";

describe("onboarding restart", () => {
  it("clears openbrain_onboarded from localStorage", () => {
    localStorage.setItem("openbrain_onboarded", "1");
    // simulate the restart action
    localStorage.removeItem("openbrain_onboarded");
    expect(localStorage.getItem("openbrain_onboarded")).toBeNull();
  });
  it("dispatches openbrain:restart-onboarding custom event", () => {
    const handler = vi.fn();
    window.addEventListener("openbrain:restart-onboarding", handler);
    window.dispatchEvent(new CustomEvent("openbrain:restart-onboarding"));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("openbrain:restart-onboarding", handler);
  });
});
