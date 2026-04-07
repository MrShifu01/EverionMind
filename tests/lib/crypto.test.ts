import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import {
  encryptText,
  decryptText,
  isEncrypted,
  generateSalt,
  deriveKeyFromPassphrase,
  setupVault,
  unlockVault,
  generateRecoveryKey,
  encryptVaultKeyForRecovery,
  decryptVaultKeyFromRecovery,
  encryptEntry,
  decryptEntry,
} from "../../src/lib/crypto";

describe("crypto", () => {
  it("isEncrypted returns false for plain text", () => {
    expect(isEncrypted("hello world")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });

  it("isEncrypted returns true for encrypted format", () => {
    expect(isEncrypted("v1:abc123:data")).toBe(true);
  });

  it("generateSalt returns 16-byte Uint8Array", () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
  });

  it("generateRecoveryKey returns formatted string", () => {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/);
  });

  it("encrypts and decrypts text roundtrip", async () => {
    const salt = generateSalt();
    const key = await deriveKeyFromPassphrase("test-pass", salt);
    const plaintext = "Hello, secret world!";
    const encrypted = await encryptText(plaintext, key);
    expect(isEncrypted(encrypted)).toBe(true);
    const decrypted = await decryptText(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("setupVault and unlockVault roundtrip", async () => {
    const { salt, verifyToken } = await setupVault("mypin");
    const key = await unlockVault("mypin", salt, verifyToken);
    expect(key).not.toBeNull();
    const wrongKey = await unlockVault("wrong", salt, verifyToken);
    expect(wrongKey).toBeNull();
  });

  it("encryptEntry and decryptEntry roundtrip", async () => {
    const salt = generateSalt();
    const key = await deriveKeyFromPassphrase("test", salt);
    const entry = {
      id: "1",
      title: "Secret",
      content: "hidden text",
      type: "secret" as const,
      metadata: { phone: "123" },
    };
    const encrypted = await encryptEntry(entry, key);
    expect(isEncrypted(encrypted.content)).toBe(true);
    expect(isEncrypted(encrypted.metadata as string)).toBe(true);
    const decrypted = await decryptEntry(encrypted, key);
    expect(decrypted.content).toBe("hidden text");
    expect(decrypted.metadata).toEqual({ phone: "123" });
  });

  it("recovery key encrypt/decrypt roundtrip", async () => {
    const { key } = await setupVault("pass123");
    const recoveryKey = generateRecoveryKey();
    const blob = await encryptVaultKeyForRecovery(key, recoveryKey);
    expect(typeof blob).toBe("string");
    const recovered = await decryptVaultKeyFromRecovery(blob, recoveryKey);
    expect(recovered).not.toBeNull();
    // Verify recovered key can decrypt
    const encrypted = await encryptText("test", key);
    const decrypted = await decryptText(encrypted, recovered!);
    expect(decrypted).toBe("test");
  });
});
