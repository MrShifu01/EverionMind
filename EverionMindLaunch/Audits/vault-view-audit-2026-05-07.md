# Vault View Audit — 2026-05-07

> Vault UI surface only. Crypto path covered by `vault-unlock-audit-2026-05-06.md`. Server enforcement covered by `production-audit-2026-05-06.md`. This audit walks the screens a user sees: setup → recovery-key display → locked → recovery-key entry → PIN setup → PIN unlock → unlocked, plus `SecurityTab` PIN management and the shared `ConfirmDialog`.

## Verdict

**Mostly solid, two real gaps.** State machine is clean (`VaultView.tsx:12` documents all 8 states), `ConfirmDialog` adopted on bulk-delete (`VaultUnlocked.tsx:372`), zero `window.confirm/alert/prompt` in the audited surface, auto-lock wired with persisted timeout, biometric prompt non-blocking + skippable, PIN unlock auto-submits at length 6 (nice mobile UX). Root SVG lock icon is custom, branded with `--ember`/`--ember-wash` tokens.

**The two gaps that block "great":**
1. **F1 — Recovery key has NO "I've saved it" gate.** Single button "I've saved my recovery key" dismisses the only-time-shown key. No checkbox, no second confirm step, no scroll-to-bottom. One mis-tap → key gone forever, vault unrecoverable if passphrase is lost. CLAUDE.md mandates evidence-based UX; the comment says "this key will not be shown again" but the dismissal lets a fat-fingered tap erase it.
2. **F2 — Recovery key copy/print/download incomplete.** Copy: yes (`VaultSetup.tsx:163-170`). Print: **missing**. Download `.txt`: **missing**. For a key the user MUST keep, "copy to clipboard" is the only off-screen path — the user has to paste somewhere (where? phone notes? screenshot? both bad). 1Password and Bitwarden both ship a print/PDF flow.

Five lower-severity findings around PIN length consistency, recovery rotation, error tone, brand-asset absence on vault screens, and the logged-out lock-screen subtitle.

---

## Architecture overview

### Vault state machine

```
        ┌─────────────┐
        │   loading   │  fetch /api/vault → branch on { exists }
        └──────┬──────┘
               │
        exists?─yes──> locked / pin (if PIN flag + record)
               │
               no
               │
               ▼
        ┌─────────────┐
        │    setup    │  passphrase + confirm → setupVault() → POST /api/vault
        └──────┬──────┘
               │
               ▼
        ┌──────────────────┐
        │  show-recovery   │  ONE-TIME display of 25-char recovery key
        └──────┬───────────┘
               │  user clicks "I've saved my recovery key"
               ▼
        ┌──────────────┐
        │   unlocked   │  decryptedSecrets[], reveal/copy/edit/delete
        └──────┬───────┘
               │
   idle 5/15/30/60 min ─── lockVault() ──┐
   manual "Lock" button   ───────────────┤
                                         ▼
        ┌─────────────────────────┐
        │ locked (passphrase) OR  │
        │ pin (if PIN configured) │
        └──────┬──────────────────┘
               │
       wrong passphrase ─> inline error
       "forgot passphrase?" ─> recovery state
               │
               ▼
        ┌──────────────┐
        │   recovery   │  enter XXXX-XXXX-XXXX-XXXX-XXXX
        └──────┬───────┘
               │  decryptVaultKeyFromRecovery(blob, key)
               ▼
   PIN flag on + no PIN record? → pin-setup, else → unlocked

        ┌──────────────┐
        │  pin-setup   │  6-digit PIN (4-8 valid) + biometric checkbox
        └──────────────┘  Skip allowed → keeps passphrase-only flow
```

### File surface

