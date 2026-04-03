/**
 * PIN security utilities and PinGate component.
 * Extracted to avoid circular imports between OpenBrain.jsx and SettingsView.jsx.
 */
import { useState, useEffect, useRef } from "react";
import { useTheme } from "../ThemeContext";
import { getUserId } from "./aiFetch";

function _pinKey() { const uid = getUserId(); return uid ? `openbrain_${uid}_security_pin` : "openbrain_security_pin"; }
export function getStoredPinHash() { return localStorage.getItem(_pinKey()) || null; }
export function removePin() { localStorage.removeItem(_pinKey()); }

async function _legacyVerifyPin(pin, stored) {
  // Used only during migration from SHA-256 + hardcoded salt (old format, no ':')
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin + "ob_salt_v1"));
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hash === stored;
}

/**
 * Hashes a PIN using PBKDF2-SHA256 with a random salt.
 * @param {string} pin - The 4-digit PIN to hash.
 * @returns {Promise<string>} Salted hash in "saltHex:hashHex" format.
 */
async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  return saltHex + ":" + hashHex;
}

/**
 * Verifies a PIN against a stored hash. Returns null if format is old (migration needed).
 * @param {string} pin - The PIN to verify.
 * @param {string} [stored] - Stored hash; defaults to value from localStorage.
 * @returns {Promise<boolean|null>} true if match, false if wrong, null if old format.
 */
async function verifyPin(pin, stored) {
  const s = stored !== undefined ? stored : getStoredPinHash();
  if (!s) return false;
  if (!s.includes(":")) return null; // old SHA-256 format — migration required
  const [saltHex, hashHex] = s.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256
  );
  const newHash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return newHash === hashHex;
}

/**
 * Hashes the given PIN and persists it to localStorage under the user-scoped key.
 * @param {string} pin - The 4-digit PIN to store.
 * @returns {Promise<void>}
 */
async function storePin(pin) { localStorage.setItem(_pinKey(), await hashPin(pin)); }

export function PinGate({ onSuccess, onCancel, isSetup = false }) {
  const { t } = useTheme();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(() => {
    if (isSetup) return "create";
    const stored = getStoredPinHash();
    if (stored && !stored.includes(":")) return "migrate";
    return "enter";
  });
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, [step]);

  const doShake = () => { setShake(true); setTimeout(() => setShake(false), 380); };

  const handleSubmit = async () => {
    if (step === "enter") {
      const result = await verifyPin(pin);
      if (result === true) { onSuccess(); }
      else { setPin(""); setError("Wrong PIN — try again"); doShake(); }
    } else if (step === "migrate") {
      // Verify against old SHA-256 hash, then re-store with PBKDF2 to complete migration
      const oldStored = getStoredPinHash();
      const legacyOk = await _legacyVerifyPin(pin, oldStored);
      if (!legacyOk) { setPin(""); setError("Wrong PIN — try again"); doShake(); return; }
      await storePin(pin);
      onSuccess();
    } else if (step === "create") {
      if (pin.length !== 4) { setError("Must be 4 digits"); doShake(); return; }
      setError(""); setStep("confirm");
    } else {
      if (pin !== confirmPin) { setConfirmPin(""); setError("PINs don't match"); doShake(); return; }
      await storePin(pin); onSuccess();
    }
  };

  const titles = { enter: "Sensitive Info", create: "Set Security PIN", confirm: "Confirm PIN", migrate: "Security Upgrade" };
  const subs = { enter: "Enter your PIN to view this response", create: "Choose a 4-digit PIN to protect sensitive responses", confirm: "Re-enter your PIN to confirm", migrate: "Security upgrade required — please re-enter your PIN to continue" };
  const btnLabel = { enter: "Unlock", create: "Next", confirm: "Set PIN", migrate: "Upgrade & Unlock" };

  return (
    <>
      <style>{`@keyframes pinShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 /* z-index scale: PinGate=9999, Onboarding=3000, DetailModal=1000 */, backdropFilter: "blur(4px)" }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
        <div style={{ background: t.surface, borderRadius: 20, padding: "24px 20px", width: "100%", maxWidth: 300, border: `1px solid ${t.border}`, animation: shake ? "pinShake 0.38s ease" : "none", boxSizing: "border-box" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>🔒</div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.text }}>{titles[step]}</h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: t.textDim }}>{subs[step]}</p>
          </div>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={step === "confirm" ? confirmPin : pin}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              if (step === "confirm") setConfirmPin(v); else setPin(v);
              setError("");
            }}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="• • • •"
            style={{ width: "100%", padding: "14px", background: t.bg, border: `1px solid ${error ? "#FF6B35" : t.border}`, borderRadius: 12, color: t.textSoft, fontSize: 22, textAlign: "center", letterSpacing: 10, outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
          />
          {error && <p style={{ margin: "8px 0 0", fontSize: 11, color: "#FF6B35", textAlign: "center" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: 11, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textDim, cursor: "pointer", fontSize: 13 }}>Cancel</button>
            <button onClick={handleSubmit} style={{ flex: 1, padding: 11, background: "#4ECDC4", border: "none", borderRadius: 10, color: "#0f0f23", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{btnLabel[step]}</button>
          </div>
        </div>
      </div>
    </>
  );
}
