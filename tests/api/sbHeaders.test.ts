import { describe, it, expect, beforeEach } from "vitest";

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

describe("sbHeaders", () => {
  it("sbHeaders returns Content-Type + apikey + Authorization", async () => {
    const { sbHeaders } = await import("../../api/_lib/sbHeaders.js");
    const h = sbHeaders();
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["apikey"]).toBe("test-key");
    expect(h["Authorization"]).toBe("Bearer test-key");
  });

  it("sbHeadersNoContent omits Content-Type", async () => {
    const { sbHeadersNoContent } = await import("../../api/_lib/sbHeaders.js");
    const h = sbHeadersNoContent();
    expect(h["Content-Type"]).toBeUndefined();
    expect(h["apikey"]).toBe("test-key");
    expect(h["Authorization"]).toBe("Bearer test-key");
  });

  it("sbHeaders extra fields are merged when supplied", async () => {
    const { sbHeaders } = await import("../../api/_lib/sbHeaders.js");
    const h = sbHeaders({ Prefer: "return=minimal" });
    expect(h["Prefer"]).toBe("return=minimal");
    expect(h["apikey"]).toBe("test-key");
  });
});
