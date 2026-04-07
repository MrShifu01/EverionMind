import { describe, it, expect, vi } from "vitest";

describe("applySecurityHeaders", () => {
  function makeRes() {
    return {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
  }

  it("sets X-Content-Type-Options: nosniff", async () => {
    const { applySecurityHeaders } = await import("../../api/_lib/securityHeaders");
    const res = makeRes();
    applySecurityHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
  });

  it("sets X-Frame-Options: DENY", async () => {
    const { applySecurityHeaders } = await import("../../api/_lib/securityHeaders");
    const res = makeRes();
    applySecurityHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
  });

  it("sets Referrer-Policy: strict-origin-when-cross-origin", async () => {
    const { applySecurityHeaders } = await import("../../api/_lib/securityHeaders");
    const res = makeRes();
    applySecurityHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledWith("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  it("sets X-Permitted-Cross-Domain-Policies: none", async () => {
    const { applySecurityHeaders } = await import("../../api/_lib/securityHeaders");
    const res = makeRes();
    applySecurityHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledWith("X-Permitted-Cross-Domain-Policies", "none");
  });

  it("calls setHeader exactly 4 times", async () => {
    const { applySecurityHeaders } = await import("../../api/_lib/securityHeaders");
    const res = makeRes();
    applySecurityHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledTimes(4);
  });
});
