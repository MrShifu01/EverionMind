/**
 * Integration tests for /api/vault-entries (rewritten to /api/user-data?resource=vault_entries).
 * Server stores ciphertext only — these tests verify CRUD + user-scoping +
 * input validation, not encryption (which is client-side).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiReq, makeApiRes } from "../helpers/mockApiReq";

process.env.VITE_SUPABASE_URL = "https://mock.supabase.co";
process.env.SUPABASE_URL = "https://mock.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-key";

vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));
vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../api/_lib/securityHeaders.js", () => ({
  applySecurityHeaders: vi.fn(),
}));
vi.mock("../../api/_lib/checkBrainAccess.js", () => ({
  checkBrainAccess: vi.fn().mockResolvedValue({ role: "owner" }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const vaultRows = [
  {
    id: "ve-1",
    title: "API Key",
    content: "v1:iv:cipher",
    metadata: "v1:iv:meta",
    tags: ["auth"],
    brain_id: "brain-1",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  },
  {
    id: "ve-2",
    title: "Recovery Phrase",
    content: "v1:iv2:cipher2",
    metadata: "",
    tags: [],
    brain_id: "brain-1",
    created_at: "2026-04-02T00:00:00Z",
    updated_at: "2026-04-02T00:00:00Z",
  },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe("GET /api/vault-entries", () => {
  it("returns active vault entries scoped to authenticated user", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => vaultRows });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({ method: "GET", query: { resource: "vault_entries", brain_id: "brain-1" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(vaultRows);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/rest/v1/vault_entries");
    expect(url).toContain("user_id=eq.user-1");
    expect(url).toContain("brain_id=eq.brain-1");
    expect(url).toContain("deleted_at=is.null");
  });

  it("returns empty array when user has no vault entries", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({ method: "GET", query: { resource: "vault_entries", brain_id: "brain-1" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("returns 502 on database failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({ method: "GET", query: { resource: "vault_entries", brain_id: "brain-1" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(502);
  });
});

describe("POST /api/vault-entries", () => {
  const validBody = {
    title: "AWS Access Key",
    content: "v1:iv:cipher",
    metadata: "v1:iv:meta",
    tags: ["aws", "prod"],
    brain_id: "brain-1",
  };

  it("creates a vault entry with user_id from auth, returns row", async () => {
    const created = { id: "ve-new", ...validBody };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [created],
      text: async () => "",
    });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "POST",
        query: { resource: "vault_entries" },
        body: validBody,
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(created);

    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.user_id).toBe("user-1");
    expect(sentBody.brain_id).toBe("brain-1");
    expect(sentBody.title).toBe("AWS Access Key");
    expect(sentBody.content).toBe("v1:iv:cipher");
    expect(sentBody.tags).toEqual(["aws", "prod"]);
  });

  it("includes brain_id in payload when supplied", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "x", ...validBody, brain_id: "brain-42" }],
      text: async () => "",
    });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "POST",
        query: { resource: "vault_entries" },
        body: { ...validBody, brain_id: "brain-42" },
      }),
      res,
    );

    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.brain_id).toBe("brain-42");
  });

  it("filters non-string tags out of payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "x" }],
      text: async () => "",
    });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "POST",
        query: { resource: "vault_entries" },
        body: { ...validBody, tags: ["ok", 42, null, "fine"] },
      }),
      res,
    );

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(sentBody.tags).toEqual(["ok", "fine"]);
  });

  it("rejects missing title with 400", async () => {
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "POST",
        query: { resource: "vault_entries" },
        body: { content: "v1:iv:cipher" },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only title with 400", async () => {
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "POST",
        query: { resource: "vault_entries" },
        body: { title: "   ", content: "v1:iv:cipher" },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects non-string content with 400", async () => {
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "POST",
        query: { resource: "vault_entries" },
        body: { title: "x", content: { not: "a string" } },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 502 on database failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "db down",
    });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "POST",
        query: { resource: "vault_entries" },
        body: validBody,
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(502);
  });
});

describe("DELETE /api/vault-entries", () => {
  it("soft-deletes (sets deleted_at) scoped to user_id + id", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [], text: async () => "" });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "DELETE",
        query: { resource: "vault_entries", id: "ve-1" },
        body: {},
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });

    const url = mockFetch.mock.calls[0][0] as string;
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(url).toContain("id=eq.ve-1");
    expect(url).toContain("user_id=eq.user-1");
    expect(init.method).toBe("PATCH");
    const patch = JSON.parse(init.body as string);
    expect(patch.deleted_at).toBeTypeOf("string");
  });

  it("cannot delete another user's entry — server-side user_id filter prevents wrong-user PATCH", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [], text: async () => "" });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "DELETE",
        query: { resource: "vault_entries", id: "ve-belongs-to-user-2" },
        body: {},
      }),
      res,
    );

    // The PATCH URL must scope by both id AND user_id — this is the
    // server-side guard that the user can only nuke their own rows even
    // if they guess someone else's UUID.
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("id=eq.ve-belongs-to-user-2");
    expect(url).toContain("user_id=eq.user-1");
  });

  it("rejects missing id with 400", async () => {
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "DELETE",
        query: { resource: "vault_entries" },
        body: {},
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 502 on database failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "" });
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "DELETE",
        query: { resource: "vault_entries", id: "ve-1" },
        body: {},
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(502);
  });
});

describe("/api/vault-entries auth", () => {
  it("returns 401 when not authenticated", async () => {
    const { verifyAuth } = await import("../../api/_lib/verifyAuth.js");
    vi.mocked(verifyAuth).mockResolvedValueOnce(null);

    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({ method: "GET", query: { resource: "vault_entries", brain_id: "brain-1" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported HTTP method (PUT) with 405", async () => {
    const { default: handler } = await import("../../api/user-data.js");
    const res = makeApiRes();
    await handler(
      makeApiReq({
        method: "PUT",
        query: { resource: "vault_entries" },
        body: {},
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(405);
  });
});
