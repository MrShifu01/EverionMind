/**
 * Application-layer AES-256-GCM encryption for OAuth provider tokens.
 *
 * Originally Gmail-only; now covers Google Calendar and Microsoft Calendar
 * via an optional `namespace` parameter that varies the scrypt salt so each
 * provider's blobs are key-isolated. Default `namespace = "gmail"` preserves
 * compatibility with the original Gmail-only call sites — their encrypted
 * rows decrypt unchanged.
 *
 * Requires env var OAUTH_TOKEN_ENCRYPTION_KEY (or legacy GMAIL_TOKEN_ENCRYPTION_KEY)
 * with a minimum length of 16 chars. If the key is absent, tokens pass
 * through unchanged so existing rows keep working; set the key before
 * deploying to encrypt new writes.
 *
 * Format: `enc:v1:<base64(iv[12] || authTag[16] || ciphertext)>`
 */
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

export type TokenNamespace = "gmail" | "calendar-google" | "calendar-microsoft";

function deriveKey(namespace: TokenNamespace = "gmail"): Buffer | null {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY ?? process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) return null;
  // Original Gmail salt was `"gmail-token-salt"` — keep that exact string for
  // namespace="gmail" so previously-encrypted Gmail rows still decrypt.
  const salt = namespace === "gmail" ? "gmail-token-salt" : `oauth-token-salt:${namespace}`;
  return scryptSync(raw, salt, 32);
}

function requireTokenKey(namespace: TokenNamespace): Buffer | null {
  const key = deriveKey(namespace);
  const productionRuntime = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  if (!key && productionRuntime) {
    throw new Error(
      "OAUTH_TOKEN_ENCRYPTION_KEY or GMAIL_TOKEN_ENCRYPTION_KEY must be configured in production",
    );
  }
  return key;
}

export function encryptToken(plaintext: string, namespace: TokenNamespace = "gmail"): string {
  const key = requireTokenKey(namespace);
  if (!key || !plaintext) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(value: string, namespace: TokenNamespace = "gmail"): string {
  if (!value) return value;
  if (!value.startsWith(PREFIX)) return value; // plaintext (legacy / key not set)
  const key = deriveKey(namespace);
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
