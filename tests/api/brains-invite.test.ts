/**
 * Tests for the brain invite flow in api/brains.ts
 * - Token is generated server-side (not relying on pgcrypto DB default)
 * - Email is sent via Resend when RESEND_API_KEY is set
 * - accept action validates 64-char hex token (not UUID)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: "POST",
    query: {},
    headers: {},
    body: {},
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

vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));

const VALID_BRAIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const HEX_64 = "a".repeat(64);

describe("api/brains — invite action", () => {
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

    process.env.SUPABASE_URL = "https://sb.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.APP_URL = "https://app.example.com";

    // Mock global fetch
    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      fetchCalls.push({ url, opts });
      const urlStr = String(url);

      // Brain ownership check
      if (urlStr.includes("/rest/v1/brains?id=eq.") && urlStr.includes("owner_id=eq.")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: VALID_BRAIN_ID, name: "Smash Burger Bar", owner_id: "user-1" }]),
        });
      }
      // Brain invites insert
      if (urlStr.includes("/rest/v1/brain_invites")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: "inv-1", brain_id: VALID_BRAIN_ID, email: "alice@example.com", token: HEX_64, role: "member" },
            ]),
          text: () => Promise.resolve(""),
        });
      }
      // Resend email API
      if (urlStr.includes("api.resend.com")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: "email-1" }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}), text: () => Promise.resolve("") });
    }) as any;

    const mod = await import("../../api/brains.js");
    handler = mod.default;
  });

  it("returns 400 for missing brain_id", async () => {
    const req = makeReq({ query: { action: "invite" }, body: { email: "a@b.com" } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for invalid email format", async () => {
    const req = makeReq({
      query: { action: "invite" },
      body: { brain_id: VALID_BRAIN_ID, email: "not-an-email" },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("includes a hex token in the brain_invites INSERT", async () => {
    const req = makeReq({
      query: { action: "invite" },
      body: { brain_id: VALID_BRAIN_ID, email: "alice@example.com", role: "member" },
    });
    const res = makeRes();
    await handler(req, res);

    const insertCall = fetchCalls.find(
      (c) => c.url.includes("/rest/v1/brain_invites") && c.opts?.method === "POST",
    );
    expect(insertCall).toBeDefined();
    const body = JSON.parse(insertCall!.opts.body);
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sends an email via Resend after creating the invite", async () => {
    const req = makeReq({
      query: { action: "invite" },
      body: { brain_id: VALID_BRAIN_ID, email: "alice@example.com", role: "member" },
    });
    const res = makeRes();
    await handler(req, res);

    const resendCall = fetchCalls.find((c) => c.url.includes("api.resend.com"));
    expect(resendCall).toBeDefined();
    const body = JSON.parse(resendCall!.opts.body);
    expect(body.to).toContain("alice@example.com");
    expect(body.html).toContain(HEX_64);
  });

  it("still returns ok:true even if Resend key is missing", async () => {
    delete process.env.RESEND_API_KEY;
    vi.resetModules();
    vi.mock("../../api/_lib/verifyAuth.js", () => ({
      verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
    }));
    vi.mock("../../api/_lib/rateLimit.js", () => ({
      rateLimit: vi.fn().mockResolvedValue(true),
    }));
    const mod2 = await import("../../api/brains.js");
    const h2 = mod2.default;

    const req = makeReq({
      query: { action: "invite" },
      body: { brain_id: VALID_BRAIN_ID, email: "alice@example.com" },
    });
    const res = makeRes();
    await h2(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});

describe("api/brains — accept action", () => {
  let handler: (req: any, res: any) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock("../../api/_lib/verifyAuth.js", () => ({
      verifyAuth: vi.fn().mockResolvedValue({ id: "user-2" }),
    }));
    vi.mock("../../api/_lib/rateLimit.js", () => ({
      rateLimit: vi.fn().mockResolvedValue(true),
    }));
    process.env.SUPABASE_URL = "https://sb.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes("brain_invites")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: "inv-1", brain_id: VALID_BRAIN_ID, role: "member" },
            ]),
        });
      }
      if (urlStr.includes("brain_members")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }) as any;

    const mod = await import("../../api/brains.js");
    handler = mod.default;
  });

  it("returns 400 for a UUID-format token (should be 64-char hex)", async () => {
    const req = makeReq({
      query: { action: "accept" },
      body: { token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("accepts a valid 64-char hex token", async () => {
    const req = makeReq({
      query: { action: "accept" },
      body: { token: HEX_64 },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it("returns 400 for a token that is too short", async () => {
    const req = makeReq({
      query: { action: "accept" },
      body: { token: "abc123" },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
