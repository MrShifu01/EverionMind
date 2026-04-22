import { useState, useRef, useEffect } from "react";
import type { Entry } from "../types";
import { decryptEntry, getCachedVaultKey, hasCachedVaultKey } from "../lib/crypto";
import { verifyPin, getStoredPinHash, setupPin } from "../lib/pin";

type Stage = "pin" | "setup-new" | "setup-confirm" | "busy" | "revealed" | "no-cache" | "error";

interface Props {
  entry: Entry;
  cryptoKey: CryptoKey | null;
  onClose: () => void;
  onVaultUnlock: (key: CryptoKey) => void;
  onGoToVault: () => void;
}

export default function VaultRevealModal({
  entry,
  cryptoKey,
  onClose,
  onVaultUnlock,
  onGoToVault,
}: Props) {
  const canReveal = !!(cryptoKey || hasCachedVaultKey());
  const [stage, setStage] = useState<Stage>(() => {
    if (!canReveal) return "no-cache";
    if (!getStoredPinHash()) return "setup-new";
    return "pin";
  });
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [shake, setShake] = useState(false);
  const [pinError, setPinError] = useState("");
  const [content, setContent] = useState("");
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shakeRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (stage === "pin" || stage === "setup-new" || stage === "setup-confirm")
      setTimeout(() => inputRef.current?.focus(), 60);
  }, [stage]);

  useEffect(() => () => clearTimeout(shakeRef.current), []);

  const doShake = () => {
    clearTimeout(shakeRef.current);
    setShake(true);
    shakeRef.current = setTimeout(() => setShake(false), 380);
  };

  async function handleSubmit() {
    if (stage === "setup-new") {
      if (pin.length !== 4) { setPinError("Must be 4 digits"); doShake(); return; }
      setNewPin(pin);
      setPin("");
      setPinError("");
      setStage("setup-confirm");
      return;
    }
    if (stage === "setup-confirm") {
      if (pin !== newPin) { setPin(""); setPinError("PINs don't match"); doShake(); return; }
      setStage("busy");
      await setupPin(newPin);
      setPin("");
      setNewPin("");
      setPinError("");
      setStage("pin");
      return;
    }
    if (pin.length !== 4) return;
    setStage("busy");
    const ok = await verifyPin(pin);
    if (!ok) {
      setPin("");
      setPinError("Wrong PIN");
      setStage("pin");
      doShake();
      return;
    }
    let key = cryptoKey;
    if (!key) {
      key = await getCachedVaultKey();
      if (key) onVaultUnlock(key);
    }
    if (!key) { setStage("no-cache"); return; }
    try {
      const dec = await decryptEntry(entry as any, key);
      setContent((dec.content as string) || "");
      setMeta((dec.metadata as Record<string, unknown>) || {});
      setStage("revealed");
    } catch {
      setStage("error");
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <style>{`@keyframes vs{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: "var(--color-scrim)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`box-border w-full max-w-[360px] rounded-[20px] border px-5 py-6 ${shake ? "animate-[vs_0.38s_ease]" : ""}`}
          style={{
            background: "var(--color-surface-container-low)",
            borderColor: "var(--color-outline-variant)",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        >
          {/* Header */}
          <div className="mb-5 text-center">
            <div className="mb-2 text-[28px]">
              {stage === "revealed" ? "🔓" : stage === "setup-new" || stage === "setup-confirm" ? "🔑" : "🔒"}
            </div>
            <h3 className="m-0 text-[17px] font-bold" style={{ color: "var(--color-on-surface)" }}>
              {stage === "revealed" ? entry.title
                : stage === "setup-new" ? "Set a PIN"
                : stage === "setup-confirm" ? "Confirm PIN"
                : "Secret"}
            </h3>
            {stage !== "revealed" && (
              <p className="mt-1 mb-0 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                {stage === "setup-new"
                  ? "Choose a 4-digit PIN to protect your secrets"
                  : stage === "setup-confirm"
                    ? "Re-enter your PIN to confirm"
                    : stage === "no-cache"
                      ? "Vault is locked. Unlock it first."
                      : stage === "error"
                        ? "Decryption failed."
                        : stage === "busy"
                          ? "Verifying…"
                          : entry.title}
              </p>
            )}
          </div>

          {/* Setup new PIN */}
          {(stage === "setup-new" || stage === "setup-confirm") && (
            <>
              <label htmlFor="vrm-pin" className="sr-only">{stage === "setup-new" ? "New PIN" : "Confirm PIN"}</label>
              <input
                ref={inputRef}
                id="vrm-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="• • • •"
                style={pinInputStyle(!!pinError)}
              />
              <p role="alert" className="mt-2 mb-0 min-h-[1em] text-center text-[11px]" style={{ color: "var(--color-error)" }}>{pinError}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={onClose} style={btnSecStyle}>Cancel</button>
                <button onClick={handleSubmit} style={btnPrimStyle}>
                  {stage === "setup-new" ? "Next" : "Set PIN"}
                </button>
              </div>
            </>
          )}

          {/* PIN entry */}
          {stage === "pin" && (
            <>
              <p className="mb-3 text-center text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                Enter your PIN to view
              </p>
              <label htmlFor="vrm-pin" className="sr-only">PIN</label>
              <input
                ref={inputRef}
                id="vrm-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="• • • •"
                style={pinInputStyle(!!pinError)}
              />
              <p role="alert" className="mt-2 mb-0 min-h-[1em] text-center text-[11px]" style={{ color: "var(--color-error)" }}>
                {pinError}
              </p>
              <div className="mt-4 flex gap-2">
                <button onClick={onClose} style={btnSecStyle}>Cancel</button>
                <button onClick={handleSubmit} style={btnPrimStyle}>Reveal</button>
              </div>
            </>
          )}

          {/* Busy */}
          {stage === "busy" && (
            <p className="text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
              Decrypting…
            </p>
          )}

          {/* Revealed content */}
          {stage === "revealed" && (
            <>
              {content && (
                <div
                  style={{
                    background: "var(--color-surface-dim)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    marginBottom: 12,
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: "var(--color-on-surface)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {content}
                </div>
              )}
              {Object.keys(meta).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {Object.entries(meta).map(([k, v]) =>
                    v ? (
                      <div key={k} style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: "var(--color-on-surface-variant)", minWidth: 80, fontFamily: "var(--f-sans)" }}>{k}</span>
                        <span style={{ color: "var(--color-on-surface)", wordBreak: "break-all" }}>{String(v)}</span>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={() => copy(content)} style={btnSecStyle}>
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button onClick={onClose} style={btnPrimStyle}>Done</button>
              </div>
            </>
          )}

          {/* Vault locked — no session cache */}
          {stage === "no-cache" && (
            <>
              <p className="mb-4 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                Open the Vault tab and enter your passphrase first, then come back here.
              </p>
              <div className="flex gap-2">
                <button onClick={onClose} style={btnSecStyle}>Cancel</button>
                <button onClick={() => { onClose(); onGoToVault(); }} style={btnPrimStyle}>Go to Vault</button>
              </div>
            </>
          )}

          {/* Error */}
          {stage === "error" && (
            <>
              <p className="mb-4 text-center text-sm" style={{ color: "var(--color-error)" }}>
                Could not decrypt this entry. Your vault key may have changed.
              </p>
              <button onClick={onClose} style={{ ...btnPrimStyle, width: "100%" }}>Close</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function pinInputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: "0.75rem",
    border: `1px solid ${hasError ? "var(--color-error)" : "var(--color-outline-variant)"}`,
    background: "var(--color-surface-dim)",
    color: "var(--color-on-surface)",
    padding: "0.875rem",
    textAlign: "center",
    fontFamily: "monospace",
    fontSize: "1.375rem",
    letterSpacing: "10px",
    outline: "none",
  };
}

const btnSecStyle: React.CSSProperties = {
  flex: 1,
  cursor: "pointer",
  borderRadius: 10,
  border: "1px solid var(--color-outline-variant)",
  background: "var(--color-surface-dim)",
  color: "var(--color-on-surface-variant)",
  padding: 11,
  fontSize: 13,
};

const btnPrimStyle: React.CSSProperties = {
  flex: 1,
  cursor: "pointer",
  borderRadius: 10,
  border: "none",
  padding: 11,
  fontSize: 13,
  fontWeight: 700,
  background: "var(--color-primary)",
  color: "var(--color-on-primary)",
};
