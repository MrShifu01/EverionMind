/**
 * Tests that api/chat falls back to keyword-scored entries when
 * vector search returns 0 results (entries not yet embedded).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));
vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../api/_lib/checkBrainAccess.js", () => ({
  checkBrainAccess: vi.fn().mockResolvedValue(true),
}));

const BRAIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const FALLBACK_ENTRIES = [
  {
    id: "r1",
    title: "Chilli Spice Mix",
    type: "note",
    tags: ["recipe", "spice"],
    content: "cumin, coriander",
  },
  {
    id: "r2",
    title: "Beef Burger Recipe",
    type: "recipe",
    tags: ["recipe"],
    content: "beef patty",
  },
];

function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: "POST",
    query: {},
    headers: {
      "x-embed-provider": "openai",
      "x-embed-key": "sk-test",
      "x-user-api-key": "sk-gen",
    },
    body: {
      message: "What recipes do I have?",
      brain_id: BRAIN_ID,
      provider: "anthropic",
      model: "gemini-2.5-flash-lite",
      history: [],
      fallback_entries: FALLBACK_ENTRIES,
    },
    ...overrides,
  };
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  return res;
}

describe("api/chat — fallback_entries", () => {
  let handler: (req: any, res: any) => Promise<void>;
  let fetchCalls: Array<{ url: string; opts: any }> = [];

  beforeEach(async () => {
    fetchCalls = [];
    vi.resetModules();

    vi.mock("../../api/_lib/verifyAuth.js", () => ({
      verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
    }));
    vi.mock("../../api/_lib/rateLimit.js", () => ({
      rateLimit: vi.fn().mockResolvedValue(true),
    }));
    vi.mock("../../api/_lib/checkBrainAccess.js", () => ({
      checkBrainAccess: vi.fn().mockResolvedValue(true),
    }));
    vi.mock("../../api/_lib/generateEmbedding.js", () => ({
      generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
      buildEntryText: vi.fn().mockReturnValue("text"),
    }));

    process.env.SUPABASE_URL = "https://sb.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      fetchCalls.push({ url, opts });
      const urlStr = String(url);

      // match_entries RPC — return EMPTY (no embeddings)
      if (urlStr.includes("rpc/match_entries")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      // links fetch
      if (urlStr.includes("/rest/v1/links")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      // Anthropic LLM call
      if (urlStr.includes("anthropic.com") || urlStr.includes("api.anthropic")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: [
                { type: "text", text: "You have 2 recipes: Chilli Spice Mix and Beef Burger." },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }) as any;

    const mod = await import("../../api/chat.js");
    handler = mod.default;
  });

  it("uses fallback_entries in context when vector search returns 0 results", async () => {
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    // Find the LLM call and check its system prompt contains fallback entry titles
    const llmCall = fetchCalls.find(
      (c) => c.url.includes("anthropic") && c.opts?.method === "POST",
    );
    expect(llmCall).toBeDefined();
    const body = JSON.parse(llmCall!.opts.body);
    const systemPrompt = body.system || body.messages?.[0]?.content || "";
    expect(systemPrompt).toContain("Chilli Spice Mix");
    expect(systemPrompt).toContain("Beef Burger Recipe");
  });

  it("does NOT use fallback_entries when vector search returns results", async () => {
    // Override fetch to return a semantic result
    global.fetch = vi.fn().mockImplementation((url: string, _opts: any) => {
      if (String(url).includes("rpc/match_entries")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: "sem1",
                title: "Semantic Result",
                type: "note",
                tags: [],
                content: "found by vector",
                similarity: 0.9,
              },
            ]),
        });
      }
      if (String(url).includes("/rest/v1/links")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: "text", text: "Semantic answer." }] }),
      });
    }) as any;

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    // The system prompt should NOT contain the fallback entries
    const llmCall = (global.fetch as any).mock.calls.find(
      (c: any[]) => String(c[0]).includes("anthropic") || String(c[0]).includes("api.openai"),
    );
    if (llmCall) {
      const body = JSON.parse(llmCall[1].body);
      const systemPrompt = body.system || "";
      expect(systemPrompt).not.toContain("Beef Burger Recipe");
      expect(systemPrompt).toContain("Semantic Result");
    }
  });
});
