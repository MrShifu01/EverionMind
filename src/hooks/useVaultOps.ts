import { useState, useEffect, useRef, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import { friendlyError } from "../lib/friendlyError";
import {
  setupVault,
  unlockVault,
  decryptEntry,
  encryptEntry,
  generateRecoveryKey,
  encryptVaultKeyForRecovery,
  decryptVaultKeyFromRecovery,
  generateAsymmetricKeypair,
  exportPublicKey,
  importPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  generateBrainDEK,
  wrapDEK,
  unwrapDEK,
} from "../lib/crypto";
import type { TemplateId } from "../lib/vaultTemplates";
import {
  loadPinRecord,
  savePinRecord,
  clearPinRecord,
  loadBiometricRecord,
  saveBiometricRecord,
  clearBiometricRecord,
  unwrapVaultKeyWithPin,
  wrapVaultKeyWithPin,
  unwrapVaultKeyWithBiometricMaterial,
  wrapVaultKeyWithBiometricMaterial,
  isValidPin,
  type PinRecord,
  type BiometricRecord,
} from "../lib/vaultPinKey";
import { assertBiometric, enrollBiometric, isBiometricAvailable } from "../lib/biometric";
import { isFeatureEnabled, getAdminFlags } from "../lib/featureFlags";
import type { Entry } from "../types";

interface VaultData {
  exists: boolean;
  salt: string;
  verify_token: string;
  recovery_blob: string;
  // Phase 2 fields — null on legacy rows that haven't backfilled the
  // asymmetric keypair yet. Backfill happens silently on next unlock.
  public_key?: string | null;
  wrapped_private_key?: string | null;
}

interface UseVaultOpsOptions {
  entries?: Entry[]; // kept for backward compat (legacy secrets in entries table)
  cryptoKey: CryptoKey | null;
  onVaultUnlock: (key: CryptoKey | null) => void;
  brainId?: string;
  // INTENTIONALLY no onEntryCreated callback. Vault entries must never
  // propagate to the global memory `entries` array — that array is shared
  // by the Memory grid, search, chat retrieval and the brain feed, and
  // any of those leaking a plaintext title would breach the vault's
  // isolation guarantee. Vault state lives entirely inside this hook
  // (vaultEntries + decryptedSecrets); the rest of the app never sees it.
}

export function useVaultOps({
  entries = [],
  cryptoKey,
  onVaultUnlock,
  brainId,
}: UseVaultOpsOptions) {
  const [status, setStatus] = useState("loading");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState("");
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [decryptedSecrets, setDecryptedSecrets] = useState<Entry[]>([]);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const [showAddSecret, setShowAddSecret] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addContent, setAddContent] = useState("");
  const [addTags, setAddTags] = useState("");
  const [addMetaRows, setAddMetaRows] = useState<{ key: string; value: string }[]>([]);
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  // Vault entries from the dedicated vault_entries table
  const [vaultEntries, setVaultEntries] = useState<Entry[]>([]);

  // Phase 2 envelope-encryption state. Lives in refs (not React state)
  // because none of these need to trigger re-renders — they're pure
  // crypto inputs consumed by encrypt/decrypt callbacks. Stored in refs
  // also keeps the keys out of any state-dump telemetry.
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const publicKeyRef = useRef<CryptoKey | null>(null);
  const brainDEKsRef = useRef<Map<string, CryptoKey>>(new Map());

  // PIN + biometric (sub-project 3). Behind feature flag; no-op when off.
  const pinFlagEnabled = isFeatureEnabled("vaultPinBiometric", getAdminFlags());
  const [pinRecord, setPinRecord] = useState<PinRecord | null>(() =>
    pinFlagEnabled ? loadPinRecord() : null,
  );
  const [bioRecord, setBioRecord] = useState<BiometricRecord | null>(() =>
    pinFlagEnabled ? loadBiometricRecord() : null,
  );
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const fetchVaultEntries = useCallback(async () => {
    try {
      const url = brainId
        ? `/api/vault-entries?brain_id=${encodeURIComponent(brainId)}`
        : "/api/vault-entries";
      const r = await authFetch(url);
      if (r.ok) {
        const data: Array<Record<string, unknown>> = await r.json();
        setVaultEntries(data.map((e) => ({ ...e, type: "secret" as const })) as Entry[]);
      }
    } catch (e) {
      console.error("[vault] fetch failed:", e);
    }
  }, [brainId]);

  // Legacy: secrets still in the entries table (before migration)
  const legacySecrets = entries.filter((e: Entry) => e.type === "secret" || e.encrypted === true);

  // Combined — vault_entries takes precedence; legacy fills gap
  const secrets = [
    ...vaultEntries,
    ...legacySecrets.filter((ls) => !vaultEntries.find((ve) => ve.id === ls.id)),
  ];

  useEffect(() => {
    if (cryptoKey) {
      setStatus("unlocked");
      fetchVaultEntries();
      return;
    }
    // Hard timeout so /api/vault hanging doesn't leave the user stuck
    // on "checking the seal…" forever. 6s is past p95 even on slow
    // mobile networks; if we haven't heard back by then, fall through
    // to "setup" — same outcome as a 5xx.
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setStatus("setup");
      }
    }, 6000);
    authFetch("/api/vault")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (!data) {
          setStatus("setup");
          return;
        }
        if (data.exists) {
          setVaultData(data);
          // Prefer PIN/biometric if a wrapper record exists on this device.
          if (pinFlagEnabled && (loadPinRecord() || loadBiometricRecord())) {
            setStatus("pin");
          } else {
            setStatus("locked");
          }
          fetchVaultEntries();
        } else setStatus("setup");
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        setStatus("setup");
      });
    return () => window.clearTimeout(timeoutId);
  }, [cryptoKey, fetchVaultEntries, pinFlagEnabled]);

  useEffect(() => {
    if (status !== "unlocked" || !cryptoKey || secrets.length === 0) {
      setDecryptedSecrets([]);
      return;
    }
    // Phase 2: try the entry's brain DEK first, fall back to the master
    // KEK if no DEK exists (legacy entry, or personal-brain row pre-DEK).
    // decryptEntry never throws — it stamps "[encrypted — key mismatch]"
    // on the content/metadata when the key is wrong, so we detect that
    // sentinel and retry with the alternate key.
    const KEY_MISMATCH = "[encrypted — key mismatch or corrupted]";
    const tryDecrypt = async (entry: Entry): Promise<Entry> => {
      const entryBrainId = (entry as Entry & { brain_id?: string }).brain_id;
      const dek = entryBrainId ? brainDEKsRef.current.get(entryBrainId) : undefined;
      const primary = dek ?? cryptoKey;
      const fallback = dek ? cryptoKey : null;
      let result = (await decryptEntry(entry, primary)) as Entry;
      if (fallback && result.content === KEY_MISMATCH) {
        result = (await decryptEntry(entry, fallback)) as Entry;
      }
      return result;
    };
    Promise.all(secrets.map(tryDecrypt))
      .then((result) => setDecryptedSecrets(result as Entry[]))
      .catch(() => setDecryptedSecrets(secrets));
  }, [status, cryptoKey, secrets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for cross-cutting deletes dispatched from useEntryActions
  // (e.g. DetailModal's delete button). Without this, deleting a vault
  // entry from the modal would hit the API and update useDataLayer's
  // entries / vaultEntries — but the visible Vault grid reads from this
  // hook's local copy, so the row would linger until the next refresh.
  useEffect(() => {
    function onEntryDeleted(ev: Event) {
      const detail = (ev as CustomEvent).detail as { id?: string; type?: string } | undefined;
      const id = detail?.id;
      if (!id) return;
      setVaultEntries((prev) => prev.filter((e) => e.id !== id));
      setDecryptedSecrets((prev) => prev.filter((e) => e.id !== id));
    }
    window.addEventListener("everion:entry-deleted", onEntryDeleted);
    return () => window.removeEventListener("everion:entry-deleted", onEntryDeleted);
  }, []);

  useEffect(() => {
    if (["setup", "locked", "recovery"].includes(status)) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [status]);

  // ── Phase 2 helpers (envelope encryption) ────────────────────────────────

  // After the master KEK is in hand, make sure the user's asymmetric
  // keypair is loaded into refs. New users have a keypair from setup;
  // pre-phase-2 users get one generated and PATCHed back in place on
  // first unlock.
  const ensureKeypair = useCallback(async (masterKEK: CryptoKey, vaultRecord: VaultData | null) => {
    if (vaultRecord?.public_key && vaultRecord.wrapped_private_key) {
      const priv = await unwrapPrivateKey(vaultRecord.wrapped_private_key, masterKEK);
      const pub = await importPublicKey(vaultRecord.public_key);
      if (priv) {
        privateKeyRef.current = priv;
        publicKeyRef.current = pub;
        return;
      }
      // Fall through to backfill path on unwrap failure (corrupted row).
    }
    // Backfill: generate a fresh keypair, wrap private with master KEK,
    // PATCH the vault row in place. Done lazily so existing users
    // don't need to re-set-up; the next unlock just becomes phase-2
    // capable.
    const pair = await generateAsymmetricKeypair();
    const publicSpki = await exportPublicKey(pair.publicKey);
    const wrappedPriv = await wrapPrivateKey(pair.privateKey, masterKEK);
    privateKeyRef.current = pair.privateKey;
    publicKeyRef.current = pair.publicKey;
    try {
      await authFetch("/api/vault", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: publicSpki,
          wrapped_private_key: wrappedPriv,
        }),
      });
    } catch (e) {
      console.error("[vault] backfill keypair PATCH failed", e);
    }
  }, []);

  // After the keypair is ready, fetch every brain_vault_grant for this
  // user and unwrap each wrapped DEK into the brainDEKs map. This is
  // the read-side of "owner of family brain has wrapped the family DEK
  // for me; let me unwrap it so I can decrypt family-brain secrets".
  const loadBrainDEKs = useCallback(async () => {
    const priv = privateKeyRef.current;
    if (!priv) return;
    try {
      const r = await authFetch("/api/brain-vault-grants");
      if (!r.ok) return;
      const grants: Array<{ brain_id: string; wrapped_dek: string }> = await r.json();
      const next = new Map<string, CryptoKey>();
      for (const g of grants) {
        try {
          const dek = await unwrapDEK(g.wrapped_dek, priv);
          if (dek) next.set(g.brain_id, dek);
        } catch (e) {
          console.error("[vault] unwrapDEK failed for brain", g.brain_id, e);
        }
      }
      brainDEKsRef.current = next;
    } catch (e) {
      console.error("[vault] loadBrainDEKs failed", e);
    }
  }, []);

  // Make sure the active brain has a DEK we can use to encrypt new
  // secrets. If we don't have one yet (first secret in this brain),
  // mint a fresh DEK, wrap with our own public key, POST a grant for
  // ourselves, and cache.
  const ensureBrainDEK = useCallback(async (targetBrainId: string): Promise<CryptoKey | null> => {
    const existing = brainDEKsRef.current.get(targetBrainId);
    if (existing) return existing;
    const pub = publicKeyRef.current;
    if (!pub) return null;
    const dek = await generateBrainDEK();
    const wrapped = await wrapDEK(dek, pub);
    // Need our own user_id for the grant row. Pull it from the vault
    // row response indirectly: the API enforces "owner only" for
    // grant inserts, so we send our user_id; the server validates
    // ownership and inserts.
    const me = await authFetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => (p?.id as string | undefined) ?? null)
      .catch(() => null);
    if (!me) {
      console.error("[vault] ensureBrainDEK: cannot resolve user id");
      return null;
    }
    try {
      const r = await authFetch("/api/brain-vault-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brain_id: targetBrainId,
          user_id: me,
          wrapped_dek: wrapped,
        }),
      });
      if (!r.ok) {
        console.error("[vault] grant POST failed", r.status);
        return null;
      }
    } catch (e) {
      console.error("[vault] grant POST threw", e);
      return null;
    }
    brainDEKsRef.current.set(targetBrainId, dek);
    return dek;
  }, []);

  const handleSetup = useCallback(async () => {
    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters");
      return;
    }
    if (passphrase !== confirmPhrase) {
      setError("Passphrases don't match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { key, salt, verifyToken } = await setupVault(passphrase);
      const recoveryKey = generateRecoveryKey();
      const recoveryBlob = await encryptVaultKeyForRecovery(key, recoveryKey);
      // Phase 2: generate the user's asymmetric keypair at setup time.
      // Public is stored in clear (for other users to wrap DEKs for us);
      // private is wrapped with the master KEK we just derived.
      const pair = await generateAsymmetricKeypair();
      const publicSpki = await exportPublicKey(pair.publicKey);
      const wrappedPriv = await wrapPrivateKey(pair.privateKey, key);
      privateKeyRef.current = pair.privateKey;
      publicKeyRef.current = pair.publicKey;
      // Hard 30s timeout on the POST. Without it, a Vercel cold start that
      // overruns or a stalled DB connection leaves the button frozen on
      // "Setting up…" with no feedback. AbortController.signal hooked up
      // so the fetch rejects rather than hanging the promise indefinitely.
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 30_000);
      let res: Response;
      try {
        res = await authFetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            salt,
            verify_token: verifyToken,
            recovery_blob: recoveryBlob,
            public_key: publicSpki,
            wrapped_private_key: wrappedPriv,
          }),
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setGeneratedRecoveryKey(recoveryKey);
      onVaultUnlock(key);
      setStatus("show-recovery");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      // finally so a bug in any of the awaits above (or in the setStatus /
      // onVaultUnlock callbacks) can never leave the button stuck on
      // "Setting up…" forever.
      setBusy(false);
    }
  }, [passphrase, confirmPhrase, onVaultUnlock]);

  const handleUnlock = useCallback(async () => {
    if (!passphrase.trim()) return;
    setBusy(true);
    setError("");
    try {
      const key = await unlockVault(passphrase, vaultData!.salt, vaultData!.verify_token);
      if (!key) {
        setError("Wrong passphrase");
        setBusy(false);
        return;
      }
      // Phase 2 envelope state is best-effort. If the keypair backfill
      // PATCH 4xxs against an unmigrated DB, or importPublicKey throws on a
      // stored SPKI that's gone bad, the user can still read their
      // personal-brain (master-KEK encrypted) secrets — they just can't
      // decrypt shared-brain secrets until the keypair is sorted out. Don't
      // let it throw past this boundary or unlock fails wholesale.
      try {
        await ensureKeypair(key, vaultData);
        await loadBrainDEKs();
      } catch (err) {
        console.error("[vault] phase-2 setup failed (non-fatal)", err);
      }
      onVaultUnlock(key);
      // If the PIN/biometric flag is on AND this device has no PIN record
      // yet, route to the one-time PIN setup screen so the next unlock
      // doesn't have to re-derive from the passphrase.
      if (pinFlagEnabled && !loadPinRecord()) {
        setStatus("pin-setup");
      } else {
        setStatus("unlocked");
      }
    } catch {
      setError("Decryption failed");
    }
    setBusy(false);
  }, [passphrase, vaultData, onVaultUnlock, pinFlagEnabled, ensureKeypair, loadBrainDEKs]);

  const handleRecoveryUnlock = useCallback(async () => {
    const cleaned = recoveryInput.trim().toUpperCase();
    if (!cleaned) return;
    setBusy(true);
    setError("");
    try {
      const key = await decryptVaultKeyFromRecovery(vaultData!.recovery_blob, cleaned);
      if (!key) {
        setError("Invalid recovery key");
        setBusy(false);
        return;
      }
      // Phase 2 envelope state — best-effort, see handleUnlock comment.
      try {
        await ensureKeypair(key, vaultData);
        await loadBrainDEKs();
      } catch (err) {
        console.error("[vault] phase-2 setup failed (non-fatal)", err);
      }
      onVaultUnlock(key);
      if (pinFlagEnabled && !loadPinRecord()) {
        setStatus("pin-setup");
      } else {
        setStatus("unlocked");
      }
    } catch {
      setError("Recovery failed — check your key and try again");
    }
    setBusy(false);
  }, [recoveryInput, vaultData, onVaultUnlock, pinFlagEnabled, ensureKeypair, loadBrainDEKs]);

  // ── PIN + biometric (sub-project 3) ──

  const handlePinUnlock = useCallback(
    async (enteredPin: string) => {
      const record = loadPinRecord();
      if (!record) {
        setPinError("No PIN configured on this device.");
        return;
      }
      setPinBusy(true);
      setPinError("");
      const key = await unwrapVaultKeyWithPin(record, enteredPin);
      if (!key) {
        setPinError("Wrong PIN.");
        setPinBusy(false);
        return;
      }
      // Phase 2: PIN unlock skips the passphrase derivation but still
      // needs the asymmetric keypair + DEKs in memory to read shared
      // brain secrets. vaultData is loaded by the time PIN unlock fires.
      // Best-effort — see handleUnlock comment.
      try {
        await ensureKeypair(key, vaultData);
        await loadBrainDEKs();
      } catch (err) {
        console.error("[vault] phase-2 setup failed (non-fatal)", err);
      }
      onVaultUnlock(key);
      setStatus("unlocked");
      setPin("");
      setPinBusy(false);
    },
    [onVaultUnlock, vaultData, ensureKeypair, loadBrainDEKs],
  );

  const handleBiometricUnlock = useCallback(async () => {
    const bio = loadBiometricRecord();
    if (!bio) {
      setPinError("No biometric configured on this device.");
      return;
    }
    setPinBusy(true);
    setPinError("");
    const assertion = await assertBiometric(bio.credential_id_b64);
    if (!assertion?.prfOutput) {
      setPinError("Biometric unlock failed — try PIN.");
      setPinBusy(false);
      return;
    }
    const key = await unwrapVaultKeyWithBiometricMaterial(bio, assertion.prfOutput);
    if (!key) {
      setPinError("Biometric unlock failed — wrong credential?");
      setPinBusy(false);
      return;
    }
    // Phase 2 envelope state — best-effort, same as PIN unlock.
    try {
      await ensureKeypair(key, vaultData);
      await loadBrainDEKs();
    } catch (err) {
      console.error("[vault] phase-2 setup failed (non-fatal)", err);
    }
    onVaultUnlock(key);
    setStatus("unlocked");
    setPinBusy(false);
  }, [onVaultUnlock, vaultData, ensureKeypair, loadBrainDEKs]);

  const handlePinSetup = useCallback(
    async (
      params: { pin: string; enableBiometric: boolean },
      userId?: string,
      userEmail?: string,
    ) => {
      if (!cryptoKey) {
        setPinError("Vault is locked — re-enter passphrase first.");
        return;
      }
      if (!isValidPin(params.pin)) {
        setPinError("PIN must be 4–8 digits.");
        return;
      }
      setPinBusy(true);
      setPinError("");
      try {
        const pinRec = await wrapVaultKeyWithPin(cryptoKey, params.pin);
        savePinRecord(pinRec);
        setPinRecord(pinRec);

        if (params.enableBiometric && (await isBiometricAvailable()) && userId) {
          const enrollment = await enrollBiometric(userId, userEmail || userId);
          if (enrollment?.prfSupported && enrollment.prfOutput.byteLength >= 32) {
            const bioRec = await wrapVaultKeyWithBiometricMaterial(
              cryptoKey,
              enrollment.prfOutput,
              enrollment.credentialIdB64,
            );
            saveBiometricRecord(bioRec);
            setBioRecord(bioRec);
          }
        }
        setStatus("unlocked");
      } catch (e) {
        setPinError(e instanceof Error ? e.message : "Setup failed");
      }
      setPinBusy(false);
    },
    [cryptoKey],
  );

  const skipPinSetup = useCallback(() => {
    setStatus("unlocked");
  }, []);

  const goToPassphraseFromPin = useCallback(() => {
    setPin("");
    setPinError("");
    setStatus("locked");
  }, []);

  const removePinAndBiometric = useCallback(() => {
    clearPinRecord();
    clearBiometricRecord();
    setPinRecord(null);
    setBioRecord(null);
  }, []);

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyToClipboard = (text: string, label?: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg(label || "Copied");
      setTimeout(() => setCopyMsg(null), 2000);
    });
  };

  const resetAddForm = () => {
    setAddTitle("");
    setAddContent("");
    setAddTags("");
    setAddMetaRows([]);
    setAddError("");
  };

  const handleAddSecret = useCallback(async () => {
    if (!cryptoKey) {
      setAddError("Vault is locked");
      return;
    }
    // SECURITY: refuse to save a secret without a brain_id. A NULL-brain
    // row leaks across all brains because the memory grid's brain filter
    // can't tell where it belongs. We'd rather block the save than orphan
    // a secret in a state that breaches isolation.
    if (!brainId) {
      setAddError("No active brain — cannot save secret");
      return;
    }
    if (!addTitle.trim() || !addContent.trim()) {
      setAddError("Title and content are required");
      return;
    }
    setAddBusy(true);
    setAddError("");
    try {
      const tagList = addTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const metadata: Record<string, string> = {};
      for (const row of addMetaRows) {
        const k = row.key.trim();
        const v = row.value.trim();
        if (k && v) metadata[k] = v;
      }
      const plain = {
        title: addTitle.trim(),
        content: addContent,
        type: "secret" as const,
        tags: tagList,
        metadata,
      };
      // Phase 2: when adding to a brain, encrypt with that brain's DEK
      // (envelope encryption). Falls back to the master KEK if the DEK
      // path fails — keeps brain-less or pre-keypair flows working.
      let encryptionKey: CryptoKey = cryptoKey;
      if (brainId) {
        const dek = await ensureBrainDEK(brainId);
        if (dek) encryptionKey = dek;
      }
      const encrypted = await encryptEntry(plain, encryptionKey);
      const res = await authFetch("/api/vault-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: plain.title,
          content: encrypted.content,
          metadata: typeof encrypted.metadata === "string" ? encrypted.metadata : "",
          tags: tagList,
          ...(brainId ? { brain_id: brainId } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const result = await res.json().catch(() => null);
      const newId = result?.id || Date.now().toString();
      const newEntry: Entry = {
        id: newId,
        title: plain.title,
        content: plain.content,
        type: "secret",
        tags: tagList,
        metadata,
        ...(brainId ? { brain_id: brainId } : {}),
      } as Entry;
      // Mirror the server row into vaultEntries (encrypted, source of
      // truth) so the next render's `secrets` array includes it.
      const encryptedEntry: Entry = {
        id: newId,
        title: plain.title,
        content: encrypted.content,
        type: "secret",
        tags: tagList,
        metadata: typeof encrypted.metadata === "string" ? encrypted.metadata : metadata,
        ...(brainId ? { brain_id: brainId } : {}),
      } as Entry;
      setVaultEntries((prev) => [encryptedEntry, ...prev]);
      setDecryptedSecrets((prev) => [newEntry, ...prev]);
      // Tell the data layer (which owns the vaultEntries the Memory grid
      // reads) about the new row. Carries the encrypted shape with brain_id
      // so the memory grid's brain filter scopes it to the right brain. Do
      // NOT propagate the plaintext newEntry — global entries state must
      // never see decrypted secrets.
      window.dispatchEvent(
        new CustomEvent("everion:vault-entry-added", { detail: encryptedEntry }),
      );
      resetAddForm();
      setShowAddSecret(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to save secret");
    }
    setAddBusy(false);
  }, [addTitle, addContent, addTags, addMetaRows, cryptoKey, brainId, ensureBrainDEK]);

  // New path: template-shaped add. Coexists with handleAddSecret (legacy
  // free-form path) so flag-off keeps working unchanged. Spec:
  // docs/superpowers/specs/2026-05-02-vault-entry-templates-design.md
  const handleAddSecretWithTemplate = useCallback(
    async (payload: {
      templateId: TemplateId;
      title: string;
      content: string;
      metadataObj: Record<string, string>;
      tags: string[];
    }) => {
      if (!cryptoKey) {
        setAddError("Vault is locked");
        return;
      }
      // See handleAddSecret comment — brain_id is mandatory.
      if (!brainId) {
        setAddError("No active brain — cannot save secret");
        return;
      }
      if (!payload.title.trim() || !payload.content.trim()) {
        setAddError("Title and content are required");
        return;
      }
      setAddBusy(true);
      setAddError("");
      try {
        const metadata: Record<string, string> = {
          template_type: payload.templateId,
        };
        for (const [k, v] of Object.entries(payload.metadataObj)) {
          if (v && v.trim()) metadata[k] = v;
        }
        const plain = {
          title: payload.title.trim(),
          content: payload.content,
          type: "secret" as const,
          tags: payload.tags,
          metadata,
        };
        // Phase 2 envelope encryption — see handleAddSecret comment.
        let encryptionKey: CryptoKey = cryptoKey;
        if (brainId) {
          const dek = await ensureBrainDEK(brainId);
          if (dek) encryptionKey = dek;
        }
        const encrypted = await encryptEntry(plain, encryptionKey);
        const res = await authFetch("/api/vault-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: plain.title,
            content: encrypted.content,
            metadata: typeof encrypted.metadata === "string" ? encrypted.metadata : "",
            tags: payload.tags,
            ...(brainId ? { brain_id: brainId } : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        const result = await res.json().catch(() => null);
        const newId = result?.id || Date.now().toString();
        const newEntry: Entry = {
          id: newId,
          title: plain.title,
          content: plain.content,
          type: "secret",
          tags: payload.tags,
          metadata,
          ...(brainId ? { brain_id: brainId } : {}),
        } as Entry;
        // Mirror into vaultEntries so source of truth + decrypted view
        // stay in sync — see handleAddSecret comment.
        const encryptedEntry: Entry = {
          id: newId,
          title: plain.title,
          content: encrypted.content,
          type: "secret",
          tags: payload.tags,
          metadata: typeof encrypted.metadata === "string" ? encrypted.metadata : metadata,
          ...(brainId ? { brain_id: brainId } : {}),
        } as Entry;
        setVaultEntries((prev) => [encryptedEntry, ...prev]);
        setDecryptedSecrets((prev) => [newEntry, ...prev]);
        // See handleAddSecret comment — propagate the encrypted shape
        // (with brain_id) to the data layer; never the plaintext.
        window.dispatchEvent(
          new CustomEvent("everion:vault-entry-added", { detail: encryptedEntry }),
        );
        resetAddForm();
        setShowAddSecret(false);
      } catch (e) {
        setAddError(e instanceof Error ? e.message : "Failed to save secret");
      }
      setAddBusy(false);
    },
    [cryptoKey, brainId, ensureBrainDEK],
  );

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const legacyIds = new Set(legacySecrets.map((e) => e.id));
    for (const id of ids) {
      // Delete from appropriate table based on origin
      const endpoint = legacyIds.has(id) ? `/api/entries?id=${id}` : `/api/vault-entries?id=${id}`;
      const res = await authFetch(endpoint, { method: "DELETE" }).catch(() => null);
      if (res?.ok) {
        setDecryptedSecrets((prev) => prev.filter((e) => e.id !== id));
        setVaultEntries((prev) => prev.filter((e) => e.id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
    setBulkMode(false);
  }, [selectedIds, legacySecrets]);

  const lockVault = () => {
    setStatus("locked");
    setPassphrase("");
    setRecoveryInput("");
    setRevealedIds(new Set());
    setBulkMode(false);
    setSelectedIds(new Set());
    onVaultUnlock(null);
  };

  const startAddSecret = () => {
    resetAddForm();
    setShowAddSecret(true);
  };

  const goToRecovery = () => {
    setError("");
    setRecoveryInput("");
    setStatus("recovery");
  };

  const backToPassphrase = () => {
    setError("");
    setPassphrase("");
    setStatus("locked");
  };

  const dismissRecoveryKey = () => {
    setGeneratedRecoveryKey("");
    setStatus("unlocked");
  };

  return {
    // state
    status,
    setStatus,
    passphrase,
    setPassphrase,
    confirmPhrase,
    setConfirmPhrase,
    recoveryInput,
    setRecoveryInput,
    error,
    setError,
    busy,
    vaultData,
    generatedRecoveryKey,
    recoveryCopied,
    setRecoveryCopied,
    decryptedSecrets,
    revealedIds,
    copyMsg,
    bulkMode,
    setBulkMode,
    selectedIds,
    setSelectedIds,
    inputRef,
    showAddSecret,
    setShowAddSecret,
    addTitle,
    setAddTitle,
    addContent,
    setAddContent,
    addTags,
    setAddTags,
    addMetaRows,
    setAddMetaRows,
    addError,
    setAddError,
    addBusy,
    secrets,
    // handlers
    handleSetup,
    handleUnlock,
    handleRecoveryUnlock,
    handleAddSecret,
    handleAddSecretWithTemplate,
    bulkDelete,
    // PIN + biometric (sub-project 3)
    pinFlagEnabled,
    pinRecord,
    bioRecord,
    pin,
    setPin,
    pinError,
    pinBusy,
    handlePinUnlock,
    handleBiometricUnlock,
    handlePinSetup,
    skipPinSetup,
    goToPassphraseFromPin,
    removePinAndBiometric,
    toggleReveal,
    copyToClipboard,
    resetAddForm,
    lockVault,
    startAddSecret,
    goToRecovery,
    backToPassphrase,
    dismissRecoveryKey,
    refetchVaultEntries: fetchVaultEntries,
  };
}