```
src/views/VaultView.tsx         router-by-status (165 lines, dispatches to 7 sub-views)
src/views/VaultLoading.tsx      loading spinner
src/views/VaultSetup.tsx        VaultSetupForm + VaultRecoveryKeyDisplay
src/views/VaultGate.tsx         VaultLockedScreen + VaultRecoveryEntry
src/views/VaultUnlocked.tsx     main unlocked view + add-secret modal + bulk delete
src/components/vault/VaultPinScreen.tsx     PIN entry (subsequent unlocks)
src/components/vault/VaultPinSetup.tsx      first-time PIN + biometric enrolment
src/components/settings/SecurityTab.tsx     settings → set/change/remove PIN (4-digit, separate)
src/components/settings/AppLockSection.tsx  app-wide idle lock toggle, reuses vault PIN
src/components/ConfirmDialog.tsx            shared in-app confirm (used by bulk-delete)
src/hooks/useVaultOps.ts                    state owner + crypto bridge (957 lines)
src/hooks/useVaultLockTimer.ts              dormant auto-lock timer (5/15/30/60 min)
```

---

## UI flow inventory

| State | Component | File | What user sees | Buttons |
|---|---|---|---|---|
| `loading` | `VaultLoading` | `views/VaultLoading.tsx` | spinner | — |
| `setup` | `VaultSetupForm` | `views/VaultSetup.tsx:9-111` | "Set up your Vault" + 🔐 emoji + 2 password fields | Create Vault |
| `show-recovery` | `VaultRecoveryKeyDisplay` | `views/VaultSetup.tsx:113-190` | 🗝 emoji + 25-char key display + red-tinted warning panel | Copy recovery key, "I've saved my recovery key" |
| `locked` | `VaultLockedScreen` | `views/VaultGate.tsx:8-208` | "locked." f-serif + ember halo + secrets count + passphrase input | Unlock, "forgot your passphrase? use recovery key" |
| `recovery` | `VaultRecoveryEntry` | `views/VaultGate.tsx:210-346` | "recovery key." + key-icon SVG + uppercase mono input | Unlock with recovery key, "back to passphrase" |
| `pin-setup` | `VaultPinSetup` | `components/vault/VaultPinSetup.tsx` | "quick unlock setup." + 6-digit PIN field + biometric checkbox | Continue → Confirm → Enable, "skip — keep using passphrase" |
| `pin` | `VaultPinScreen` | `components/vault/VaultPinScreen.tsx` | "enter your PIN." + 6 ember pip dots + hidden input + biometric button | Unlock, "👆 use biometric" (if enrolled), "forgot PIN? use passphrase" |
| `unlocked` | `VaultUnlocked` | `views/VaultUnlocked.tsx` | Vault title + "unlocked · N secrets" + toolbar (Add / Select / Backup / Lock) + secret cards | + Add secret, Select, ↓ Backup, Lock, Reveal/Hide, Copy |

### Settings → Security tab

| Section | Component | File | Behaviour |
|---|---|---|---|
| Vault PIN row | `SecurityTab` | `components/settings/SecurityTab.tsx:114-157` | "Set PIN" / "Change" / "Remove". 4-digit only — see F3 |
| App lock | `AppLockSection` | `components/settings/AppLockSection.tsx` | Reuses vault PIN/biometric; idle 5/15/30/60 min hides whole app |

---

## What's solid

