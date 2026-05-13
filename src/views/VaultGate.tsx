// Vault gate screens — passphrase entry (locked) and recovery-key entry.
// Both are "outside, trying to get in" states. Stateless render
// components; state + handlers live in useVaultOps.

import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Button } from "../components/ui/button";
import { VaultBrassDial } from "../components/vault/VaultBrassDial";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function VaultLockedScreen(props: {
  inputRef: RefObject<HTMLInputElement | null>;
  passphrase: string;
  setPassphrase: Dispatch<SetStateAction<string>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  busy: boolean;
  secretsCount: number;
  onUnlock: () => void;
  onUseRecoveryKey: () => void;
}) {
  const isMobile = useIsMobile();
  if (isMobile) return <VaultLockedMobile {...props} />;
  return <VaultLockedDesktop {...props} />;
}

function VaultLockedMobile({
  inputRef,
  passphrase,
  setPassphrase,
  error,
  setError,
  busy,
  secretsCount,
  onUnlock,
  onUseRecoveryKey,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  passphrase: string;
  setPassphrase: Dispatch<SetStateAction<string>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  busy: boolean;
  secretsCount: number;
  onUnlock: () => void;
  onUseRecoveryKey: () => void;
}) {
  return (
    <div
      className="bronze-screen"
      style={{
        padding: "8px 16px 22px",
        background: "var(--bg)",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ marginTop: 14, textAlign: "center" }}>
        <div
          className="f-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "var(--ember)",
            textTransform: "uppercase",
          }}
        >
          encrypted
        </div>
        <div
          className="f-serif"
          style={{
            fontSize: 28,
            color: "var(--ink)",
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            marginTop: 4,
          }}
        >
          the <span style={{ fontStyle: "italic", color: "var(--ember)" }}>vault</span>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <VaultBrassDial
          unlocked={false}
          onTap={() => inputRef.current?.focus()}
          label="Focus passphrase to unlock"
        />
      </div>

      <div
        className="f-mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.2em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          marginTop: 12,
          textAlign: "center",
        }}
      >
        {secretsCount > 0
          ? `${secretsCount} encrypted · enter passphrase`
          : "enter passphrase to begin"}
      </div>

      <div
        style={{
          marginTop: 22,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <input
          ref={inputRef}
          type="password"
          value={passphrase}
          onChange={(e) => {
            setPassphrase(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && onUnlock()}
          placeholder="passphrase"
          className="design-input f-sans"
          style={{
            height: 48,
            minHeight: 48,
            fontSize: 16,
            textAlign: "center",
            letterSpacing: "0.1em",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 14,
            color: "var(--ink)",
            padding: "0 14px",
          }}
        />

        {error && (
          <p
            className="f-serif"
            style={{
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--blood)",
              textAlign: "center",
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        <Button
          onClick={onUnlock}
          disabled={busy || !passphrase.trim()}
          size="lg"
          className="w-full"
        >
          {busy ? "unlocking…" : "Unlock"}
        </Button>

        <Button
          variant="link"
          size="sm"
          onClick={onUseRecoveryKey}
          className="italic"
          style={{
            color: "var(--ink-faint)",
            fontFamily: "var(--f-serif)",
          }}
        >
          forgot your passphrase? use recovery key.
        </Button>
      </div>
    </div>
  );
}

function VaultLockedDesktop({
  inputRef,
  passphrase,
  setPassphrase,
  error,
  setError,
  busy,
  secretsCount,
  onUnlock,
  onUseRecoveryKey,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  passphrase: string;
  setPassphrase: Dispatch<SetStateAction<string>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  busy: boolean;
  secretsCount: number;
  onUnlock: () => void;
  onUseRecoveryKey: () => void;
}) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      <header
        className="vault-topbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid var(--line-soft)",
          minHeight: 72,
          gap: 20,
        }}
      >
        <div>
          <h1
            className="f-serif"
            style={{
              fontSize: 28,
              fontWeight: 450,
              letterSpacing: "-0.015em",
              lineHeight: 1.1,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Vault
          </h1>
          <div
            className="f-serif"
            style={{ fontSize: 14, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 4 }}
          >
            locked.
          </div>
        </div>
      </header>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient halo + motes */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--ember-wash) 0%, transparent 65%)",
            pointerEvents: "none",
            opacity: 0.4,
          }}
        />

        <div style={{ position: "relative", maxWidth: 420, width: "100%", textAlign: "center" }}>
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--ember-wash)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <svg
              width="26"
              height="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              style={{ color: "var(--ember)" }}
            >
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h2
            className="f-serif"
            style={{
              fontSize: 40,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
              margin: 0,
              lineHeight: 1.05,
            }}
          >
            locked.
          </h2>
          <p
            className="f-serif"
            style={{
              fontSize: 16,
              color: "var(--ink-soft)",
              fontStyle: "italic",
              margin: "12px 0 28px",
              lineHeight: 1.5,
            }}
          >
            {secretsCount > 0
              ? `${secretsCount} encrypted ${secretsCount === 1 ? "entry" : "entries"}, waiting behind your passphrase.`
              : "enter your passphrase to unlock."}
          </p>

          <input
            ref={inputRef}
            type="password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && onUnlock()}
            placeholder="passphrase"
            className="design-input f-sans"
            style={{
              height: 48,
              minHeight: 48,
              fontSize: 16,
              textAlign: "center",
              letterSpacing: "0.1em",
            }}
          />

          {error && (
            <p
              className="f-serif"
              style={{ fontSize: 14, fontStyle: "italic", color: "var(--blood)", marginTop: 10 }}
            >
              {error}
            </p>
          )}

          <Button
            onClick={onUnlock}
            disabled={busy || !passphrase.trim()}
            size="lg"
            className="mt-4 w-full"
          >
            {busy ? "unlocking…" : "Unlock"}
          </Button>

          <Button
            variant="link"
            size="sm"
            onClick={onUseRecoveryKey}
            className="mt-3 italic"
            style={{ color: "var(--ink-faint)", fontFamily: "var(--f-serif)" }}
          >
            forgot your passphrase? use recovery key.
          </Button>
        </div>
      </div>
    </div>
  );
}

