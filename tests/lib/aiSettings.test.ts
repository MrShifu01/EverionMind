import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("../../src/data/constants", () => ({ MODEL: "gemini-2.5-flash-lite" }));

import {
  getGroqKey,
  setGroqKey,
  getGeminiKey,
  setGeminiKey,
  getEmbedProvider,
  setEmbedProvider,
  getEmbedHeaders,
  isAIConfigured,
  loadUserAISettings,
  _resetForTests,
} from "../../src/lib/aiSettings";
import { KEYS } from "../../src/lib/storageKeys";

beforeEach(() => {
  localStorage.clear();
  _resetForTests();
});

describe("getGroqKey / setGroqKey", () => {
  it("returns null when nothing set", () => {
    expect(getGroqKey()).toBeNull();
  });
  it("set then get returns value", () => {
    setGroqKey("gsk-abc");
    expect(getGroqKey()).toBe("gsk-abc");
  });
  it("value NOT written to localStorage", () => {
    setGroqKey("gsk-abc");
    expect(localStorage.getItem(KEYS.GROQ_KEY)).toBeNull();
  });
  it("set null clears memory", () => {
    setGroqKey("gsk-abc");
    setGroqKey(null);
    expect(getGroqKey()).toBeNull();
  });
});

describe("getGeminiKey / setGeminiKey", () => {
  it("returns null when nothing set", () => {
    expect(getGeminiKey()).toBeNull();
  });
  it("set then get returns value", () => {
    setGeminiKey("AIza-gem");
    expect(getGeminiKey()).toBe("AIza-gem");
  });
  it("value NOT written to localStorage", () => {
    setGeminiKey("AIza-gem");
    expect(localStorage.getItem(KEYS.GEMINI_KEY)).toBeNull();
  });
});

describe("getEmbedProvider", () => {
  it("always returns google", () => {
    expect(getEmbedProvider()).toBe("google");
  });
  it("setEmbedProvider is a no-op", () => {
    setEmbedProvider("openai");
    expect(getEmbedProvider()).toBe("google");
  });
});

describe("getEmbedHeaders", () => {
  it("returns google provider", () => {
    const h = getEmbedHeaders();
    expect(h["X-Embed-Provider"]).toBe("google");
  });
  it("includes gemini key when set", () => {
    setGeminiKey("AIza-test");
    expect(getEmbedHeaders()["X-Embed-Key"]).toBe("AIza-test");
  });
});

describe("isAIConfigured", () => {
  it("always returns true", () => {
    expect(isAIConfigured()).toBe(true);
  });
});

describe("loadUserAISettings", () => {
  it("populates groq and gemini keys from Supabase data", async () => {
    const { supabase } = await import("../../src/lib/supabase");
    (supabase.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [{ groq_key: "gsk-loaded", gemini_key: "AIza-loaded", embed_provider: "google" }],
            error: null,
          }),
        }),
      }),
    });
    await loadUserAISettings("uid-123");
    expect(getGroqKey()).toBe("gsk-loaded");
    expect(getGeminiKey()).toBe("AIza-loaded");
  });
});