- **`window.confirm/alert/prompt` purged from the audited surface.** Grep across `src/views/Vault*`, `src/components/vault/*`, `src/components/settings/SecurityTab*`, `src/components/ConfirmDialog.tsx`, and `src/hooks/useVaultOps.ts` returns no native dialogs. The single repo hit is a comment in `ProfileTab.tsx:161` ("Replaces window.confirm() with an in-app branded modal"), which proves intent. CLAUDE.md "DESIGN PHILOSOPHY — never use OS-native UI" honoured.
- **`ConfirmDialog` adopted on the only confirm in vault.** `VaultUnlocked.tsx:372-380` wires bulk-delete through `ConfirmDialog` with `danger` styling, custom title and body. `ConfirmDialog.tsx:43-104` uses Radix `AlertDialog` with `--surface-high`, `--ink`, `--ink-soft`, `--lift-3` tokens — pure design-system surface.
- **State machine is router-only.** `VaultView.tsx:78-164` is a flat if-chain over `ops.status`. No nested conditionals. Each branch hands off to a stateless render component. The hook (`useVaultOps`) owns all state. Easy to reason about, easy to test, easy to introduce a 9th state without rewiring.
- **Auto-lock wired and persisted.** `useVaultLockTimer.ts:14-23` reads timeout from `localStorage` key `em_vault_lock_timeout_min`; default 15 min; only accepts the four allowed values (5/15/30/60). `VaultView.tsx:66-76` enables the timer only when `pinFlagEnabled && status === "unlocked"`, bumps on `revealedIds.size` or `decryptedSecrets.length` change. Works.
- **Manual lock button visible.** `VaultUnlocked.tsx:186-188` renders "Lock" in the toolbar alongside Add / Select / Backup. `lockVault` (`useVaultOps.ts:854-862`) wipes passphrase, recovery input, revealed IDs, bulk selection, and clears the in-memory key via `onVaultUnlock(null)`. Clean.
- **PIN unlock auto-submits.** `VaultPinScreen.tsx:40-44` submits as soon as the 6th digit lands. Cuts a tap on mobile. Below 6 digits the explicit Unlock button is the path (≥4 valid).
- **Biometric prompt is non-blocking and skippable.** `VaultPinSetup.tsx:235-244` ships an italic `skip — keep using passphrase` link, disabled while busy. `enableBio` defaults to `true` (`VaultPinSetup.tsx:29`) but the "also enable biometric" checkbox is on the same screen and unchecking is one tap. Setup also gates `bioAvailable` via `isBiometricAvailable()` (`VaultPinSetup.tsx:32-34`) — the checkbox simply doesn't render on devices without WebAuthn PRF, no confusing toggle.
- **Locked-screen passphrase font ≥16px (no iOS zoom).** `VaultGate.tsx:172` sets `fontSize: 16` on the passphrase input. iOS Safari zooms inputs <16px on focus; this clears the threshold.
- **Recovery key uppercase auto-normalisation.** `VaultGate.tsx:299-301` `setRecoveryInput(e.target.value.toUpperCase())` — user can paste mixed-case and submit works.
- **PIN setup font 18px (`VaultPinSetup.tsx:121`) and PIN screen font 18px (`VaultPinScreen.tsx:172`).** Both clear the iOS zoom threshold.
- **PIN screen pip indicator.** `VaultPinScreen.tsx:144-157` six small circles fill ember as digits are typed. The actual `<input>` is offscreen at `left: -9999` (`VaultPinScreen.tsx:177-180`) but still focusable via the wrapper — visual abstraction without breaking iOS keyboard.
- **No leaking onEntryCreated.** `VaultView.tsx:34-38` and `useVaultOps.ts:57-63` both carry SECURITY comments enforcing that vault entries never bubble up to the global memory grid. Self-documenting isolation invariant — exactly the kind of thing a future contributor will want to know before "fixing" the prop surface.
- **Inline error states throughout.** Wrong PIN (`useVaultOps.ts:495`), wrong passphrase (`useVaultOps.ts:419-422`), recovery-key mismatch (`useVaultOps.ts:459, 477`), biometric failure (`useVaultOps.ts:527, 533`) all render through the `error`/`pinError` strings into `--blood`-coloured italic `<p>` elements (`VaultGate.tsx:179-182`, `VaultPinScreen.tsx:184-189`). Zero native alerts.
- **Error messages friendly and actionable.** `useVaultOps.ts:404` runs every setup error through `friendlyError()`. Recovery-fail is "Recovery failed — check your key and try again" not a stack trace. Wrong PIN is "Wrong PIN." not "verifyPin returned false".
- **Asymmetric crypto + envelope encryption per-brain on setup.** `useVaultOps.ts:368-372` generates the keypair at vault setup and wraps the private key with the master KEK before POST. Phase 2 work, but quietly visible in the setup hook.
- **Backup flow has friendly state.** `VaultUnlocked.tsx:78-100` `downloadBackup` flips `backupBusy`, populates `backupNotice` with `"ok"`/`"err"` kind and the entry count, auto-clears after 6s (`VaultUnlocked.tsx:99`). Pointer to `/decrypt.html` for offline read.

---

## Findings

### F1 — Recovery key dismiss has NO "I've saved it" gate (HIGH)

**Severity: HIGH** — single mis-tap erases the only-time-shown recovery key.

`VaultSetup.tsx:185-187`:

