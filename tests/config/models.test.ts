import { describe, it, expect } from "vitest";
import { MODELS } from "../../src/config/models";

describe("models", () => {
  it("GEMINI has at least one model", () => {
    expect(MODELS.GEMINI.length).toBeGreaterThan(0);
    MODELS.GEMINI.forEach((m: string) => expect(typeof m).toBe("string"));
  });
});
