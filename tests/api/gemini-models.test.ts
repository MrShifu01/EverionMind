import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("Gemini model env split", () => {
  it("uses chat, bulk, and fallback envs independently", async () => {
    process.env.GEMINI_CHAT_MODEL = "gemini-3-flash-preview";
    process.env.GEMINI_BULK_MODEL = "gemini-2.5-flash-lite";
    process.env.GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

    const models = await import("../../api/_lib/geminiModels.js");

    expect(models.GEMINI_CHAT_MODEL).toBe("gemini-3-flash-preview");
    expect(models.GEMINI_BULK_MODEL).toBe("gemini-2.5-flash-lite");
    expect(models.GEMINI_FALLBACK_MODEL).toBe("gemini-2.5-flash");
    expect(models.geminiFallbackChain("gemini-2.5-flash-lite")).toEqual([
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
    ]);
  });

  it("deduplicates fallback chains when primary is already the fallback", async () => {
    process.env.GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

    const models = await import("../../api/_lib/geminiModels.js");

    expect(models.geminiFallbackChain("gemini-2.5-flash")).toEqual(["gemini-2.5-flash"]);
  });
});