```tsx
<Button onClick={onDismiss} size="lg" className="w-full max-w-sm">
  I've saved my recovery key
</Button>
```

`useVaultOps.ts:881-884`:

```ts
const dismissRecoveryKey = () => {
  setGeneratedRecoveryKey("");
  setStatus("unlocked");
};
```

The dismiss is one click. No confirmation checkbox, no second-step "type the last 4 chars to confirm", no `ConfirmDialog`. The button label IS the gate, but a label is not a gate — the user has to actually do something separate from the dismiss for this to count as "I've saved it".

**Why it matters**: this key is the **only** path back into the vault if the user forgets the passphrase. The screen even says so (`VaultSetup.tsx:138-141`: "this key is the **only way** to recover your secrets"). The red-tinted panel at line 178-183 says "Write this down now. This key will not be shown again." But the next button is one accidental finger away from making that warning concrete.

Industry pattern (1Password Emergency Kit, Bitwarden, Apple iCloud Recovery Key): require an EXPLICIT acknowledgement — either:
- A checkbox that must be ticked before the dismiss button enables, OR
- A confirmation modal: "Are you sure? You will not see this key again."

**Fix** (15 min):

Option A (checkbox gate inline):
```tsx
const [acknowledged, setAcknowledged] = useState(false);
// ...
<label style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
  I have saved this recovery key somewhere safe.
</label>
<Button onClick={onDismiss} disabled={!acknowledged} size="lg">Continue</Button>
```

Option B (ConfirmDialog gate):
```tsx
const [confirming, setConfirming] = useState(false);
// ...
<Button onClick={() => setConfirming(true)}>I've saved my recovery key</Button>
{confirming && (
  <ConfirmDialog
    title="Saved your recovery key?"
    body="This is the only time it will be shown. If you lose it, secrets cannot be recovered."
    confirmLabel="Yes, dismiss"
    danger
    onCancel={() => setConfirming(false)}
    onConfirm={onDismiss}
  />
)}
```

A is lighter; B reuses the now-shared ConfirmDialog. Either fixes the gap.

### F2 — Recovery key has copy only; no print, no download (HIGH)

**Severity: HIGH** — UX failure for a "must keep" piece of data.

`VaultSetup.tsx:160-170` ships ONE off-screen path: clipboard copy.

```tsx
<Button variant="outline" size="lg" onClick={() => {
  navigator.clipboard.writeText(recoveryKey);
  setCopied(true);
}}>
  {copied ? "Copied!" : "📋 Copy recovery key"}
</Button>
```

No print button. No `.txt` download. No "save as PDF". No QR code. No "email this to myself". The user's options are: paste into a password manager (good — but assumes they have one), screenshot (bad — phone gallery is synced to cloud, defeats the point), or write it down by hand (fine if you happen to have pen and paper at signup).

Comparison:
- 1Password Emergency Kit: PDF download with the recovery key, master password reminder, and account fingerprint, formatted for printing.
- Bitwarden: shows the recovery code with copy + "Print" button that opens `window.print()` against a dedicated printable view.
- Signal Backup: 30-word phrase displayed; user must re-enter it before continuing (also addresses F1).

**Fix path** (~30 min):
1. Add a "Download as .txt" button next to Copy that triggers a Blob download:
   ```ts
   const blob = new Blob(
     [`Everion Mind — Vault Recovery Key\n\n${recoveryKey}\n\nKeep this safe. Without your passphrase, this key is the only way to recover your encrypted entries.\n`],
     { type: "text/plain" }
   );
   const url = URL.createObjectURL(blob);
   const a = document.createElement("a");
   a.href = url;
   a.download = `everion-recovery-key-${new Date().toISOString().slice(0, 10)}.txt`;
   a.click();
   URL.revokeObjectURL(url);
   ```
2. Add a "Print" button that calls `window.print()` against a print-styled wrapper (CSS `@media print` block hiding everything except the key + branding).
3. Both should set a `downloaded`/`printed` flag that, combined with `copied`, can feed F1's gate (any one of the three sufficient).

### F3 — PIN length inconsistent: vault uses 4-8, Settings uses 4 only (MEDIUM)

**Severity: MEDIUM** — two PIN systems, two different validations, one user.

