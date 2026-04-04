/**
 * OpenBrain Client-Side Encryption — AES-256-GCM
 *
 * Architecture:
 *   - Each user gets a device-bound AES-256-GCM CryptoKey stored in IndexedDB.
 *   - The key is non-exportable and never leaves the device.
 *   - Encrypted fields are stored as "v1:<ivHex>:<ciphertextBase64>".
 *   - Passphrase-based key derivation (PBKDF2) is available as an opt-in
 *     alternative for users who want cross-device key portability.
 *
 * Activation:
 *   - Call getOrCreateKey(userId) once on login to prime the key.
 *   - Call encryptText(plaintext, key) before storing sensitive fields.
 *   - Call decryptText(ciphertext, key) after fetching entries.
 *   - Use isEncrypted(str) to detect whether a field is encrypted.
 *
 * Trade-offs (acknowledged in GAPS.md):
 *   - Encrypted entries cannot be embedded or semantically searched server-side.
 *   - RAG/pgvector features are disabled for encrypted entries.
 *   - Mitigate with client-side MiniSearch on decrypted content (future phase).
 *   - Full E2EE (Phase 2): per-brain X25519 keys + brain_keys table.
 */

const DB_NAME = "openbrain-crypto";
const DB_VERSION = 1;
const STORE = "keys";
const CIPHER = "AES-GCM";
const IV_BYTES = 12; // 96-bit IV for AES-GCM
const CIPHERTEXT_PREFIX = "v1:";

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function _openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function _storeKey(userId, cryptoKey) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id: userId, key: cryptoKey });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function _loadKey(userId) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(userId);
    req.onsuccess = () => resolve(req.result?.key ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ─── Key management ───────────────────────────────────────────────────────────

/**
 * Returns the user's device-bound AES-256-GCM CryptoKey.
 * Generates and persists a new key if none exists for this userId.
 *
 * The key is non-extractable — it cannot leave IndexedDB.
 *
 * @param {string} userId
 * @returns {Promise<CryptoKey>}
 */
export async function getOrCreateKey(userId) {
  if (!userId) throw new Error("userId required");

  const existing = await _loadKey(userId);
  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: CIPHER, length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"]
  );
  await _storeKey(userId, key);
  return key;
}

/**
 * Derives a CryptoKey from a passphrase using PBKDF2-SHA256.
 * Use this when the user wants cross-device key portability via a passphrase.
 * The returned key IS extractable (needed for backup/restore).
 *
 * @param {string} passphrase
 * @param {Uint8Array} salt - 16 random bytes; store alongside encrypted data for recovery
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKeyFromPassphrase(passphrase, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },
    keyMaterial,
    { name: CIPHER, length: 256 },
    true, // extractable — needed for passphrase-based backup
    ["encrypt", "decrypt"]
  );
}

/**
 * Generates a fresh 16-byte random salt for PBKDF2 key derivation.
 * @returns {Uint8Array}
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────────────────

/**
 * Encrypts a string with AES-256-GCM.
 *
 * @param {string} plaintext
 * @param {CryptoKey} cryptoKey
 * @returns {Promise<string>} "v1:<ivHex>:<ciphertextBase64>"
 */
export async function encryptText(plaintext, cryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: CIPHER, iv }, cryptoKey, encoded);

  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, "0")).join("");
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuf)));
  return `${CIPHERTEXT_PREFIX}${ivHex}:${cipherB64}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext produced by encryptText.
 *
 * @param {string} encoded - "v1:<ivHex>:<ciphertextBase64>"
 * @param {CryptoKey} cryptoKey
 * @returns {Promise<string>} plaintext
 * @throws if the ciphertext is malformed or the key is wrong
 */
export async function decryptText(encoded, cryptoKey) {
  if (!encoded.startsWith(CIPHERTEXT_PREFIX)) {
    throw new Error("Not an encrypted value");
  }
  const inner = encoded.slice(CIPHERTEXT_PREFIX.length);
  const colonIdx = inner.indexOf(":");
  if (colonIdx === -1) throw new Error("Malformed ciphertext");

  const ivHex = inner.slice(0, colonIdx);
  const cipherB64 = inner.slice(colonIdx + 1);

  const iv = new Uint8Array(ivHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const cipherBuf = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));

  const plainBuf = await crypto.subtle.decrypt({ name: CIPHER, iv }, cryptoKey, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}

/**
 * Returns true if the string looks like an encrypted value from this library.
 * @param {string} str
 * @returns {boolean}
 */
export function isEncrypted(str) {
  return typeof str === "string" && str.startsWith(CIPHERTEXT_PREFIX);
}

// ─── Bulk helpers ─────────────────────────────────────────────────────────────

/**
 * Encrypts the sensitive fields of an entry object in-place.
 * Skips fields that are already encrypted.
 *
 * Fields encrypted: content, metadata (JSON-serialised)
 *
 * @param {{ content?: string, metadata?: object }} entry
 * @param {CryptoKey} cryptoKey
 * @returns {Promise<object>} new entry object with encrypted fields
 */
export async function encryptEntry(entry, cryptoKey) {
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

/**
 * Decrypts the sensitive fields of an entry object in-place.
 * Skips fields that are not encrypted.
 *
 * @param {{ content?: string, metadata?: string|object }} entry
 * @param {CryptoKey} cryptoKey
 * @returns {Promise<object>} new entry object with decrypted fields
 */
export async function decryptEntry(entry, cryptoKey) {
  const out = { ...entry };
  if (isEncrypted(entry.content)) {
    try {
      out.content = await decryptText(entry.content, cryptoKey);
    } catch {
      out.content = "[encrypted — key mismatch or corrupted]";
    }
  }
  if (isEncrypted(entry.metadata)) {
    try {
      out.metadata = JSON.parse(await decryptText(entry.metadata, cryptoKey));
    } catch {
      out.metadata = {};
    }
  }
  return out;
}
