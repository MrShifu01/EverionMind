import crypto from "crypto";

export function verifyCronHmac(header: string, secret: string): boolean {
  const date = new Date().toISOString().slice(0, 10);
  const expected = `HMAC ${crypto.createHmac("sha256", secret).update(date).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Timing-safe comparison for Vercel native cron (which sends Bearer {CRON_SECRET}).
export function verifyCronBearer(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = `Bearer ${secret}`;
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
