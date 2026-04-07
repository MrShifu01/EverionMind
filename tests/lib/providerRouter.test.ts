import { describe, it, expect } from "vitest";
import { resolveProvider, PROVIDER_CONFIGS } from "../../src/lib/providerRouter";
describe("providerRouter (S7-5)", () => {
  it("resolves anthropic config", () => {
    const cfg = resolveProvider("anthropic");
    expect(cfg.baseUrl).toContain("anthropic");
    expect(cfg.modelsAllowed.length).toBeGreaterThan(0);
  });
  it("resolves openai config", () => {
    const cfg = resolveProvider("openai");
    expect(cfg.baseUrl).toContain("openai");
  });
  it("falls back to anthropic for unknown provider", () => {
    const cfg = resolveProvider("unknown");
    expect(cfg).toEqual(PROVIDER_CONFIGS["anthropic"]);
  });
});
