/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useRef } from "react";
import { getUserId } from "./aiSettings";
import { authFetch } from "./authFetch";

type PinStep = "enter" | "create" | "confirm" | "migrate";

interface PinGateProps {
  onSuccess: () => void;
  onCancel: () => void;
  isSetup?: boolean;
}

function _pinKey(): string {
  const uid = getUserId();
  return uid ? `openbrain_${uid}_security_pin` : "openbrain_security_pin";
}
export function getStoredPinHash(): string | null {
  return localStorage.getItem(_pinKey()) || null;
}
export function removePin(): void {
  localStorage.removeItem(_pinKey());
  // Best-effort server-side removal — fire and forget
  authFetch("/api/pin?action=delete", { method: "DELETE" }).catch(() => {});
}

async function _legacyVerifyPin(pin: string, stored: string): Promise<boolean> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin + "ob_salt_v1"));
  const hash = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hash === stored;
}

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hashHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return saltHex + ":" + hashHex;
}

async function _derivePbkdf2Hash(pin: string, saltHex: string): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPin(pin: string, stored?: string): Promise<boolean | null> {
  const s = stored !== undefined ? stored : getStoredPinHash();
  if (!s) return false;
  if (!s.includes(":")) return null; // legacy SHA-256 format — caller handles migrate step

  const [saltHex, hashHex] = s.split(":");
  const derivedHash = await _derivePbkdf2Hash(pin, saltHex);

  // Server-side verification (primary and only method after S1-2)
  try {
    const r = await authFetch("/api/pin?action=verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash: derivedHash }),
    });
    if (r.ok) {
      const data = await r.json();
      if (data.noPinSet) {
        // No server record yet — migration case for legacy users
        return derivedHash === hashHex;
      }
      return data.valid === true;
    }
  } catch {
    // Network offline — cannot verify without server
    return false;
  }

  return false;
}

async function storePin(pin: string): Promise<void> {
  const combined = await hashPin(pin); // "saltHex:hashHex"
  // Only push hash+salt to server (zero-knowledge: server never sees PIN)
  const [saltHex, hashHex] = combined.split(":");
  await authFetch("/api/pin?action=setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hash: hashHex, salt: saltHex }),
  });
}

export function PinGate({ onSuccess, onCancel, isSetup = false }: PinGateProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<PinStep>(() => {
    if (isSetup) return "create";
    const stored = getStoredPinHash();
    if (stored && !stored.includes(":")) return "migrate";
    return "enter";
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [step]);

  // Cleanup shake timer on unmount
  useEffect(() => {
    return () => clearTimeout(shakeTimer.current);
  }, []);

  const doShake = () => {
    clearTimeout(shakeTimer.current);
    setShake(true);
    shakeTimer.current = setTimeout(() => setShake(false), 380);
  };

  const handleSubmit = async () => {
    if (step === "enter") {
      const result = await verifyPin(pin);
      if (result === true) {
        onSuccess();
      } else {
        setPin("");
        setError("Wrong PIN — try again");
        doShake();
      }
    } else if (step === "migrate") {
      const oldStored = getStoredPinHash();
      const legacyOk = await _legacyVerifyPin(pin, oldStored!);
      if (!legacyOk) {
        setPin("");
        setError("Wrong PIN — try again");
        doShake();
        return;
      }
      await storePin(pin);
      onSuccess();
    } else if (step === "create") {
      if (pin.length !== 4) {
        setError("Must be 4 digits");
        doShake();
        return;
      }
      setError("");
      setStep("confirm");
    } else {
      if (pin !== confirmPin) {
        setConfirmPin("");
        setError("PINs don't match");
        doShake();
        return;
      }
      await storePin(pin);
      onSuccess();
    }
  };

  // Focus trap: keep Tab within the dialog
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { onCancel(); return; }
    if (e.key !== "Tab") return;
    const dialog = e.currentTarget;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const titles: Record<PinStep, string> = {
    enter: "Sensitive Info",
    create: "Set Security PIN",
    confirm: "Confirm PIN",
    migrate: "Security Upgrade",
  };
  const subs: Record<PinStep, string> = {
    enter: "Enter your PIN to view this response",
    create: "Choose a 4-digit PIN to protect sensitive responses",
    confirm: "Re-enter your PIN to confirm",
    migrate: "Security upgrade required — please re-enter your PIN to continue",
  };
  const btnLabel: Record<PinStep, string> = {
    enter: "Unlock",
    create: "Next",
    confirm: "Set PIN",
    migrate: "Upgrade & Unlock",
  };

  return (
    <>
      <style>{`@keyframes pinShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: "var(--color-scrim)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      >
        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-dialog-title"
          onKeyDown={handleKeyDown}
          className={`box-border w-full max-w-[300px] rounded-[20px] border px-5 py-6 ${shake ? "animate-[pinShake_0.38s_ease]" : ""}`}
          style={{
            background: "var(--color-surface-container-low)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          <div className="mb-[22px] text-center">
            <div className="mb-2 text-[30px]" aria-hidden="true">🔒</div>
            <h3
              id="pin-dialog-title"
              className="m-0 text-[17px] font-bold"
              style={{ color: "var(--color-on-surface)" }}
            >
              {titles[step]}
            </h3>
            <p
              className="mt-1.5 mb-0 text-xs"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              {subs[step]}
            </p>
          </div>

          {/* Visually hidden label for PIN input */}
          <label
            htmlFor="pin-input"
            className="sr-only"
          >
            {subs[step]}
          </label>
          <input
            ref={inputRef}
            id="pin-input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={step === "confirm" ? confirmPin : pin}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              if (step === "confirm") setConfirmPin(v);
              else setPin(v);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="• • • •"
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: "0.75rem",
              border: `1px solid ${error ? "var(--color-error)" : "var(--color-outline-variant)"}`,
              background: "var(--color-surface-dim)",
              color: "var(--color-on-surface)",
              padding: "0.875rem",
              textAlign: "center",
              fontFamily: "monospace",
              fontSize: "1.375rem",
              letterSpacing: "10px",
              outline: "none",
            }}
          />

          {/* Always-rendered alert container — aria-live announces errors as they appear */}
          <p
            role="alert"
            aria-live="polite"
            className="mt-2 mb-0 text-center text-[11px]"
            style={{
              color: "var(--color-error)",
              minHeight: "1em",
            }}
          >
            {error}
          </p>

          <div className="mt-4 flex gap-2">
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                cursor: "pointer",
                borderRadius: 10,
                border: "1px solid var(--color-outline-variant)",
                background: "var(--color-surface-dim)",
                color: "var(--color-on-surface-variant)",
                padding: 11,
                fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              style={{
                flex: 1,
                cursor: "pointer",
                borderRadius: 10,
                border: "none",
                padding: 11,
                fontSize: 13,
                fontWeight: 700,
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
              }}
            >
              {btnLabel[step]}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
