import { useState } from "react";
import { getStoredPinHash, verifyPin, setupPin, clearStoredPin } from "../../lib/pin";
import SettingsRow from "./SettingsRow";

type Mode = "idle" | "create-new" | "create-confirm" | "change-verify" | "change-new" | "change-confirm" | "busy";

export default function SecurityTab() {
  const [mode, setMode] = useState<Mode>("idle");
  const [pin, setPin] = useState("");
  const [savedPin, setSavedPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const hasPin = !!getStoredPinHash();

  function reset(msg?: string) {
    setMode("idle");
    setPin("");
    setSavedPin("");
    setError("");
    if (msg) { setSuccess(msg); setTimeout(() => setSuccess(""), 3000); }
  }

  async function handleSubmit() {
    if (mode === "create-new") {
      if (pin.length !== 4) { setError("Must be 4 digits"); return; }
      setSavedPin(pin); setPin(""); setError(""); setMode("create-confirm");
    } else if (mode === "create-confirm") {
      if (pin !== savedPin) { setPin(""); setError("PINs don't match"); return; }
      setMode("busy");
      await setupPin(savedPin);
      reset("PIN set successfully");
    } else if (mode === "change-verify") {
      if (pin.length !== 4) { setError("Must be 4 digits"); return; }
      setMode("busy");
      const ok = await verifyPin(pin);
      if (!ok) { setPin(""); setError("Wrong PIN"); setMode("change-verify"); return; }
      setSavedPin(""); setPin(""); setError(""); setMode("change-new");
    } else if (mode === "change-new") {
      if (pin.length !== 4) { setError("Must be 4 digits"); return; }
      setSavedPin(pin); setPin(""); setError(""); setMode("change-confirm");
    } else if (mode === "change-confirm") {
      if (pin !== savedPin) { setPin(""); setError("PINs don't match"); return; }
      setMode("busy");
      await setupPin(savedPin);
      reset("PIN changed successfully");
    }
  }

  function handleRemove() {
    clearStoredPin();
    reset("PIN removed");
  }

  const titles: Partial<Record<Mode, string>> = {
    "create-new": "Choose a 4-digit PIN",
    "create-confirm": "Confirm your PIN",
    "change-verify": "Enter your current PIN",
    "change-new": "Choose a new 4-digit PIN",
    "change-confirm": "Confirm your new PIN",
  };
  const btnLabels: Partial<Record<Mode, string>> = {
    "create-new": "Next",
    "create-confirm": "Set PIN",
    "change-verify": "Next",
    "change-new": "Next",
    "change-confirm": "Update PIN",
  };

  const isForm = mode !== "idle" && mode !== "busy";

  return (
    <div className="space-y-4">
      <SettingsRow
        label="Vault PIN"
        hint={hasPin ? "A 4-digit PIN protects your vault secrets." : "No PIN set. Add one to protect your vault."}
      >
        {!hasPin && mode === "idle" && (
          <button onClick={() => { setMode("create-new"); setError(""); }} style={primBtn}>
            Set PIN
          </button>
        )}
        {hasPin && mode === "idle" && (
          <div className="flex gap-2">
            <button onClick={() => { setMode("change-verify"); setError(""); }} style={secBtn}>Change</button>
            <button onClick={handleRemove} style={dangerBtn}>Remove</button>
          </div>
        )}
      </SettingsRow>

      {isForm && (
        <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--ink)", fontFamily: "var(--f-sans)" }}>
            {titles[mode]}
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") reset(); }}
            placeholder="• • • •"
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: "0.75rem",
              border: `1px solid ${error ? "var(--blood)" : "var(--line-soft)"}`,
              background: "var(--surface-low)",
              color: "var(--ink)",
              padding: "0.75rem",
              textAlign: "center",
              fontFamily: "monospace",
              fontSize: "1.375rem",
              letterSpacing: "10px",
              outline: "none",
            }}
          />
          {error && <p className="text-xs text-center" style={{ color: "var(--blood)" }}>{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => reset()} style={secBtn}>Cancel</button>
            <button onClick={handleSubmit} style={primBtn}>{btnLabels[mode]}</button>
          </div>
        </div>
      )}

      {mode === "busy" && (
        <p className="text-sm text-center" style={{ color: "var(--ink-faint)" }}>Saving…</p>
      )}

      {success && (
        <p className="text-sm text-center" style={{ color: "var(--moss)" }}>{success}</p>
      )}
    </div>
  );
}

const primBtn: React.CSSProperties = {
  cursor: "pointer", borderRadius: 8, border: "none", padding: "7px 16px",
  fontSize: 13, fontWeight: 700, background: "var(--ember)", color: "var(--ember-ink)",
};
const secBtn: React.CSSProperties = {
  cursor: "pointer", borderRadius: 8, border: "1px solid var(--line-soft)", padding: "7px 16px",
  fontSize: 13, background: "var(--surface)", color: "var(--ink-soft)",
};
const dangerBtn: React.CSSProperties = {
  cursor: "pointer", borderRadius: 8, border: "1px solid var(--blood)", padding: "7px 16px",
  fontSize: 13, background: "transparent", color: "var(--blood)",
};
