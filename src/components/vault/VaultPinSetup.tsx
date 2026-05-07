// First-time PIN + biometric enrollment. Shown right after the user
// unlocks with their passphrase, IF the PIN/biometric flag is on AND
// no PIN record exists yet on this device.
//
// Skippable — user can dismiss and keep using passphrase forever.

import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { isValidPin } from "../../lib/vaultPinKey";
import { isBiometricAvailable } from "../../lib/biometric";

const PIN_LENGTH = 6;

export function VaultPinSetup({
  busy,
  error,
  onSubmit,
  onSkip,
}: {
  busy: boolean;
  error: string;
  onSubmit: (params: { pin: string; enableBiometric: boolean }) => void;
  onSkip: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"create" | "confirm">("create");
  const [bioAvailable, setBioAvailable] = useState(false);
  const [enableBio, setEnableBio] = useState(true);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable);
  }, []);

  const onPinChange = (raw: string, kind: "create" | "confirm") => {
    const digits = raw.replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (kind === "create") setPin(digits);
    else setConfirm(digits);
    setLocalError("");
  };

  const proceedToConfirm = () => {
    if (!isValidPin(pin)) {
      setLocalError("PIN must be 4–8 digits.");
      return;
    }
    setStep("confirm");
  };

  const submit = () => {
    if (pin !== confirm) {
      setLocalError("PINs don't match.");
      return;
    }
    onSubmit({ pin, enableBiometric: bioAvailable && enableBio });
  };

  const displayedError = localError || error;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <h2
            className="f-serif"
            style={{
              fontSize: 28,
              fontWeight: 400,
              color: "var(--ink)",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            quick unlock setup.
          </h2>
          <p
            className="f-serif"
            style={{
              fontSize: 15,
              color: "var(--ink-soft)",
              fontStyle: "italic",
              margin: "10px 0 28px",
              lineHeight: 1.5,
            }}
          >
            set a 4-8 digit PIN for quick unlock on this device. your passphrase remains the
            encryption key.
            {bioAvailable && " biometric optional."}
          </p>

          {step === "create" && (
            <>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                value={pin}
                onChange={(e) => onPinChange(e.target.value, "create")}
                placeholder="••••••"
                autoComplete="off"
                aria-label="New PIN"
                className="design-input"
                style={{
                  height: 48,
                  fontSize: 18,
                  textAlign: "center",
                  letterSpacing: "0.4em",
                  fontFamily: "var(--f-mono)",
                }}
              />
              {bioAvailable && (
                <label
                  className="f-sans"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    fontSize: 13,
                    color: "var(--ink-soft)",
                    marginTop: 14,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enableBio}
                    onChange={(e) => setEnableBio(e.target.checked)}
                  />
                  also enable biometric (Face ID / Touch ID / Windows Hello)
                </label>
              )}
              {displayedError && (
                <p
                  className="f-serif"
                  style={{
                    fontSize: 14,
                    fontStyle: "italic",
                    color: "var(--blood)",
                    marginTop: 10,
                  }}
                >
                  {displayedError}
                </p>
              )}
              <Button
                onClick={proceedToConfirm}
                disabled={!isValidPin(pin)}
                size="lg"
                className="mt-4 w-full"
              >
                Continue
              </Button>
            </>
          )}

          {step === "confirm" && (
            <>
              <p
                className="f-sans"
                style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 12px" }}
              >
                Confirm your PIN.
              </p>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                value={confirm}
                onChange={(e) => onPinChange(e.target.value, "confirm")}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="••••••"
                autoComplete="off"
                aria-label="Confirm PIN"
                className="design-input"
                style={{
                  height: 48,
                  fontSize: 18,
                  textAlign: "center",
                  letterSpacing: "0.4em",
                  fontFamily: "var(--f-mono)",
                }}
              />
              {displayedError && (
                <p
                  className="f-serif"
                  style={{
                    fontSize: 14,
                    fontStyle: "italic",
                    color: "var(--blood)",
                    marginTop: 10,
                  }}
                >
                  {displayedError}
                </p>
              )}
              <Button
                onClick={submit}
                disabled={busy || confirm.length < 4}
                size="lg"
                className="mt-4 w-full"
              >
                {busy ? "saving…" : "Enable quick unlock"}
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setStep("create");
                  setConfirm("");
                  setLocalError("");
                }}
                className="mt-2"
              >
                back
              </Button>
            </>
          )}

          <Button
            variant="link"
            size="sm"
            onClick={onSkip}
            disabled={busy}
            className="mt-3 italic"
            style={{ color: "var(--ink-faint)", fontFamily: "var(--f-serif)" }}
          >
            skip — keep using passphrase
          </Button>
        </div>
      </div>
    </div>
  );
}