`components/vault/VaultPinSetup.tsx:12` — `PIN_LENGTH = 6`, `isValidPin()` accepts 4-8 (per `useVaultOps.ts:560`).
`components/settings/SecurityTab.tsx:37, 55, 72` — hardcoded `pin.length !== 4` checks. Setup form, change-verify, change-new, change-confirm all enforce exactly 4.

Two paths to "set a PIN":
- Vault first-unlock → `VaultPinSetup` → 6-digit PIN written via `wrapVaultKeyWithPin` to `vaultPinKey` storage.
- Settings → Security → Vault PIN → `setupPin()` from `lib/pin.ts` → 4-digit hash to a different storage (`getStoredPinHash`).

`AppLockSection.tsx:30` calls `loadPinRecord()` which reads `vaultPinKey` storage (the 6-digit one). `SecurityTab` writes via `setupPin()` to `lib/pin.ts` (the 4-digit one). **These are two separate PIN stores.** A user who sets "Vault PIN" in Settings does not unlock the vault with that PIN — vault unlock reads the other store.

**Verify path**:
- `SecurityTab.tsx:2` imports `getStoredPinHash, verifyPin, setupPin, clearStoredPin` from `lib/pin`.
- `useVaultOps.ts:22-36` imports `loadPinRecord, savePinRecord, ...` from `lib/vaultPinKey`.

Two libraries, two PIN concepts, one "Set PIN" button in settings that does NOT do what the row hint suggests ("A 4-digit PIN is a quick app lock for this device. Your vault encryption still depends on your passphrase." — `SecurityTab.tsx:120`).

**Fix**:
1. Pick one PIN length (recommend 6 — matches the vault setup screen and modern phone PINs). Update both `SecurityTab.tsx` and `VaultPinSetup.tsx` to enforce identically.
2. Pick one PIN store. The `vaultPinKey` store is the right one (it wraps the actual vault key). Delete `lib/pin.ts` and route `SecurityTab` through `useVaultOps` actions.
3. If `lib/pin.ts` is intentionally separate (e.g., for pre-vault app lock that needs to work before vault setup), document that and rename: "App PIN" vs "Vault PIN".

### F4 — Recovery key rotation: no UI path (MEDIUM)

**Severity: MEDIUM** — "I lost my recovery key, can I generate a new one?" → no.

Grep `rotat` and `regenerate` against `src/hooks/useVaultOps.ts`, `src/views/Vault*.tsx`, `src/components/settings/*.tsx`: zero hits. `useVaultOps.ts` exports `dismissRecoveryKey` (one-time, line 881-884) but nothing for "show me a new one".

The crypto layer DOES support it — `encryptVaultKeyForRecovery(key, recoveryKey)` (`crypto.ts`, called at `useVaultOps.ts:364`) takes the current vault key + a new recovery string and returns a new blob. The user just has no way to invoke it.

User scenarios this hurts:
- "I lost my recovery key but I still know my passphrase" → today, they can never generate a new one. If they forget the passphrase next year, their vault is dead.
- "My recovery key was leaked" (e.g., they pasted it into a notes app that got synced to a compromised cloud) → today, no way to invalidate it.

**Fix**: add a `Settings → Security → Vault → "Rotate recovery key"` action. While unlocked (cryptoKey in memory):
1. Generate new `recoveryKey`.
2. `encryptVaultKeyForRecovery(cryptoKey, newRecoveryKey)` → new blob.
3. PATCH `/api/vault` with the new blob.
4. Show the new key on the existing `VaultRecoveryKeyDisplay` screen (now reused for both first-time and rotation).
5. After dismiss → back to settings.

Estimated effort ~1.5h. The rotation flow is the same UI the user already saw at signup.

### F5 — Brand asset (logo / wordmark) absent on vault screens (LOW)

**Severity: LOW** — every vault screen uses an inline SVG lock icon in an ember halo (`VaultGate.tsx:114-127`, `VaultUnlocked.tsx:227-241`, `VaultPinScreen.tsx:110-121`). No `<EverionLogo />`, no `/logoNew.webp`.

