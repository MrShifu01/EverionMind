const CIPHER = "AES-GCM";
const IV_BYTES = 12;
const CIPHERTEXT_PREFIX = "v1:";

// Master KEK usages — needs wrapKey/unwrapKey on top of encrypt/decrypt so
// phase-2 envelope encryption can wrap the user's RSA private key with the
// master KEK. Without wrapKey here, setupVault fails on first call to
// wrapPrivateKey with "Wrapping CryptoKey doesn't support wrapKey operation".
const MASTER_KEY_USAGES: KeyUsage[] = ["encrypt", "decrypt", "wrapKey", "unwrapKey"];

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
    MASTER_KEY_USAGES,
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
export const VAULT_DECRYPT_PLACEHOLDER = "[encrypted — key mismatch or corrupted]";

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

export type VaultRecoveryErrorCode = "format" | "key";

export class VaultRecoveryError extends Error {
  code: VaultRecoveryErrorCode;

  constructor(code: VaultRecoveryErrorCode, message: string) {
    super(message);
    this.name = "VaultRecoveryError";
    this.code = code;
  }
}

export async function decryptVaultKeyFromRecoveryStrict(
  recoveryBlob: string,
  recoveryKey: string,
): Promise<CryptoKey> {
  const firstColon = recoveryBlob.indexOf(":");
  if (firstColon <= 0) {
    throw new VaultRecoveryError("format", "Recovery blob is missing its salt prefix");
  }
  const saltHex = recoveryBlob.slice(0, firstColon);
  const ciphertext = recoveryBlob.slice(firstColon + 1);
  if (!/^[0-9a-f]{32}$/i.test(saltHex) || !isEncrypted(ciphertext)) {
    throw new VaultRecoveryError("format", "Recovery blob is not in the expected format");
  }

  try {
    const saltBytes = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const recoveryAesKey = await deriveKeyFromPassphrase(recoveryKey, saltBytes);
    const rawKeyB64 = await decryptText(ciphertext, recoveryAesKey);
    const rawKeyBytes = Uint8Array.from(atob(rawKeyB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      "raw",
      rawKeyBytes,
      { name: CIPHER, length: 256 },
      true,
      MASTER_KEY_USAGES,
    );
  } catch (err) {
    if (err instanceof VaultRecoveryError) throw err;
    throw new VaultRecoveryError("key", "Recovery key could not decrypt this vault");
  }
}

export async function decryptVaultKeyFromRecovery(
  recoveryBlob: string,
  recoveryKey: string,
): Promise<CryptoKey | null> {
  try {
    return await decryptVaultKeyFromRecoveryStrict(recoveryBlob, recoveryKey);
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
    return await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: CIPHER, length: 256 },
      true,
      MASTER_KEY_USAGES,
    );
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
  if (entry.content === VAULT_DECRYPT_PLACEHOLDER) {
    throw new Error("Refusing to encrypt vault decrypt placeholder");
  }
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
      out.content = VAULT_DECRYPT_PLACEHOLDER;
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

// ── Envelope encryption (per-brain vault, phase 2) ─────────────────────────
//
// Each user has an RSA-OAEP-2048 keypair. The private key is encrypted
// with their master vault KEK and stored in vault_keys.wrapped_private_key;
// the public key is stored in clear (vault_keys.public_key) so other users
// can wrap a brain's DEK for them.
//
// Each shared brain has a random AES-256-GCM data-encryption-key (DEK).
// Every member who has access has a row in brain_vault_grants with the
// DEK encrypted with their own public key. Owner unlocks → KEK → unwrap
// private key → unwrap DEK → decrypt brain's secrets.
//
// Personal-brain secrets stay master-key-encrypted (no DEK overhead) —
// they're never shared and the extra hop adds nothing.

const ASYM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
} as const;
const PRIVATE_KEY_PREFIX = "rsapk:v1:";

export async function generateAsymmetricKeypair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  const pair = await crypto.subtle.generateKey(ASYM, true, ["wrapKey", "unwrapKey"]);
  return { publicKey: pair.publicKey, privateKey: pair.privateKey };
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  // SPKI format → base64. Stored as-is in vault_keys.public_key so other
  // clients can import it without a JWK parse step.
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(spki)));
}

export async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(spkiB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("spki", bytes, ASYM, true, ["wrapKey"]);
}

// Wrap the private key with the user's master KEK (AES-GCM). The output
// is opaque to anyone without the master KEK and small enough to live
// in vault_keys.wrapped_private_key.
export async function wrapPrivateKey(privateKey: CryptoKey, masterKEK: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey("pkcs8", privateKey, masterKEK, {
    name: CIPHER,
    iv,
  });
  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const wrappedB64 = btoa(String.fromCharCode(...new Uint8Array(wrapped)));
  return `${PRIVATE_KEY_PREFIX}${ivHex}:${wrappedB64}`;
}

export async function unwrapPrivateKey(
  wrappedString: string,
  masterKEK: CryptoKey,
): Promise<CryptoKey | null> {
  if (!wrappedString.startsWith(PRIVATE_KEY_PREFIX)) return null;
  const inner = wrappedString.slice(PRIVATE_KEY_PREFIX.length);
  const colonIdx = inner.indexOf(":");
  if (colonIdx === -1) return null;
  const ivHex = inner.slice(0, colonIdx);
  const wrappedB64 = inner.slice(colonIdx + 1);
  const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const wrappedBytes = Uint8Array.from(atob(wrappedB64), (c) => c.charCodeAt(0));
  try {
    return await crypto.subtle.unwrapKey(
      "pkcs8",
      wrappedBytes,
      masterKEK,
      { name: CIPHER, iv },
      ASYM,
      true,
      ["unwrapKey"],
    );
  } catch {
    return null;
  }
}

export async function generateBrainDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: CIPHER, length: 256 }, true, ["encrypt", "decrypt"]);
}

const DEK_PREFIX = "dek:v1:";

export async function wrapDEK(dek: CryptoKey, recipientPublicKey: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey("raw", dek, recipientPublicKey, { name: "RSA-OAEP" });
  return `${DEK_PREFIX}${btoa(String.fromCharCode(...new Uint8Array(wrapped)))}`;
}

export async function unwrapDEK(
  wrappedString: string,
  privateKey: CryptoKey,
): Promise<CryptoKey | null> {
  if (!wrappedString.startsWith(DEK_PREFIX)) return null;
  const wrappedBytes = Uint8Array.from(atob(wrappedString.slice(DEK_PREFIX.length)), (c) =>
    c.charCodeAt(0),
  );
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      wrappedBytes,
      privateKey,
      { name: "RSA-OAEP" },
      { name: CIPHER, length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}
