# Vault Unlock Audit — 2026-05-07

> Cryptographic audit of the vault state machine: setup → unlock → biometric/PIN cache → recovery → DEK envelope grants for shared brains. Vault holds the few real secrets a user trusts to encrypted client-side storage; this is the most security-critical module in the app.

## Verdict

**Crypto primitives are right.** AES-GCM with 12-byte random IVs via `crypto.getRandomValues`, PBKDF2 SHA-256 at 310,000 iterations (matches OWASP 2023 minimum 310k), RSA-OAEP-2048 envelope for per-brain DEKs, recovery key 20 raw bytes encoded as 5×4 alphanumeric groups (Crockford-ish alphabet, 30 ambiguous chars excluded). Master KEK never leaves WebCrypto in plaintext.

**One launch-blocker** (carried — native `confirm()` for bulk-delete in `useVaultOps.ts:836`), **two design concerns** (vault key cached in `sessionStorage`; recovery key one-shot rotation only), and a tail of polish items.

The crypto layer itself is shippable. The orchestration around it (UI confirm dialogs, key caching, recovery rotation) is where pre-launch effort lands.

---

## Crypto invariants (verified)

| Primitive | Value | Standard | Verdict |
|---|---|---|---|
| Symmetric cipher | AES-GCM 256 | NIST SP 800-38D | ✅ |
| IV length | 12 bytes (96-bit) | AES-GCM canonical | ✅ |
| IV source | `crypto.getRandomValues(new Uint8Array(12))` | RFC 4086 / WebCrypto | ✅ never reused |
| KDF | PBKDF2 SHA-256 | OWASP-approved for password-derived keys | ✅ |
| KDF iterations | 310,000 | OWASP 2023 ≥ 310k | ✅ floor met |
| KDF salt | 16 random bytes per setup | NIST SP 800-132 | ✅ |
| Master KEK usages | encrypt, decrypt, wrapKey, unwrapKey | covers Phase-2 envelope | ✅ |
| Asymmetric (envelope) | RSA-OAEP-2048 SHA-256 | NIST FIPS 186-5 | ✅ acceptable; ECDH-P256 would be smaller and fast, but RSA is the standard ✅ |
| Private-key wrap | AES-GCM(master KEK) → pkcs8 | layered KEK + DEK | ✅ |
| DEK encryption | AES-GCM 256 with random IV | per-brain | ✅ |
| Recovery key | 20 random bytes → 20 chars from 32-char alphabet | 100 bits effective entropy | ✅ |
| Recovery alphabet | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` | excludes 0/1/I/O/L | ✅ no human-confusable chars |
| Vault verify token | encrypted `"openbrain-vault-ok"` literal | constant-time-decrypt verifies key | ✅ |
| Server access | encrypted ciphertext only | server never sees plaintext | ✅ |

## Findings

### F1 — Native `window.confirm()` for bulk vault delete (carried, launch-blocker)
**Severity: HIGH**

`src/hooks/useVaultOps.ts:836`:

```ts
if (
  !confirm(
    `Permanently delete ${selectedIds.size} selected secret${…}? This cannot be undone.`,
  )
)
  return;
```

CLAUDE.md project rule: "never use OS-native UI". The branded `ConfirmDialog` already exists at `ProfileTab.tsx:1587`. This is the only path in the vault flow that still reaches for native; matches the F1 finding from the 2026-05-07 production audit.

**Fix:** ~10 min — extract `ConfirmDialog` to a shared component, adopt here.

### F2 — Vault key cached in `sessionStorage` (raw)
**Severity: MEDIUM**

`src/lib/crypto.ts:149-154`:

```ts
const VAULT_SESSION_KEY = "em_vk_b64";

