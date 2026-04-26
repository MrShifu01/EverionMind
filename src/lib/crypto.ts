const CIPHER = "AES-GCM";
const IV_BYTES = 12;
const CIPHERTEXT_PREFIX = "v1:";

export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 310_000, hash: "SHA-256" },
    keyMaterial,
    { name: CIPHER, length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function encryptText(plaintext: string, cryptoKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: CIPHER, iv }, cryptoKey, encoded);
  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuf)));
  return `${CIPHERTEXT_PREFIX}${ivHex}:${cipherB64}`;
}

export async function decryptText(encoded: string, cryptoKey: CryptoKey): Promise<string> {
  if (!encoded.startsWith(CIPHERTEXT_PREFIX)) {
    throw new Error("Not an encrypted value");
  }
  const inner = encoded.slice(CIPHERTEXT_PREFIX.length);
  const colonIdx = inner.indexOf(":");
  if (colonIdx === -1) throw new Error("Malformed ciphertext");
  const ivHex = inner.slice(0, colonIdx);
  const cipherB64 = inner.slice(colonIdx + 1);
  const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const cipherBuf = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));
  const plainBuf = await crypto.subtle.decrypt({ name: CIPHER, iv }, cryptoKey, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}

export function isEncrypted(str: unknown): boolean {
  return typeof str === "string" && str.startsWith(CIPHERTEXT_PREFIX);
}

const VAULT_VERIFY_PLAINTEXT = "openbrain-vault-ok";

export async function setupVault(
  passphrase: string,
): Promise<{ key: CryptoKey; salt: string; verifyToken: string }> {
  const saltBytes = generateSalt();
  const key = await deriveKeyFromPassphrase(passphrase, saltBytes);
  const verifyToken = await encryptText(VAULT_VERIFY_PLAINTEXT, key);
  const saltHex = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { key, salt: saltHex, verifyToken };
}

export async function unlockVault(
  passphrase: string,
  saltHex: string,
  verifyToken: string,
): Promise<CryptoKey | null> {
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const key = await deriveKeyFromPassphrase(passphrase, saltBytes);
  try {
    const plain = await decryptText(verifyToken, key);
    if (plain === VAULT_VERIFY_PLAINTEXT) return key;
    return null;
  } catch {
    return null;
  }
}

const RECOVERY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const groups: string[] = [];
  for (let g = 0; g < 5; g++) {
    let chunk = "";
    for (let i = 0; i < 4; i++) {
      chunk += RECOVERY_CHARS[bytes[g * 4 + i] % RECOVERY_CHARS.length];
    }
    groups.push(chunk);
  }
  return groups.join("-");
}

export async function encryptVaultKeyForRecovery(
  vaultKey: CryptoKey,
  recoveryKey: string,
): Promise<string> {
  const rawKey = await crypto.subtle.exportKey("raw", vaultKey);
  const rawKeyB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
  const recoverySalt = generateSalt();
  const recoveryAesKey = await deriveKeyFromPassphrase(recoveryKey, recoverySalt);
  const ciphertext = await encryptText(rawKeyB64, recoveryAesKey);
  const saltHex = Array.from(recoverySalt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${ciphertext}`;
}

export async function decryptVaultKeyFromRecovery(
  recoveryBlob: string,
  recoveryKey: string,
): Promise<CryptoKey | null> {
  try {
    const firstColon = recoveryBlob.indexOf(":");
    const saltHex = recoveryBlob.slice(0, firstColon);
    const ciphertext = recoveryBlob.slice(firstColon + 1);
    const saltBytes = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const recoveryAesKey = await deriveKeyFromPassphrase(recoveryKey, saltBytes);
    const rawKeyB64 = await decryptText(ciphertext, recoveryAesKey);
    const rawKeyBytes = Uint8Array.from(atob(rawKeyB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey("raw", rawKeyBytes, { name: CIPHER, length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    return null;
  }
}

const VAULT_SESSION_KEY = "em_vk_b64";

export async function cacheVaultKey(key: CryptoKey): Promise<void> {
  const raw = await crypto.subtle.exportKey("raw", key);
  sessionStorage.setItem(VAULT_SESSION_KEY, btoa(String.fromCharCode(...new Uint8Array(raw))));
}

export async function getCachedVaultKey(): Promise<CryptoKey | null> {
  const b64 = sessionStorage.getItem(VAULT_SESSION_KEY);
  if (!b64) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey("raw", bytes, { name: CIPHER, length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    return null;
  }
}

export function hasCachedVaultKey(): boolean {
  return !!sessionStorage.getItem(VAULT_SESSION_KEY);
}

interface EncryptableEntry {
  content?: string;
  metadata?: Record<string, unknown> | string;
  [key: string]: unknown;
}

export async function encryptEntry(
  entry: EncryptableEntry,
  cryptoKey: CryptoKey,
): Promise<EncryptableEntry> {
  const out = { ...entry };
  if (entry.content && !isEncrypted(entry.content)) {
    out.content = await encryptText(entry.content, cryptoKey);
  }
  if (entry.metadata && typeof entry.metadata === "object") {
    const metaStr = JSON.stringify(entry.metadata);
    out.metadata = await encryptText(metaStr, cryptoKey);
  }
  return out;
}

export async function decryptEntry(
  entry: EncryptableEntry,
  cryptoKey: CryptoKey,
): Promise<EncryptableEntry> {
  const out = { ...entry };
  if (isEncrypted(entry.content)) {
    try {
      out.content = await decryptText(entry.content as string, cryptoKey);
    } catch {
      out.content = "[encrypted — key mismatch or corrupted]";
    }
  }
  if (isEncrypted(entry.metadata)) {
    try {
      out.metadata = JSON.parse(await decryptText(entry.metadata as string, cryptoKey));
    } catch {
      out.metadata = {};
    }
  }
  return out;
}
