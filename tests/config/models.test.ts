import { describe, it, expect } from "vitest";
import { MODELS } from "../../src/config/models";

describe("models", () => {
  it("ANTHROPIC has at least one model", () => {
    expect(MODELS.ANTHROPIC.length).toBeGreaterThan(0);
    MODELS.ANTHROPIC.forEach((m: string) => expect(typeof m).toBe("string"));
  });

  it("OPENAI has at least one model", () => {
    expect(MODELS.OPENAI.length).toBeGreaterThan(0);
  });

  it("OPENROUTER has at least one model", () => {
    expect(MODELS.OPENROUTER.length).toBeGreaterThan(0);
  });
});
