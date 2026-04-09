import { useState, useEffect, useRef, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import {
  setupVault,
  unlockVault,
  decryptEntry,
  encryptEntry,
  generateRecoveryKey,
  encryptVaultKeyForRecovery,
  decryptVaultKeyFromRecovery,
} from "../lib/crypto";
import type { Entry } from "../types";

interface VaultData {
  exists: boolean;
  salt: string;
  verify_token: string;
  recovery_blob: string;
}

interface UseVaultOpsOptions {
  entries: Entry[];
  cryptoKey: CryptoKey | null;
  onVaultUnlock: (key: CryptoKey | null) => void;
  brainId?: string;
  onEntryCreated?: (entry: Entry) => void;
}

export function useVaultOps({
  entries,
  cryptoKey,
  onVaultUnlock,
  brainId,
  onEntryCreated,
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

  const secrets = entries.filter(
    (e: Entry) => e.type === "secret" || (e as any).encrypted === true,
  );

  useEffect(() => {
    if (cryptoKey) {
      setStatus("unlocked");
      return;
    }
    authFetch("/api/vault")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { setStatus("setup"); return; }
        if (data.exists) { setVaultData(data); setStatus("locked"); }
        else setStatus("setup");
      })
      .catch(() => setStatus("setup"));
  }, [cryptoKey]);

  useEffect(() => {
    if (status !== "unlocked" || !cryptoKey || secrets.length === 0) {
      setDecryptedSecrets([]);
      return;
    }
    Promise.all(secrets.map((e) => decryptEntry(e as any, cryptoKey)))
      .then((result: any[]) => setDecryptedSecrets(result))
      .catch(() => setDecryptedSecrets(secrets));
  }, [status, cryptoKey, secrets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (["setup", "locked", "recovery"].includes(status)) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [status]);

  const handleSetup = useCallback(async () => {
    if (passphrase.length < 8) { setError("Passphrase must be at least 8 characters"); return; }
    if (passphrase !== confirmPhrase) { setError("Passphrases don't match"); return; }
    setBusy(true);
    setError("");
    try {
      const { key, salt, verifyToken } = await setupVault(passphrase);
      const recoveryKey = generateRecoveryKey();
      const recoveryBlob = await encryptVaultKeyForRecovery(key, recoveryKey);
      const res = await authFetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salt, verify_token: verifyToken, recovery_blob: recoveryBlob }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setGeneratedRecoveryKey(recoveryKey);
      onVaultUnlock(key);
      setStatus("show-recovery");
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }, [passphrase, confirmPhrase, onVaultUnlock]);

  const handleUnlock = useCallback(async () => {
    if (!passphrase.trim()) return;
    setBusy(true);
    setError("");
    try {
      const key = await unlockVault(passphrase, vaultData!.salt, vaultData!.verify_token);
      if (!key) { setError("Wrong passphrase"); setBusy(false); return; }
      onVaultUnlock(key);
      setStatus("unlocked");
    } catch {
      setError("Decryption failed");
    }
    setBusy(false);
  }, [passphrase, vaultData, onVaultUnlock]);

  const handleRecoveryUnlock = useCallback(async () => {
    const cleaned = recoveryInput.trim().toUpperCase();
    if (!cleaned) return;
    setBusy(true);
    setError("");
    try {
      const key = await decryptVaultKeyFromRecovery(vaultData!.recovery_blob, cleaned);
      if (!key) { setError("Invalid recovery key"); setBusy(false); return; }
      onVaultUnlock(key);
      setStatus("unlocked");
    } catch {
      setError("Recovery failed — check your key and try again");
    }
    setBusy(false);
  }, [recoveryInput, vaultData, onVaultUnlock]);

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
    if (!cryptoKey) { setAddError("Vault is locked"); return; }
    if (!addTitle.trim() || !addContent.trim()) { setAddError("Title and content are required"); return; }
    setAddBusy(true);
    setAddError("");
    try {
      const tagList = addTags.split(",").map((t) => t.trim()).filter(Boolean);
      const metadata: Record<string, string> = {};
      for (const row of addMetaRows) {
        const k = row.key.trim();
        const v = row.value.trim();
        if (k && v) metadata[k] = v;
      }
      const plain = { title: addTitle.trim(), content: addContent, type: "secret" as const, tags: tagList, metadata };
      const encrypted = await encryptEntry(plain as any, cryptoKey);
      const res = await authFetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_title: plain.title,
          p_content: encrypted.content,
          p_type: "secret",
          p_metadata: encrypted.metadata,
          p_tags: tagList,
          ...(brainId ? { p_brain_id: brainId } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const result = await res.json().catch(() => null);
      const newEntry: Entry = {
        id: result?.id || Date.now().toString(),
        title: plain.title,
        content: plain.content,
        type: "secret",
        tags: tagList,
        metadata: metadata as any,
      } as Entry;
      setDecryptedSecrets((prev) => [newEntry, ...prev]);
      onEntryCreated?.(newEntry);
      resetAddForm();
      setShowAddSecret(false);
    } catch (e: any) {
      setAddError(e.message || "Failed to save secret");
    }
    setAddBusy(false);
  }, [addTitle, addContent, addTags, addMetaRows, cryptoKey, brainId, onEntryCreated]);

  const bulkDelete = useCallback(async () => {
    if (!confirm(`Permanently delete ${selectedIds.size} selected secret${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const res = await authFetch(`/api/entries?id=${id}`, { method: "DELETE" }).catch(() => null);
      if (res?.ok) {
        setDecryptedSecrets((prev) => prev.filter((e) => e.id !== id));
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }
    }
    setBulkMode(false);
  }, [selectedIds]);

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
    status, setStatus,
    passphrase, setPassphrase,
    confirmPhrase, setConfirmPhrase,
    recoveryInput, setRecoveryInput,
    error, setError,
    busy,
    vaultData,
    generatedRecoveryKey,
    recoveryCopied, setRecoveryCopied,
    decryptedSecrets,
    revealedIds,
    copyMsg,
    bulkMode, setBulkMode,
    selectedIds, setSelectedIds,
    inputRef,
    showAddSecret, setShowAddSecret,
    addTitle, setAddTitle,
    addContent, setAddContent,
    addTags, setAddTags,
    addMetaRows, setAddMetaRows,
    addError, setAddError,
    addBusy,
    secrets,
    // handlers
    handleSetup,
    handleUnlock,
    handleRecoveryUnlock,
    handleAddSecret,
    bulkDelete,
    toggleReveal,
    copyToClipboard,
    resetAddForm,
    lockVault,
    startAddSecret,
    goToRecovery,
    backToPassphrase,
    dismissRecoveryKey,
  };
}
