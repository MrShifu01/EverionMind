import { describe, it, expect } from "vitest";
import { assertBrainOwnership, RLSViolationError } from "../../src/lib/rlsValidator";
describe("rlsValidator (S7-4)", () => {
  it("passes when userId matches owner", () => {
    expect(() => assertBrainOwnership("user-1", "user-1")).not.toThrow();
  });
  it("throws RLSViolationError when userId does not match", () => {
    expect(() => assertBrainOwnership("user-1", "user-2")).toThrow(RLSViolationError);
  });
});
