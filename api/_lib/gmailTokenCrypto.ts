/**
 * Application-layer AES-256-GCM encryption for Gmail OAuth tokens.
 *
 * Requires env var GMAIL_TOKEN_ENCRYPTION_KEY (any string, min 16 chars).
 * If the key is absent tokens are passed through unchanged so existing
 * rows keep working; set the key before deploying to encrypt new writes.
 *
 * Format: `enc:v1:<base64(iv[12] || authTag[16] || ciphertext)>`
 */
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function deriveKey(): Buffer | null {
  const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) return null;
  return scryptSync(raw, "gmail-token-salt", 32);
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey();
  if (!key || !plaintext) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(value: string): string {
  if (!value) return value;
  if (!value.startsWith(PREFIX)) return value; // plaintext (legacy / key not set)
  const key = deriveKey();
  if (!key) return ""; // key missing — refuse to leak
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