Per the user-memory rule `brand-assets-never-substitute`, the logo / wordmark must be canonical wherever shown. Vault screens currently show **no** brand mark at all — the user is in a full-page state with only "Vault" + a generic lock icon. On first vault setup this is fine (the user just came from inside the app and knows where they are). On the locked screen, it's a missed opportunity to reinforce trust ("yes, this is still Everion Mind asking for your passphrase, not a phishing prompt").

**This isn't a swap** — there is no logo to swap. It's an absence. The memory rule covers swaps; the launch case for adding the logo is brand consistency on a high-trust surface.

**Fix** (5 min): import `EverionLogo` from `components/ui/EverionLogo` and place it small (24-32px) in the locked / setup / recovery / pin screen headers, above the f-serif "Vault" title or in the top-bar.

### F6 — Locked screen subtitle leaks count to a logged-out viewer (LOW)

**Severity: LOW** — minor info leak.

`VaultGate.tsx:151-155`:

```tsx
{secretsCount > 0
  ? `${secretsCount} encrypted ${secretsCount === 1 ? "entry" : "entries"}, waiting behind your passphrase.`
  : "enter your passphrase to unlock."}
```

If a passer-by glances at the device while it's on the lock screen, they learn the user has secrets and the count. This is only a concern if the passer-by is a hostile and the user is signed in but has just locked the vault (vault-locked, app-unlocked). The count comes from the authenticated `/api/vault-entries` GET, so a stranger can't trigger this — the legitimate user is already signed in.

Verdict: cosmetic. Either keep it (the count is a legit "you have stuff to protect" reminder) or hide it behind a setting. Note for completeness, not a blocker.

### F7 — `SecurityTab` "PIN removed" path silently destroys app-lock state (LOW)

**Severity: LOW**

`SecurityTab.tsx:92-95`:

```ts
function handleRemove() {
  clearStoredPin();
  reset("PIN removed");
}
```

`clearStoredPin()` (`lib/pin.ts`) wipes the legacy PIN. But `AppLockSection.tsx` is a sibling that depends on `loadPinRecord()` from `vaultPinKey` (different store — see F3). So this remove button does NOT actually disable app lock if app lock is on. Per the F3 confusion, two PIN stores → two states that drift.

Once F3 is fixed (single PIN store), F7 evaporates: removing the PIN here would correctly invalidate `AppLockSection` and the row would re-render to "requires Vault Quick Unlock".

### F8 — `dismissRecoveryKey` does not refresh the toast / tactile feedback after dismiss (LOW)

**Severity: LOW** — UX nit.

`useVaultOps.ts:881-884`: dismiss zeroes the recovery key state and flips status to `"unlocked"`. The user lands in `VaultUnlocked` with zero feedback that "your vault is set up, here's your dashboard". A toast like "Vault ready · 0 secrets" would help orient. Same goes for setup completion in general.

**Fix**: pipe a `setCopyMsg("Vault ready — start adding secrets.")` into `dismissRecoveryKey` so the existing copy-toast surface (`VaultUnlocked.tsx:192-199`) shows on first arrival.

---

## Brand asset cross-check

Per memory rule `brand-assets-never-substitute`: every brand asset on a screen must be canonical (`logoNew.webp`, the existing `EverionLogo` component, etc.).

| Screen | Brand asset present? | Asset used | Verdict |
|---|---|---|---|
| `VaultSetup` (setup form) | No | 🔐 emoji at line 36 | F5 — no swap, just absence |
| `VaultRecoveryKeyDisplay` | No | 🗝 emoji at line 130 | F5 |
| `VaultLockedScreen` | No | inline SVG lock + ember halo | F5 |
| `VaultRecoveryEntry` | No | inline SVG key icon | F5 |
| `VaultPinScreen` | No | inline SVG lock + ember halo | F5 |
| `VaultPinSetup` | No | none — h2 "quick unlock setup." only | F5 |
| `VaultUnlocked` | No | inline SVG lock in empty state | F5 |
| `SecurityTab` | No | settings tab — N/A (lives inside settings shell) | OK |

Zero brand-asset misuse (no swaps, wrong files, off-palette colours). The finding is the absence on the trust-critical setup / locked / recovery surfaces — covered by F5.

---

