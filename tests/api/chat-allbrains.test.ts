/**
 * Tests for cross-brain ASK search in api/chat.ts
 * When brain_ids (array) is passed instead of brain_id (single),
 * the handler should search each brain and merge results.
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
vi.mock("../../api/_lib/generateEmbedding.js", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  buildEntryText: vi.fn().mockReturnValue("text"),
}));
vi.mock("../../api/_lib/securityHeaders.js", () => ({
  applySecurityHeaders: vi.fn(),
}));

const BRAIN_A = "aaaaaaaa-0000-0000-0000-000000000001";
const BRAIN_B = "aaaaaaaa-0000-0000-0000-000000000002";

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  return res;
}

describe("api/chat — cross-brain (brain_ids)", () => {
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
    vi.mock("../../api/_lib/securityHeaders.js", () => ({
      applySecurityHeaders: vi.fn(),
    }));

    process.env.SUPABASE_URL = "https://sb.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";

    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      fetchCalls.push({ url, opts });
      const u = String(url);
      if (u.includes("rpc/match_entries")) {
        const body = JSON.parse(opts?.body || "{}");
        // Return one result per brain
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: `entry-${body.p_brain_id?.slice(-1)}`,
                title: `Entry from brain ${body.p_brain_id?.slice(-1)}`,
                type: "note",
                tags: [],
                content: "content",
                similarity: 0.8,
              },
            ]),
        });
      }
      if (u.includes("/rest/v1/links"))
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      // LLM call
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: "text", text: "Answer." }] }),
      });
    }) as any;

    const mod = await import("../../api/chat.js");
    handler = mod.default;
  });

  it("calls match_entries once per brain_id", async () => {
    const req = {
      method: "POST",
      query: {},
      headers: { "x-embed-key": "sk", "x-embed-provider": "openai", "x-user-api-key": "sk-gen" },
      body: {
        message: "Recipes?",
        brain_ids: [BRAIN_A, BRAIN_B],
        provider: "anthropic",
        model: "gemini-2.5-flash-lite",
        history: [],
      },
    };
    const res = makeRes();
    await handler(req, res);

    const matchCalls = fetchCalls.filter((c) => c.url.includes("rpc/match_entries"));
    expect(matchCalls).toHaveLength(2);
    const searchedBrains = matchCalls.map((c) => JSON.parse(c.opts.body).p_brain_id);
    expect(searchedBrains).toContain(BRAIN_A);
    expect(searchedBrains).toContain(BRAIN_B);
  });

  it("merges results from all brains into the LLM context", async () => {
    const req = {
      method: "POST",
      query: {},
      headers: { "x-embed-key": "sk", "x-embed-provider": "openai", "x-user-api-key": "sk-gen" },
      body: {
        message: "Recipes?",
        brain_ids: [BRAIN_A, BRAIN_B],
        provider: "anthropic",
        model: "gemini-2.5-flash-lite",
        history: [],
      },
    };
    const res = makeRes();
    await handler(req, res);

    const llmCall = fetchCalls.find((c) => c.url.includes("api.anthropic.com"));
    const body = JSON.parse(llmCall!.opts.body);
    const system: string = body.system;
    // Should contain entries from BOTH brains
    expect(system).toContain(`Entry from brain 1`);
    expect(system).toContain(`Entry from brain 2`);
  });

  it("returns 403 if user is not a member of a requested brain", async () => {
    const { checkBrainAccess } = (await import("../../api/_lib/checkBrainAccess.js")) as any;
    checkBrainAccess.mockImplementation((_userId: string, brainId: string) =>
      brainId === BRAIN_B ? Promise.resolve(false) : Promise.resolve(true),
    );

    const req = {
      method: "POST",
      query: {},
      headers: { "x-embed-key": "sk", "x-embed-provider": "openai", "x-user-api-key": "sk-gen" },
      body: {
        message: "Recipes?",
        brain_ids: [BRAIN_A, BRAIN_B],
        provider: "anthropic",
        model: "gemini-2.5-flash-lite",
        history: [],
      },
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("api/chat — cross-brain fallback (no embeddings)", () => {
  let handler: (req: any, res: any) => Promise<void>;
  let localUrls: string[] = [];

  beforeEach(async () => {
    localUrls = [];
    vi.resetModules();

    process.env.SUPABASE_URL = "https://sb.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";

    global.fetch = vi.fn().mockImplementation((url: any) => {
      localUrls.push(String(url));
      const u = String(url);
      if (u.includes("rpc/match_entries")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (u.includes("/rest/v1/entries") && u.includes("brain_id=eq.")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: "recent-1", title: "Recent entry", type: "note", tags: [], content: "" },
            ]),
        });
      }
      if (u.includes("/rest/v1/links"))
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: "text", text: "Answer." }] }),
      });
    }) as any;

    // Import dependencies first to ensure mock implementations are correctly set up.
    // Test 3 modifies checkBrainAccess.mockImplementation; re-importing after resetModules
    // may reuse the same mock instance, so we explicitly restore correct behavior.
    const { checkBrainAccess } = (await import("../../api/_lib/checkBrainAccess.js")) as any;
    checkBrainAccess.mockResolvedValue(true);
    const { generateEmbedding } = (await import("../../api/_lib/generateEmbedding.js")) as any;
    generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));

    const mod = await import("../../api/chat.js");
    handler = mod.default;
  });

  it("falls back to fetching recent entries from all brains when semantic returns 0", async () => {
    const req = {
      method: "POST",
      query: {},
      headers: { "x-embed-key": "sk", "x-embed-provider": "openai", "x-user-api-key": "sk-gen" },
      body: {
        message: "Recipes?",
        brain_ids: [BRAIN_A, BRAIN_B],
        provider: "anthropic",
        model: "gemini-2.5-flash-lite",
        history: [],
      },
    };
    const res = makeRes();
    await handler(req, res);

    const entryCalls = localUrls.filter(
      (u) => u.includes("/rest/v1/entries") && u.includes("brain_id=eq."),
    );
    expect(entryCalls.length).toBeGreaterThanOrEqual(2);
    expect(entryCalls.some((u) => u.includes(BRAIN_A))).toBe(true);
    expect(entryCalls.some((u) => u.includes(BRAIN_B))).toBe(true);
  });
});
