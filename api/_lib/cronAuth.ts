import crypto from "crypto";

export function verifyCronHmac(header: string, secret: string): boolean {
  const date = new Date().toISOString().slice(0, 10);
  const expected = `HMAC ${crypto.createHmac("sha256", secret).update(date).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
