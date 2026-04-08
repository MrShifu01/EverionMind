import crypto from "crypto";

export function verifyCronHmac(header: string, secret: string): boolean {
  const date = new Date().toISOString().slice(0, 10);
  const expected = crypto.createHmac("sha256", secret).update(date).digest("hex");
  return header === `HMAC ${expected}`;
}
