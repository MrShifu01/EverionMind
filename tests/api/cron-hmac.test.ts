import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

// Mock web-push to prevent VAPID init errors at module load time
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({}),
  },
}));

// Mock sendPush to avoid real push calls
vi.mock("../../api/_lib/sendPush.js", () => ({
  sendToUser: vi.fn().mockResolvedValue(undefined),
}));

// Helper that replicates the logic to generate expected HMAC for today
function makeHmac(secret: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const expected = crypto.createHmac("sha256", secret).update(date).digest("hex");
  return `HMAC ${expected}`;
}

describe("verifyCronHmac", () => {
  it("returns true for a valid HMAC signature matching today's UTC date", async () => {
    const { verifyCronHmac } = await import("../../api/_lib/cronAuth");
    const secret = "test-secret";
    const header = makeHmac(secret);
    expect(verifyCronHmac(header, secret)).toBe(true);
  });

  it("returns false for a tampered signature", async () => {
    const { verifyCronHmac } = await import("../../api/_lib/cronAuth");
    expect(verifyCronHmac("HMAC tampered123", "test-secret")).toBe(false);
  });

  it("returns false for empty string", async () => {
    const { verifyCronHmac } = await import("../../api/_lib/cronAuth");
    expect(verifyCronHmac("", "test-secret")).toBe(false);
  });

  it("returns false when secret is wrong", async () => {
    const { verifyCronHmac } = await import("../../api/_lib/cronAuth");
    const header = makeHmac("correct-secret");
    expect(verifyCronHmac(header, "wrong-secret")).toBe(false);
  });

  it("is sensitive to date — a signature from yesterday fails", async () => {
    const { verifyCronHmac } = await import("../../api/_lib/cronAuth");
    const secret = "test-secret";
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const oldHmac = crypto.createHmac("sha256", secret).update(yesterday).digest("hex");
    expect(verifyCronHmac(`HMAC ${oldHmac}`, secret)).toBe(false);
  });
});