export function VaultRecoveryEntry({
  inputRef,
  recoveryInput,
  setRecoveryInput,
  error,
  setError,
  busy,
  onSubmit,
  onBackToPassphrase,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  recoveryInput: string;
  setRecoveryInput: Dispatch<SetStateAction<string>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  busy: boolean;
  onSubmit: () => void;
  onBackToPassphrase: () => void;
}) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        background: "var(--bg)",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--ember-wash)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <svg
            width="26"
            height="26"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            style={{ color: "var(--ember)" }}
          >
            <circle cx="16" cy="12" r="3.5" />
            <path d="M12.5 12H3M6 12v3M9 12v3M16 9V5" />
          </svg>
        </div>
        <h2
          className="f-serif"
          style={{
            fontSize: 32,
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
            margin: 0,
            lineHeight: 1.05,
          }}
        >
          recovery key.
        </h2>
        <p
          className="f-serif"
          style={{
            fontSize: 15,
            color: "var(--ink-soft)",
            fontStyle: "italic",
            margin: "12px 0 28px",
            lineHeight: 1.5,
          }}
        >
          enter the key you saved when you first set up your vault.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={recoveryInput}
          onChange={(e) => {
            setRecoveryInput(e.target.value.toUpperCase());
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          className="design-input"
          style={{
            height: 48,
            minHeight: 48,
            fontSize: 15,
            textAlign: "center",
            letterSpacing: "0.14em",
            fontFamily: "var(--f-mono)",
          }}
        />

        {error && (
          <p
            className="f-serif"
            style={{ fontSize: 14, fontStyle: "italic", color: "var(--blood)", marginTop: 10 }}
          >
            {error}
          </p>
        )}

        <Button
          onClick={onSubmit}
          disabled={busy || !recoveryInput.trim()}
          size="lg"
          className="mt-4 w-full"
        >
          {busy ? "recovering…" : "Unlock with recovery key"}
        </Button>

        <Button
          variant="link"
          size="sm"
          onClick={onBackToPassphrase}
          className="mt-3 italic"
          style={{ color: "var(--ink-faint)", fontFamily: "var(--f-serif)" }}
        >
          back to passphrase
        </Button>
      </div>
    </div>
  );
}