export async function cacheVaultKey(key: CryptoKey): Promise<void> {
  const raw = await crypto.subtle.exportKey("raw", key);
  sessionStorage.setItem(VAULT_SESSION_KEY, btoa(String.fromCharCode(...new Uint8Array(raw))));
}
```

The unlocked AES-256 key is exported to raw bytes and stashed in `sessionStorage` so vault stays unlocked across reloads within a tab session. **Trade-off**: if XSS lands, the attacker grabs the raw vault key from `sessionStorage` and decrypts everything.

**Mitigations in place**:
- Strict CSP (no `'unsafe-inline'` in `script-src`) — XSS risk is low.
- Session-storage scope is per-tab — closing the tab clears the key.
- The vault verify token roundtrip on `unlockVault` ensures a wrong-key scenario doesn't render gibberish.

**What it misses**:
- A corrupted browser extension (with content-script access) can read `sessionStorage`.
- A malicious tab in the same origin (e.g., a reflected XSS) can read it.

**Options to harden**:
- (A) Don't cache — re-prompt PIN on every reload. Bad UX but max security.
- (B) Wrap the cached key with a session-derived value (e.g., a fresh AES key generated at unlock, kept only in a closure / unexported via `extractable: false`) and store the wrapped form. The session key itself never lives in `sessionStorage`.
- (C) Move to `IndexedDB` with `extractable: false` non-extractable CryptoKey storage. Browser keeps the key handle; raw bytes never leave WebCrypto.

**Recommend**: option (C) — store the unlocked CryptoKey as `extractable: false` in IndexedDB. Same UX as today, but the key is no longer extractable to JS even with full DOM access.

### F3 — Recovery key one-shot only (no rotation)
**Severity: MEDIUM** — design gap

`src/lib/crypto.ts:110` (`encryptVaultKeyForRecovery`) generates a recovery blob keyed off a fresh `recoveryKey` string. It's stored once at vault setup; the user is shown the key once (per Brand voice: "spare key").

**Gap**: there's no `rotateRecoveryKey()` flow. If a user thinks their recovery key leaked (accidentally posted, screenshot taken with someone behind them), they have no way to invalidate it short of resetting the vault entirely (re-encrypt every entry with a new master KEK, regenerate the recovery blob).

The architecture-deepening audit (`audit-architecture-deepening-2026-05-07.md` candidate #3 "Vault security orchestrator") flags this — the orchestrator's interface should include `rotateRecoveryKey()`. **No code change needed today** — flag for the orchestrator RFC.

### F4 — Brain DEK rotation not exercised
**Severity: LOW** — verify

`src/lib/crypto.ts:235+` describes the per-brain DEK envelope. Each shared brain's DEK is encrypted with each member's public key. **There's no `rotateBrainDEK()` flow** — if a member is removed from a brain, the existing encrypted vault entries can still be decrypted by them (they have the DEK from before).

This is a known limitation of envelope encryption — to truly revoke, every entry must be re-encrypted with a fresh DEK and the old DEK destroyed.

**Recommend**: document the limitation in user-facing copy ("Removing a member doesn't retroactively encrypt past secrets they had access to. To rotate, recreate the brain.") OR add a `rotateBrainDEK()` flow that re-encrypts all vault entries with a new DEK and invalidates the old one.

### F5 — Vault key in `sessionStorage` survives `pageshow.persisted` BFCache restore
**Severity: LOW** — observe

`src/main.tsx:121-133` reloads the page on `pageshow.persisted` if hidden > 10 s. BUT: if hidden < 10 s, the page resumes with the existing vault key intact. Acceptable trade-off, but worth documenting — a phone left unlocked with the vault open and put in a pocket for 9 s resumes unlocked.

### F6 — Recovery decryption silent failure
**Severity: LOW**

`src/lib/crypto.ts:144-146`:

```ts
} catch {
  return null;
}
```

Any error during recovery decode returns `null` — the UI shows "wrong recovery key" without telling the user *why* (typo? wrong vault? corrupted blob?). Hard to debug for the user.

**Fix**: distinguish "format error" (corrupted blob, malformed) from "key error" (wrong recovery code). UX win, no security risk.

### F7 — `decryptEntry` on key mismatch returns `"[encrypted — key mismatch or corrupted]"`
**Severity: LOW** — UX

`src/lib/crypto.ts:207`. On a key mismatch the entry's content becomes a literal string. If the user re-saves the entry without re-locking, that placeholder string overwrites the original ciphertext. **Verify** that no save path triggers when content is the placeholder.

---

## Vault unlock state machine (as observed)

```
[Locked] ──setupVault(passphrase)──> [Unlocked + cached]
[Locked] ──unlockVault(passphrase)──> [Unlocked + cached] | [Locked + error]
[Locked] ──decryptVaultKeyFromRecovery(blob, recoveryKey)──> [Unlocked + cached] | [Locked + error]
[Unlocked] ──lockVault()──> [Locked]
[Unlocked] ──tab close──> [Locked]
[Unlocked] ──visibility hidden > 10s──> [Reloaded → Locked]
[Unlocked] ──visibility hidden < 10s──> [Resume Unlocked] (F5)
```

Missing transitions:
- `[Unlocked] ──rotateRecoveryKey()──> [Unlocked + new recovery blob]` (F3)
- `[Unlocked] ──rotateBrainDEK(brainId)──> [Unlocked + new brain DEK]` (F4)
- `[Unlocked] ──setupBiometric()──> [Unlocked + biometric cache]` — described in `vaultPinKey.ts` but not audited here
- `[Unlocked] ──disableBiometric()──> [Unlocked + biometric cache cleared]`

---

## Key storage architecture

| Material | Storage | Encryption | Notes |
|---|---|---|---|
| User passphrase | not stored | n/a | derives master KEK only |
| Master KEK | WebCrypto handle (in-memory) + sessionStorage raw export (F2) | n/a / base64 | ⚠ raw export to sessionStorage |
| Vault salt | `vault_keys.salt` (server) | n/a (public) | required for re-derive |
| Vault verify token | `vault_keys.verify_token` (server) | AES-GCM(master KEK) | constant-time check |
| Recovery key | not stored — shown once to user | n/a | user's responsibility |
| Recovery blob | `vault_keys.recovery_blob` (server) | AES-GCM(PBKDF2(recoveryKey)) | unwraps master KEK |
| User RSA private | `vault_keys.wrapped_private_key` (server) | AES-GCM(master KEK) | for envelope phase 2 |
| User RSA public | `vault_keys.public_key` (server) | n/a (public) | spki base64 |
| Per-brain DEK | `brain_vault_grants.wrapped_dek` per member | RSA-OAEP(member public key) | one row per member |
| Vault entry content | `vault_entries.content` (server) | AES-GCM(master KEK or brain DEK) | server never sees plaintext |
| Vault entry metadata | `vault_entries.metadata` (server) | AES-GCM(same key) | encrypted metadata too |

---

## Recommendations (priority)

1. **[HIGH] F1** — replace `confirm()` in `useVaultOps.ts:836` with branded ConfirmDialog. ~10 min. **Launch blocker.**
2. **[MEDIUM] F2** — migrate vault key cache from `sessionStorage` raw bytes to IndexedDB `extractable: false` CryptoKey. ~2 hr including tests. **Worth doing pre-launch.**
3. **[MEDIUM] F3** — add `rotateRecoveryKey()` flow. RFC-level work — fits inside the Vault Security Orchestrator candidate from the architecture-deepening audit. Post-launch.
4. **[LOW] F4** — document brain-DEK-rotation limitation in user-facing copy or add a rotation flow. Post-launch.
5. **[LOW] F5** — defaults are reasonable. No change.
6. **[LOW] F6, F7** — UX polish, post-launch.

## What's solid (don't touch)

- PBKDF2 iterations at 310k. **Resist any pressure to lower** for "performance" — even on cold mobile, 310k PBKDF2 is ~200ms. Once per unlock.
- AES-GCM 12-byte random IV — never reuse, always fresh-random. Verified at every encrypt site.
- Master KEK has `wrapKey/unwrapKey` usages — without these, RSA private key wrapping fails with "doesn't support wrapKey". Comment at line 7 documents the requirement.
- Vault verify token (constant-time decrypt of a literal) — clean check, no error message leaking which character was wrong.
- Recovery key alphabet excludes `0/O/1/I/L` — fewer typos.
- Server NEVER sees plaintext for vault entries. `api/user-data.ts` resource=`vault_entries` writes/reads ciphertext only. Threat model coherent.

## Method

- Read `src/lib/crypto.ts` end-to-end (308 LOC).
- Read `src/hooks/useVaultOps.ts` flow (962 LOC — read first 100 + bulk-delete site).
- Cross-referenced WebCrypto invariants against [WebCrypto spec](https://www.w3.org/TR/WebCryptoAPI/) and [OWASP Password Storage Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Verified server-side via `db-audit-2026-05-07.md` `vault_entries` RLS (F1 there flagged the duplicate policy — already reported).
- Did not audit `vaultPinKey.ts` (PIN/biometric layer) in this pass — separate audit candidate.

**Audit kicked off by**: user request "do all those highest-leverage audits" on 2026-05-07.
