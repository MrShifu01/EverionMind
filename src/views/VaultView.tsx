import { useState, useRef, useEffect, useCallback } from "react";
import { getTypeConfig } from "../data/constants";
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

/* ─── States: loading → setup → show-recovery → locked | recovery | unlocked ─── */

interface VaultData {
  exists: boolean;
  salt: string;
  verify_token: string;
  recovery_blob: string;
}

interface VaultViewProps {
  entries: Entry[];
  onSelect: (entry: Entry) => void;
  cryptoKey: CryptoKey | null;
  onVaultUnlock: (key: CryptoKey | null) => void;
  brainId?: string;
  onEntryCreated?: (entry: Entry) => void;
}

export default function VaultView({ entries, onSelect, cryptoKey, onVaultUnlock, brainId, onEntryCreated }: VaultViewProps) {
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
  // Bulk select mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Add Secret modal state
  const [showAddSecret, setShowAddSecret] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addContent, setAddContent] = useState("");
  const [addTags, setAddTags] = useState("");
  const [addMetaRows, setAddMetaRows] = useState<{ key: string; value: string }[]>([]);
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const secrets = entries.filter((e: Entry) => e.type === "secret" || (e as any).encrypted === true);

  // Check vault status on mount
  useEffect(() => {
    if (cryptoKey) {
      setStatus("unlocked");
      return;
    }
    authFetch("/api/vault")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          setStatus("setup");
          return;
        }
        if (data.exists) {
          setVaultData(data);
          setStatus("locked");
        } else setStatus("setup");
      })
      .catch(() => setStatus("setup"));
  }, [cryptoKey]);

  // Decrypt secrets when unlocked
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

  // ── Setup: create vault + generate recovery key ──
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

      // Generate recovery key and encrypt vault key with it
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

      // Show the recovery key before unlocking
      setGeneratedRecoveryKey(recoveryKey);
      onVaultUnlock(key);
      setStatus("show-recovery");
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }, [passphrase, confirmPhrase, onVaultUnlock]);

  // ── Unlock with passphrase ──
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
      onVaultUnlock(key);
      setStatus("unlocked");
    } catch {
      setError("Decryption failed");
    }
    setBusy(false);
  }, [passphrase, vaultData, onVaultUnlock]);

  // ── Unlock with recovery key ──
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
    if (!cryptoKey) {
      setAddError("Vault is locked");
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

      // Encrypt locally — never sent in plaintext, never embedded by AI
      const plain = {
        title: addTitle.trim(),
        content: addContent,
        type: "secret" as const,
        tags: tagList,
        metadata,
      };
      const encrypted = await encryptEntry(plain as any, cryptoKey);

      const res = await authFetch("/api/capture", {
        method: "POST",
        // No embed headers — bypass AI parsing/embeddings entirely
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

  // ── Loading ──
  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3" style={{ background: "#0e0e0e" }}>
        <div className="text-4xl animate-pulse">🔐</div>
        <p className="text-sm" style={{ color: "#777" }}>Checking vault...</p>
      </div>
    );
  }

  // ── Setup: passphrase creation ──
  if (status === "setup") {
    return (
      <div className="flex flex-col items-center px-4 py-12 space-y-6" style={{ background: "#0e0e0e" }}>
        <div className="text-center space-y-2">
          <div className="text-4xl">🔐</div>
          <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>Set up your Vault</h2>
          <p className="text-sm max-w-xs mx-auto" style={{ color: "#aaa" }}>
            Choose a passphrase to protect your passwords, credit cards, and sensitive data.
          </p>
        </div>

        <div className="w-full max-w-sm space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "#777" }}>
              Passphrase
            </label>
            <input
              ref={inputRef}
              type="password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setError("");
              }}
              placeholder="At least 8 characters"
              className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent border outline-none transition-colors text-white placeholder:text-[#555]"
              style={{ borderColor: "rgba(72,72,71,0.3)" }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "#777" }}>
              Confirm passphrase
            </label>
            <input
              type="password"
              value={confirmPhrase}
              onChange={(e) => {
                setConfirmPhrase(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSetup()}
              placeholder="Enter again to confirm"
              className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent border outline-none transition-colors text-white placeholder:text-[#555]"
              style={{ borderColor: "rgba(72,72,71,0.3)" }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
            />
          </div>
        </div>

        {error && <p className="text-sm text-center" style={{ color: "#ff6e84" }}>{error}</p>}

        <button
          onClick={handleSetup}
          disabled={busy || passphrase.length < 8}
          className="w-full max-w-sm rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
            color: "#0a0a0a",
          }}
        >
          {busy ? "Setting up..." : "Create Vault"}
        </button>
      </div>
    );
  }

  // ── Show recovery key (after setup, before unlocked) ──
  if (status === "show-recovery") {
    return (
      <div className="flex flex-col items-center px-4 py-12 space-y-6" style={{ background: "#0e0e0e" }}>
        <div className="text-center space-y-2">
          <div className="text-4xl">🗝</div>
          <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>Your Recovery Key</h2>
          <p className="text-sm max-w-xs mx-auto" style={{ color: "#aaa" }}>
            If you ever forget your passphrase, this key is the{" "}
            <strong className="text-white">only way</strong> to recover your secrets. Write it
            down and store it somewhere safe.
          </p>
        </div>

        {/* Recovery key display */}
        <div
          className="w-full max-w-sm rounded-2xl border p-4 text-center"
          style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}
        >
          <p className="text-base font-mono font-bold tracking-widest" style={{ color: "#d575ff" }}>{generatedRecoveryKey}</p>
        </div>

        <button
          onClick={() => {
            navigator.clipboard.writeText(generatedRecoveryKey);
            setRecoveryCopied(true);
          }}
          className="w-full max-w-sm rounded-xl py-2.5 text-sm font-semibold border transition-colors hover:bg-white/5"
          style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
        >
          {recoveryCopied ? "Copied!" : "📋 Copy recovery key"}
        </button>

        <div
          className="w-full max-w-sm rounded-2xl border p-3"
          style={{ background: "rgba(255,110,132,0.08)", borderColor: "rgba(255,110,132,0.2)" }}
        >
          <p className="text-xs" style={{ color: "#ff6e84" }}>
            <strong>Write this down now.</strong> This key will not be shown again. Without your
            passphrase or this recovery key, encrypted entries are permanently lost.
          </p>
        </div>

        <button
          onClick={() => {
            setGeneratedRecoveryKey("");
            setStatus("unlocked");
          }}
          className="w-full max-w-sm rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
            color: "#0a0a0a",
          }}
        >
          I've saved my recovery key
        </button>
      </div>
    );
  }

  // ── Locked: passphrase entry ──
  if (status === "locked") {
    return (
      <div className="flex flex-col items-center px-4 py-12 space-y-5" style={{ background: "#0e0e0e" }}>
        <div className="text-center space-y-2">
          <div className="text-4xl">🔒</div>
          <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>Unlock Vault</h2>
          <p className="text-sm" style={{ color: "#aaa" }}>
            Enter your vault passphrase to view secrets
          </p>
        </div>

        <input
          ref={inputRef}
          type="password"
          value={passphrase}
          onChange={(e) => {
            setPassphrase(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          placeholder="Vault passphrase"
          className="w-full max-w-sm rounded-xl px-3 py-2.5 text-sm bg-transparent border outline-none transition-colors text-white placeholder:text-[#555]"
          style={{ borderColor: "rgba(72,72,71,0.3)" }}
          onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
          onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
        />

        {error && <p className="text-sm" style={{ color: "#ff6e84" }}>{error}</p>}

        <button
          onClick={handleUnlock}
          disabled={busy || !passphrase.trim()}
          className="w-full max-w-sm rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
            color: "#0a0a0a",
          }}
        >
          {busy ? "Unlocking..." : "Unlock"}
        </button>

        <button
          onClick={() => {
            setError("");
            setRecoveryInput("");
            setStatus("recovery");
          }}
          className="text-xs transition-colors hover:underline"
          style={{ color: "#777" }}
        >
          Forgot passphrase? Use recovery key
        </button>

        {secrets.length > 0 && (
          <p className="text-xs" style={{ color: "#555" }}>
            {secrets.length} encrypted {secrets.length === 1 ? "entry" : "entries"} waiting
          </p>
        )}
      </div>
    );
  }

  // ── Recovery: enter recovery key ──
  if (status === "recovery") {
    return (
      <div className="flex flex-col items-center px-4 py-12 space-y-5" style={{ background: "#0e0e0e" }}>
        <div className="text-center space-y-2">
          <div className="text-4xl">🗝</div>
          <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>Recovery Key</h2>
          <p className="text-sm" style={{ color: "#aaa" }}>
            Enter the recovery key you saved when you set up your vault
          </p>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={recoveryInput}
          onChange={(e) => {
            setRecoveryInput(e.target.value.toUpperCase());
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleRecoveryUnlock()}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          className="w-full max-w-sm rounded-xl px-3 py-2.5 text-sm bg-transparent border outline-none transition-colors text-white font-mono tracking-wider text-center placeholder:text-[#555]"
          style={{ borderColor: "rgba(72,72,71,0.3)" }}
          onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
          onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
        />

        {error && <p className="text-sm" style={{ color: "#ff6e84" }}>{error}</p>}

        <button
          onClick={handleRecoveryUnlock}
          disabled={busy || !recoveryInput.trim()}
          className="w-full max-w-sm rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
            color: "#0a0a0a",
          }}
        >
          {busy ? "Recovering..." : "Unlock with recovery key"}
        </button>

        <button
          onClick={() => {
            setError("");
            setPassphrase("");
            setStatus("locked");
          }}
          className="text-xs transition-colors hover:underline"
          style={{ color: "#777" }}
        >
          Back to passphrase
        </button>
      </div>
    );
  }

  // ── Bulk delete ──
  const bulkDelete = useCallback(async () => {
    if (!confirm(`Permanently delete ${selectedIds.size} selected secret${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const res = await authFetch(`/api/entries?id=${id}`, { method: "DELETE" }).catch(() => null);
      if (res?.ok) {
        setDecryptedSecrets(prev => prev.filter(e => e.id !== id));
        setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      }
    }
    setBulkMode(false);
  }, [selectedIds]);

  // ── Unlocked: show all secrets ──
  return (
    <div className="px-4 py-4 space-y-4" style={{ background: "#0e0e0e", fontFamily: "'Manrope', sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">🔐 Vault</h2>
          <p className="text-xs" style={{ color: "#777" }}>
            {decryptedSecrets.length} secret {decryptedSecrets.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              resetAddForm();
              setShowAddSecret(true);
            }}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
              color: "#0a0a0a",
            }}
          >
            ➕ Add Secret
          </button>
          <button
            onClick={() => { setBulkMode(b => !b); setSelectedIds(new Set()); }}
            className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ color: bulkMode ? "#72eff5" : "#aaa", borderColor: bulkMode ? "rgba(114,239,245,0.3)" : "rgba(72,72,71,0.3)", minHeight: 44 }}
          >
            {bulkMode ? "Cancel" : "Select"}
          </button>
          <button
            onClick={() => {
              setStatus("locked");
              setPassphrase("");
              setRecoveryInput("");
              setRevealedIds(new Set());
              setBulkMode(false);
              setSelectedIds(new Set());
              onVaultUnlock(null);
            }}
            className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
          >
            🔒 Lock
          </button>
        </div>
      </div>

      {copyMsg && (
        <div
          className="rounded-xl px-3 py-2 text-xs text-center font-medium"
          style={{ color: "#72eff5", background: "rgba(114,239,245,0.1)" }}
        >
          {copyMsg}
        </div>
      )}

      {decryptedSecrets.length === 0 ? (
        <div className="flex flex-col items-center py-16 space-y-2">
          <div className="text-4xl">🔐</div>
          <p className="text-sm text-white">No secrets yet</p>
          <p className="text-xs" style={{ color: "#777" }}>
            Capture a password, credit card, or PIN and it'll appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {decryptedSecrets.map((e) => {
            const revealed = revealedIds.has(e.id);
            const meta = Object.entries(e.metadata || {}).filter(
              ([k]) => k !== "category" && k !== "status",
            );
            return (
              <div
                key={e.id}
                className="rounded-2xl border overflow-hidden"
                style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}
              >
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {bulkMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(e.id)}
                        onChange={ev => setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (ev.target.checked) next.add(e.id); else next.delete(e.id);
                          return next;
                        })}
                        style={{ minHeight: 44, minWidth: 44 }}
                      />
                    )}
                    <span className="text-base">{getTypeConfig(e.type).i}</span>
                    <span className="text-sm font-medium text-white truncate">{e.title}</span>
                  </div>
                  {!bulkMode && (
                    <button
                      onClick={() => toggleReveal(e.id)}
                      className="rounded-xl px-3 py-1 text-xs font-medium border shrink-0 transition-colors hover:bg-white/5"
                      style={{ color: "#72eff5", borderColor: "rgba(114,239,245,0.2)" }}
                    >
                      {revealed ? "Hide" : "Reveal"}
                    </button>
                  )}
                </div>

                {revealed ? (
                  <div className="px-3 pb-3 space-y-3">
                    <div
                      className="rounded-xl p-3 border"
                      style={{ background: "rgba(0,0,0,0.3)", borderColor: "rgba(72,72,71,0.15)" }}
                    >
                      <p className="text-sm font-mono text-white break-all">{e.content}</p>
                    </div>
                    {meta.length > 0 && (
                      <div className="space-y-1.5">
                        {meta.map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2 text-xs">
                            <span className="shrink-0" style={{ color: "#777" }}>
                              {k.replace(/_/g, " ")}:
                            </span>
                            <span className="text-white truncate">{String(v)}</span>
                            <button
                              onClick={() => copyToClipboard(String(v), `${k} copied`)}
                              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                            >
                              📋
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: "rgba(72,72,71,0.2)" }}>
                      <button
                        onClick={() => copyToClipboard(e.content || "", "Content copied")}
                        className="rounded-xl px-3 py-1 text-xs border transition-colors hover:bg-white/5"
                        style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
                      >
                        📋 Copy content
                      </button>
                      <button
                        onClick={() => onSelect(e)}
                        className="rounded-xl px-3 py-1 text-xs border transition-colors hover:bg-white/5"
                        style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <span className="text-sm tracking-widest" style={{ color: "#555" }}>
                      ••••••••••••
                    </span>
                    {(e.tags?.length ?? 0) > 0 &&
                      e.tags!.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="rounded-full px-2 py-0.5 text-[10px]"
                          style={{ color: "#777", background: "rgba(72,72,71,0.3)" }}
                        >
                          {tag}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {bulkMode && selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 rounded-2xl p-3 flex items-center justify-between z-50"
          style={{ background: "#1a1a1a", border: "1px solid rgba(72,72,71,0.4)" }}>
          <span className="text-sm text-white">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <button onClick={bulkDelete} className="rounded-lg px-4 text-xs font-semibold"
              style={{ background: "rgba(255,71,87,0.2)", color: "#FF4757", minHeight: 44 }}>
              Delete
            </button>
          </div>
        </div>
      )}

      {showAddSecret && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-3 py-6"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => !addBusy && setShowAddSecret(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border overflow-hidden"
            style={{
              background: "rgba(20,20,20,0.98)",
              borderColor: "rgba(72,72,71,0.3)",
              fontFamily: "'Manrope', sans-serif",
            }}
          >
            <div className="p-4 border-b" style={{ borderColor: "rgba(72,72,71,0.2)" }}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">➕ Add Secret</h3>
                <button
                  onClick={() => !addBusy && setShowAddSecret(false)}
                  className="text-lg leading-none"
                  style={{ color: "#777" }}
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "#777" }}>
                Encrypted on this device. AI never sees this entry.
              </p>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#777" }}>
                  Title
                </label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => {
                    setAddTitle(e.target.value);
                    setAddError("");
                  }}
                  placeholder="e.g. Gmail password"
                  className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent border outline-none transition-colors text-white placeholder:text-[#555]"
                  style={{ borderColor: "rgba(72,72,71,0.3)" }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#777" }}>
                  Secret value
                </label>
                <textarea
                  value={addContent}
                  onChange={(e) => {
                    setAddContent(e.target.value);
                    setAddError("");
                  }}
                  rows={3}
                  placeholder="Password, key, card number, etc."
                  className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent border outline-none transition-colors text-white placeholder:text-[#555] font-mono resize-none"
                  style={{ borderColor: "rgba(72,72,71,0.3)" }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#777" }}>
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={addTags}
                  onChange={(e) => setAddTags(e.target.value)}
                  placeholder="work, banking, 2fa"
                  className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent border outline-none transition-colors text-white placeholder:text-[#555]"
                  style={{ borderColor: "rgba(72,72,71,0.3)" }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#777" }}>
                    Extra fields
                  </label>
                  <button
                    onClick={() => setAddMetaRows((p) => [...p, { key: "", value: "" }])}
                    className="text-[11px] font-medium"
                    style={{ color: "#72eff5" }}
                  >
                    + Add field
                  </button>
                </div>
                {addMetaRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) =>
                        setAddMetaRows((p) =>
                          p.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)),
                        )
                      }
                      placeholder="username"
                      className="flex-1 min-w-0 rounded-xl px-2.5 py-2 text-xs bg-transparent border outline-none text-white placeholder:text-[#555]"
                      style={{ borderColor: "rgba(72,72,71,0.3)" }}
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) =>
                        setAddMetaRows((p) =>
                          p.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)),
                        )
                      }
                      placeholder="value"
                      className="flex-1 min-w-0 rounded-xl px-2.5 py-2 text-xs bg-transparent border outline-none text-white placeholder:text-[#555]"
                      style={{ borderColor: "rgba(72,72,71,0.3)" }}
                    />
                    <button
                      onClick={() =>
                        setAddMetaRows((p) => p.filter((_, idx) => idx !== i))
                      }
                      className="shrink-0 text-sm"
                      style={{ color: "#ff6e84" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {addError && (
                <p className="text-xs" style={{ color: "#ff6e84" }}>
                  {addError}
                </p>
              )}
            </div>

            <div
              className="p-3 flex items-center gap-2 border-t"
              style={{ borderColor: "rgba(72,72,71,0.2)" }}
            >
              <button
                onClick={() => !addBusy && setShowAddSecret(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors hover:bg-white/5"
                style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddSecret}
                disabled={addBusy || !addTitle.trim() || !addContent.trim()}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
                  color: "#0a0a0a",
                }}
              >
                {addBusy ? "Encrypting..." : "🔒 Save secret"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
