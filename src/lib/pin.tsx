import { useState, useEffect, useRef } from "react";
import { useTheme } from "../ThemeContext";
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
  // localStorage copy removed — offline fallback handled by server returning noPinSet
  const [saltHex, hashHex] = combined.split(":");
  await authFetch("/api/pin?action=setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hash: hashHex, salt: saltHex }),
  });
}

export function PinGate({ onSuccess, onCancel, isSetup = false }: PinGateProps) {
  useTheme();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<PinStep>(() => {
    if (isSetup) return "create";
    const stored = getStoredPinHash();
    // Only show migrate step for legacy SHA-256 format (no colon separator)
    if (stored && !stored.includes(":")) return "migrate";
    return "enter";
  });
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [step]);

  const doShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 380);
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
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/[0.72] backdrop-blur-[4px]"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          className={`bg-ob-surface border-ob-border box-border w-full max-w-[300px] rounded-[20px] border px-5 py-6 ${shake ? "animate-[pinShake_0.38s_ease]" : ""}`}
        >
          <div className="mb-[22px] text-center">
            <div className="mb-2 text-[30px]">🔒</div>
            <h3 className="text-ob-text m-0 text-[17px] font-bold">{titles[step]}</h3>
            <p className="text-ob-text-dim mt-1.5 mb-0 text-xs">{subs[step]}</p>
          </div>
          <input
            ref={inputRef}
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
            className={`bg-ob-bg w-full border p-3.5 ${error ? "border-orange" : "border-ob-border"} text-ob-text-soft box-border rounded-xl text-center font-mono text-[22px] tracking-[10px] outline-none`}
          />
          {error && <p className="text-orange mt-2 mb-0 text-center text-[11px]">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={onCancel}
              className="bg-ob-bg border-ob-border text-ob-text-dim flex-1 cursor-pointer rounded-[10px] border p-[11px] text-[13px]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 cursor-pointer rounded-[10px] border-none p-[11px] text-[13px] font-bold"
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
            >
              {btnLabel[step]}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
