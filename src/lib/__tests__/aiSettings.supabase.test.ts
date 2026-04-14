import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUpsert, mockLimit, mockEq, mockSelect, mockFrom } = vi.hoisted(() => {
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });
  const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
  const mockEq = vi.fn(() => ({ limit: mockLimit }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ upsert: mockUpsert, select: mockSelect }));
  return { mockUpsert, mockLimit, mockEq, mockSelect, mockFrom };
});

vi.mock("../supabase", () => ({ supabase: { from: mockFrom } }));
vi.mock("../../data/constants", () => ({ MODEL: "gemini-2.5-flash-lite" }));

import {
  setGroqKey, getGroqKey,
  setGeminiKey, getGeminiKey,
  setEmbedProvider, getEmbedProvider,
  loadUserAISettings,
  _resetForTests,
} from "../aiSettings";

const AUTH_KEY = "sb-test-auth-token";
const USER_ID = "uid-123";

beforeEach(() => {
  localStorage.clear();
  _resetForTests();
  localStorage.setItem(AUTH_KEY, JSON.stringify({ user: { id: USER_ID } }));
  mockFrom.mockClear();
  mockUpsert.mockClear();
  mockSelect.mockClear();
  mockEq.mockClear();
  mockLimit.mockClear();
});

describe("localStorage writes", () => {
  it("setGroqKey stores key", () => { setGroqKey("gsk_test"); expect(getGroqKey()).toBe("gsk_test"); });
  it("setGeminiKey stores key", () => { setGeminiKey("AIza_test"); expect(getGeminiKey()).toBe("AIza_test"); });
  it("setEmbedProvider is a no-op — always google", () => { setEmbedProvider("other"); expect(getEmbedProvider()).toBe("google"); });
});

describe("Supabase upsert on set", () => {
  it("setGroqKey calls upsert with groq_key", () => {
    setGroqKey("gsk_test");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, groq_key: "gsk_test" }),
      { onConflict: "user_id" },
    );
  });

  it("setGeminiKey calls upsert with gemini_key", () => {
    setGeminiKey("AIza_test");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, gemini_key: "AIza_test" }),
      { onConflict: "user_id" },
    );
  });
});

describe("loadUserAISettings", () => {
  it("loads groq and gemini keys into memory", async () => {
    mockLimit.mockResolvedValueOnce({
      data: [{ groq_key: "gsk-loaded", gemini_key: "AIza-loaded", embed_provider: "google" }],
      error: null,
    });
    await loadUserAISettings(USER_ID);
    expect(getGroqKey()).toBe("gsk-loaded");
    expect(getGeminiKey()).toBe("AIza-loaded");
  });
});
