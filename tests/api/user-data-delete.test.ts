/**
 * S3-6: Vault export on account deletion.
 * DELETE /api/user-data?resource=account should return vault entries
 * before deleting user data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiReq, makeApiRes } from "../helpers/mockApiReq";

const makeReq = (overrides: any = {}) =>
  makeApiReq({
    method: "DELETE",
    query: { resource: "account" },
    headers: { authorization: "Bearer test-token" },
    body: {},
    ...overrides,
  });
const makeRes = () => makeApiRes();

vi.mock("../../api/_lib/verifyAuth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("../../api/_lib/rateLimit.js", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../api/_lib/securityHeaders.js", () => ({
  applySecurityHeaders: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const vaultEntries = [
  { id: "v1", title: "API Key", content_encrypted: "enc1", tags: [] },
  { id: "v2", title: "Password", content_encrypted: "enc2", tags: ["auth"] },
];

beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
});

describe("DELETE /api/user-data?resource=account (S3-6)", () => {
  it("returns vault entries in response before deletion", async () => {
    // vault_entries fetch → returns entries
    // delete calls → succeed
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => vaultEntries }) // vault entries fetch
      .mockResolvedValue({ ok: true, json: async () => [], text: async () => "" }); // all deletes

    const handler = (await import("../../api/user-data")).default;
    const req = makeReq();
    const res = makeRes();
    await handler(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData.vault_export).toBeDefined();
    expect(responseData.vault_export).toHaveLength(2);
    expect(responseData.deleted).toBe(true);
  });

  it("returns empty vault_export when user has no vault entries", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValue({ ok: true, json: async () => [], text: async () => "" });

    const handler = (await import("../../api/user-data")).default;
    const req = makeReq();
    const res = makeRes();
    await handler(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData.vault_export).toEqual([]);
    expect(responseData.deleted).toBe(true);
  });

  it("requires authentication", async () => {
    const { verifyAuth } = await import("../../api/_lib/verifyAuth.js");
    vi.mocked(verifyAuth).mockResolvedValueOnce(null);

    const handler = (await import("../../api/user-data")).default;
    const req = makeReq();
    const res = makeRes();
    await handler(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
