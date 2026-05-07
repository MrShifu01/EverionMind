import { useState } from "react";
import { getStoredPinHash, verifyPin, setupPin, clearStoredPin } from "../../lib/pin";
import SettingsRow from "./SettingsRow";
import { Button } from "../ui/button";
import { AppLockSection } from "./AppLockSection";

type Mode =
  | "idle"
  | "create-new"
  | "create-confirm"
  | "change-verify"
  | "change-new"
  | "change-confirm"
  | "busy";

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
    if (msg) {
      setSuccess(msg);
      setTimeout(() => setSuccess(""), 3000);
    }
  }

  async function handleSubmit() {
    if (mode === "create-new") {
      if (pin.length !== 4) {
        setError("Must be 4 digits");
        return;
      }
      setSavedPin(pin);
      setPin("");
      setError("");
      setMode("create-confirm");
    } else if (mode === "create-confirm") {
      if (pin !== savedPin) {
        setPin("");
        setError("PINs don't match");
        return;
      }
      setMode("busy");
      await setupPin(savedPin);
      reset("PIN set successfully");
    } else if (mode === "change-verify") {
      if (pin.length !== 4) {
        setError("Must be 4 digits");
        return;
      }
      setMode("busy");
      const ok = await verifyPin(pin);
      if (!ok) {
        setPin("");
        setError("Wrong PIN");
        setMode("change-verify");
        return;
      }
      setSavedPin("");
      setPin("");
      setError("");
      setMode("change-new");
    } else if (mode === "change-new") {
      if (pin.length !== 4) {
        setError("Must be 4 digits");
        return;
      }
      setSavedPin(pin);
      setPin("");
      setError("");
      setMode("change-confirm");
    } else if (mode === "change-confirm") {
      if (pin !== savedPin) {
        setPin("");
        setError("PINs don't match");
        return;
      }
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
        hint={
          hasPin
            ? "A 4-digit PIN is a quick app lock for this device. Your vault encryption still depends on your passphrase."
            : "No PIN set. Add one for quick app unlock on this device."
        }
      >
        {!hasPin && mode === "idle" && (
          <Button
            size="sm"
            onClick={() => {
              setMode("create-new");
              setError("");
            }}
          >
            Set PIN
          </Button>
        )}
        {hasPin && mode === "idle" && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMode("change-verify");
                setError("");
              }}
            >
              Change
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              style={{ color: "var(--blood)", borderColor: "var(--blood)" }}
            >
              Remove
            </Button>
          </div>
        )}
      </SettingsRow>

      {isForm && (
        <div
          className="space-y-3 rounded-2xl border p-4"
          style={{ background: "var(--surface)", borderColor: "var(--line-soft)" }}
        >
          <p
            className="text-sm font-medium"
            style={{ color: "var(--ink)", fontFamily: "var(--f-sans)" }}
          >
            {titles[mode]}
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") reset();
            }}
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
          {error && (
            <p className="text-center text-xs" style={{ color: "var(--blood)" }}>
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => reset()}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit}>
              {btnLabels[mode]}
            </Button>
          </div>
        </div>
      )}

      {mode === "busy" && (
        <p className="text-center text-sm" style={{ color: "var(--ink-faint)" }}>
          Saving…
        </p>
      )}

      {success && (
        <p className="text-center text-sm" style={{ color: "var(--moss)" }}>
          {success}
        </p>
      )}

      <AppLockSection />
    </div>
  );
}
