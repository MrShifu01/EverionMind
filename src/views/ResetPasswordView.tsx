import { useState } from "react";
import { supabase } from "../lib/supabase";

interface Props {
  onDone: () => void;
}

export default function ResetPasswordView({ onDone }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(onDone, 1500);
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background, #0e0e0e)",
        fontFamily: "var(--f-sans)",
        padding: "0 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <h1
          className="f-serif"
          style={{ fontSize: 28, fontWeight: 450, margin: "0 0 8px", letterSpacing: "-0.015em", color: "var(--ink, #f0ede6)" }}
        >
          Set a new password
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-faint, #888)", margin: "0 0 28px" }}>
          Choose a password you'll use to sign in.
        </p>

        {done ? (
          <p style={{ color: "var(--ember, #e86c2c)", fontSize: 15, fontWeight: 600 }}>
            Password updated — redirecting…
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={inputStyle}
            />
            {error && (
              <p style={{ fontSize: 13, color: "var(--blood, #e05555)", margin: 0 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              style={{
                height: 44,
                borderRadius: 10,
                border: "none",
                background: busy ? "var(--surface-high, #2a2a2a)" : "var(--ember, #e86c2c)",
                color: busy ? "var(--ink-faint, #888)" : "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
                transition: "background 180ms",
              }}
            >
              {busy ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 44,
  borderRadius: 10,
  border: "1px solid var(--line-soft, #333)",
  background: "var(--surface-low, #161616)",
  color: "var(--ink, #f0ede6)",
  fontSize: 15,
  padding: "0 14px",
  outline: "none",
};
