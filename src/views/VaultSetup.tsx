// First-time vault setup screens — choose-passphrase form and the
// one-shot recovery key display. Split out of VaultView.tsx as the
// "first time" pair of states. State + handlers live in useVaultOps;
// these are stateless render components.

import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Button } from "../components/ui/button";

export function VaultSetupForm({
  inputRef,
  passphrase,
  setPassphrase,
  confirmPhrase,
  setConfirmPhrase,
  error,
  setError,
  busy,
  onSubmit,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  passphrase: string;
  setPassphrase: Dispatch<SetStateAction<string>>;
  confirmPhrase: string;
  setConfirmPhrase: Dispatch<SetStateAction<string>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center space-y-6 px-4 py-12"
      style={{ background: "var(--bg)" }}
    >
      <div className="space-y-2 text-center">
        <div className="text-4xl">🔐</div>
        <h2 className="text-on-surface text-xl font-bold" style={{ fontFamily: "var(--f-sans)" }}>
          Set up your Vault
        </h2>
        <p
          className="mx-auto max-w-xs text-sm"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          Choose a passphrase to protect your passwords, credit cards, and sensitive data.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
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
            className="text-on-surface placeholder:text-on-surface-variant w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
            style={{ borderColor: "var(--color-outline-variant)" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
          />
        </div>
        <div className="space-y-1">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Confirm passphrase
          </label>
          <input
            type="password"
            value={confirmPhrase}
            onChange={(e) => {
              setConfirmPhrase(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="Enter again to confirm"
            className="text-on-surface placeholder:text-on-surface-variant w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
            style={{ borderColor: "var(--color-outline-variant)" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
          />
        </div>
      </div>

      {error && (
        <p className="text-center text-sm" style={{ color: "var(--color-error)" }}>
          {error}
        </p>
      )}

      <Button
        onClick={onSubmit}
        disabled={busy || passphrase.length < 8}
        size="lg"
        className="w-full max-w-sm"
      >
        {busy ? "Setting up..." : "Create Vault"}
      </Button>
    </div>
  );
}

export function VaultRecoveryKeyDisplay({
  recoveryKey,
  copied,
  setCopied,
  onDismiss,
}: {
  recoveryKey: string;
  copied: boolean;
  setCopied: Dispatch<SetStateAction<boolean>>;
  onDismiss: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const downloadRecoveryKey = () => {
    const blob = new Blob(
      [
        `Everion recovery key\n\n${recoveryKey}\n\nStore this somewhere safe. Without your passphrase or this recovery key, encrypted entries are permanently lost.\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "everion-recovery-key.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 1000);
  };

  const printRecoveryKey = () => {
    const content = `<!doctype html><html><head><title>Everion recovery key</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;background:#fff;}pre{white-space:pre-wrap;word-break:break-word;font-size:1rem;background:#f7f7f7;padding:16px;border-radius:16px;border:1px solid #ddd;}button{display:none;}</style></head><body><h1>Everion recovery key</h1><p>Print this page and store the recovery key somewhere safe. Without your passphrase or this recovery key, encrypted entries are permanently lost.</p><pre>${recoveryKey}</pre></body></html>`;
    const printWindow = window.open("", "_blank", "width=600,height=700");
    if (!printWindow) return;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div
      className="flex flex-col items-center space-y-6 px-4 py-12"
      style={{ background: "var(--bg)" }}
    >
      <div className="space-y-2 text-center">
        <div className="text-4xl">🗝</div>
        <h2 className="text-on-surface text-xl font-bold" style={{ fontFamily: "var(--f-sans)" }}>
          Your Recovery Key
        </h2>
        <p
          className="mx-auto max-w-xs text-sm"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          If you ever forget your passphrase, this key is the{" "}
          <strong className="text-on-surface">only way</strong> to recover your secrets. Write it
          down and store it somewhere safe.
        </p>
      </div>

      {/* Recovery key display */}
      <div
        className="w-full max-w-sm rounded-2xl border p-4 text-center"
        style={{
          background: "var(--color-surface-container)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <p
          className="font-mono text-base font-bold tracking-widest"
          style={{ color: "var(--color-primary)" }}
        >
          {recoveryKey}
        </p>
      </div>

      <Button
        variant="outline"
        size="lg"
        onClick={() => {
          navigator.clipboard.writeText(recoveryKey);
          setCopied(true);
        }}
        className="w-full max-w-sm"
      >
        {copied ? "Copied!" : "📋 Copy recovery key"}
      </Button>

      <div className="grid w-full max-w-sm grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={downloadRecoveryKey}>
          Download .txt
        </Button>
        <Button variant="outline" size="lg" onClick={printRecoveryKey}>
          Print
        </Button>
      </div>

      <div
        className="w-full max-w-sm rounded-2xl border p-3"
        style={{
          background: "color-mix(in oklch, var(--color-error) 12%, transparent)",
          borderColor: "color-mix(in oklch, var(--color-error) 20%, transparent)",
        }}
      >
        <p className="text-xs" style={{ color: "var(--color-error)" }}>
          <strong>Write this down now.</strong> This key will not be shown again. Without your
          passphrase or this recovery key, encrypted entries are permanently lost.
        </p>
      </div>

      <label
        className="flex w-full max-w-sm items-center gap-3 rounded-xl border p-3 text-left text-sm"
        style={{
          borderColor: "var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: "var(--color-primary)" }}
        />
        <span>I have saved this recovery key somewhere safe.</span>
      </label>

      <Button onClick={onDismiss} disabled={!acknowledged} size="lg" className="w-full max-w-sm">
        I've saved my recovery key
      </Button>
    </div>
  );
}
