// Tests handleAddSecretWithTemplate — asserts that for each of the 6
// templates, the encrypted-metadata input to encryptEntry includes
// template_type plus the structured keys. Mocks encryptEntry + authFetch
// so this stays unit-scope (no real crypto, no network).
//
// Spec: docs/superpowers/specs/2026-05-02-vault-entry-templates-design.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../src/lib/authFetch", () => ({
  authFetch: vi.fn(),
}));

vi.mock("../../src/lib/crypto", () => ({
  setupVault: vi.fn(),
  unlockVault: vi.fn(),
  decryptEntry: vi.fn().mockImplementation(async (e: unknown) => e),
  encryptEntry: vi.fn().mockImplementation(async (e: { metadata?: unknown }) => ({
    ...e,
    content: "ENCRYPTED",
    metadata: typeof e.metadata === "object" ? JSON.stringify(e.metadata) : e.metadata,
  })),
  generateRecoveryKey: vi.fn(),
  encryptVaultKeyForRecovery: vi.fn(),
  decryptVaultKeyFromRecovery: vi.fn(),
}));

vi.mock("../../src/lib/friendlyError", () => ({
  friendlyError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { authFetch } from "../../src/lib/authFetch";
import { encryptEntry } from "../../src/lib/crypto";
import { useVaultOps } from "../../src/hooks/useVaultOps";
import type { TemplateId } from "../../src/lib/vaultTemplates";

const mockAuthFetch = authFetch as ReturnType<typeof vi.fn>;
const mockEncryptEntry = encryptEntry as ReturnType<typeof vi.fn>;

// Stand-in CryptoKey — the mocked encryptEntry doesn't read it, but the
// hook gates on truthiness.
const fakeKey = {} as CryptoKey;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: vault status fetch succeeds with exists:true, then vault
  // entries fetch returns empty array. The hook fires both on mount.
  mockAuthFetch.mockImplementation(async (url: string) => {
    if (url === "/api/vault") {
      return new Response(
        JSON.stringify({ exists: true, salt: "s", verify_token: "v", recovery_blob: "r" }),
        { status: 200 },
      );
    }
    if (url.startsWith("/api/vault-entries")) {
      return new Response("[]", { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
});

const cases: Array<{
  templateId: TemplateId;
  metadataObj: Record<string, string>;
  expectedKeys: string[];
}> = [
  {
    templateId: "password",
    metadataObj: { username: "me@x.com", url: "https://x.com", notes: "hi" },
    expectedKeys: ["template_type", "username", "url", "notes"],
  },
  {
    templateId: "card",
    metadataObj: {
      cardholder: "C Stander",
      expiry: "12/34",
      cvv: "123",
      billing_zip: "0001",
      notes: "main card",
    },
    expectedKeys: ["template_type", "cardholder", "expiry", "cvv", "billing_zip", "notes"],
  },
  {
    templateId: "recovery_code",
    metadataObj: { service_url: "https://github.com", notes: "" },
    expectedKeys: ["template_type", "service_url"],
  },
  {
    templateId: "pin",
    metadataObj: { hint: "alarm panel", notes: "" },
    expectedKeys: ["template_type", "hint"],
  },
  {
    templateId: "seed_phrase",
    metadataObj: { wallet_type: "MetaMask", optional_passphrase: "", notes: "main" },
    expectedKeys: ["template_type", "wallet_type", "notes"],
  },
  {
    templateId: "freeform",
    metadataObj: {},
    expectedKeys: ["template_type"],
  },
];

describe("handleAddSecretWithTemplate", () => {
  for (const c of cases) {
    it(`${c.templateId} → encrypts metadata with template_type + structured keys`, async () => {
      const { result } = renderHook(() =>
        useVaultOps({
          entries: [],
          cryptoKey: fakeKey,
          brainId: "brain-1",
          onVaultUnlock: () => {},
        }),
      );

      // Drain initial vault-status promise so the hook reaches "unlocked".
      await act(async () => {
        await Promise.resolve();
      });

      // Wire authFetch for the POST: succeed with a generated id.
      mockAuthFetch.mockImplementationOnce(
        async () => new Response(JSON.stringify({ id: `id-${c.templateId}` }), { status: 200 }),
      );

      await act(async () => {
        await result.current.handleAddSecretWithTemplate({
          templateId: c.templateId,
          title: `Test ${c.templateId}`,
          content: "the-secret",
          metadataObj: c.metadataObj,
          tags: ["t1"],
        });
      });

      // encryptEntry should have been called with a metadata object
      // containing template_type + the non-empty structured keys.
      const encryptedCalls = mockEncryptEntry.mock.calls;
      expect(encryptedCalls.length).toBeGreaterThan(0);
      const passed = encryptedCalls[encryptedCalls.length - 1][0] as {
        metadata: Record<string, unknown>;
      };
      expect(passed.metadata).toMatchObject({ template_type: c.templateId });
      for (const key of c.expectedKeys) {
        expect(passed.metadata).toHaveProperty(key);
      }
      // Empty/whitespace structured fields must be dropped before encryption.
      for (const [k, v] of Object.entries(c.metadataObj)) {
        if (!v.trim()) {
          expect(passed.metadata).not.toHaveProperty(k);
        }
      }

      // Confirm POST went to the right endpoint with title plaintext.
      const postCall = mockAuthFetch.mock.calls.find(
        (call) =>
          call[0] === "/api/vault-entries" &&
          (call[1] as { method?: string } | undefined)?.method === "POST",
      );
      expect(postCall).toBeTruthy();
    });
  }

  it("blocks save when vault is locked (cryptoKey null)", async () => {
    const { result } = renderHook(() =>
      useVaultOps({ entries: [], cryptoKey: null, brainId: "brain-1", onVaultUnlock: () => {} }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.handleAddSecretWithTemplate({
        templateId: "password",
        title: "x",
        content: "y",
        metadataObj: {},
        tags: [],
      });
    });
    expect(mockEncryptEntry).not.toHaveBeenCalled();
    expect(result.current.addError).toMatch(/locked/i);
  });

  it("blocks save when title or content is empty", async () => {
    const { result } = renderHook(() =>
      useVaultOps({ entries: [], cryptoKey: fakeKey, brainId: "brain-1", onVaultUnlock: () => {} }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.handleAddSecretWithTemplate({
        templateId: "password",
        title: "",
        content: "y",
        metadataObj: {},
        tags: [],
      });
    });
    expect(mockEncryptEntry).not.toHaveBeenCalled();
    expect(result.current.addError).toMatch(/required/i);
  });
});