## Confirm-dialog adoption status

| Confirm trigger | Component | Method |
|---|---|---|
| Bulk-delete vault secrets | `VaultUnlocked.tsx:371-380` | `<ConfirmDialog>` ✅ |
| Add-secret modal close (busy guard) | `VaultUnlocked.tsx:65-69` | inline `if (addBusy) return;` ✅ |
| PIN setup back step | `VaultPinSetup.tsx:222-231` | inline state reset ✅ |
| Lock vault button | `VaultUnlocked.tsx:186-188` | direct `lockVault()` — no confirm needed (re-unlock is one tap) ✅ |
| Recovery key dismiss | `VaultSetup.tsx:185-187` | **no confirm** — see F1 |
| Settings → Remove PIN | `SecurityTab.tsx:148-155, 92-95` | direct `clearStoredPin()` — **no confirm** ⚠ |

Adding a `ConfirmDialog` to "Remove PIN" in `SecurityTab` is also worth considering (a one-tap PIN removal is mild but recoverable — same UX shape as F1, less critical).

---

## Recommendations (priority order)

1. **[HIGH] F1** — gate `dismissRecoveryKey` behind an explicit acknowledgement (checkbox or `ConfirmDialog`). 15 min.
2. **[HIGH] F2** — add Print + Download `.txt` to the recovery-key display. 30 min.
3. **[MEDIUM] F3** — unify PIN stores (`lib/pin.ts` + `lib/vaultPinKey.ts`) into one. Pick 6 digits. ~2h including migration of any existing 4-digit users.
4. **[MEDIUM] F4** — add `Settings → Security → Rotate recovery key`. ~1.5h, reuses existing screens.
5. **[LOW] F5** — add `<EverionLogo size={24} />` to vault setup, locked, recovery, pin screens. 5 min.
6. **[LOW] F6** — decide if locked-screen secrets count is OK to show; add a setting if not. 5 min decision, 20 min if it becomes a setting.
7. **[LOW] F7** — falls out of F3.
8. **[LOW] F8** — toast on first vault unlock. 5 min.

---

## Method

- Read `src/views/VaultView.tsx` end-to-end (165 lines).
- Read `src/views/VaultUnlocked.tsx` end-to-end (767 lines).
- Read `src/views/VaultSetup.tsx` end-to-end (190 lines).
- Read `src/views/VaultGate.tsx` end-to-end (346 lines).
- Read `src/components/vault/VaultPinSetup.tsx` end-to-end (249 lines).
- Read `src/components/vault/VaultPinScreen.tsx` end-to-end (226 lines).
- Read `src/components/settings/SecurityTab.tsx` end-to-end (231 lines).
- Read `src/components/settings/AppLockSection.tsx` end-to-end (106 lines).
- Read `src/components/ConfirmDialog.tsx` end-to-end (105 lines).
- Read `src/hooks/useVaultLockTimer.ts` end-to-end (79 lines).
- Read `src/hooks/useVaultOps.ts` selectively: setup / unlock / recovery / PIN setup / PIN unlock / biometric / lockVault / dismiss / state surface (lines 1-100, 340-415, 450-550, 585-625, 840-957).
- Grepped `window.confirm`, `window.alert`, `window.prompt` against `src/**` — only hit is comment in `ProfileTab.tsx:161`.
- Grepped `confirm(`/`alert(`/`prompt(` against `src/views/` — zero hits.
- Grepped `ConfirmDialog` adoption — wired into `TrashView.tsx`, `VaultUnlocked.tsx`, `ProfileTab.tsx`. Vault bulk-delete confirmed.
- Grepped `recoveryKey|recovery_key|generatedRecoveryKey` — copy implementation at `VaultSetup.tsx:163-170`. No print/download paths found.
- Grepped `logoNew|wordmark` against `src/views/Vault*.tsx` — zero hits, confirming F5.
- Grepped `rotat|regenerate` against vault hook + views — zero rotation path.
- Did not exercise live device. Findings are static-analysis only; iOS / Android visual-zoom check (16px threshold) verified by reading inline `fontSize` values, not measured on hardware.

**Audit kicked off by**: user request "vault-view UI audit" on 2026-05-07.
