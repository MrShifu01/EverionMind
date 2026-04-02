import { useState } from "react";
import { supabase } from "./lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSend = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0f0f23", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 380, background: "#13132a",
        borderRadius: 16, padding: 40, border: "1px solid #2a2a4a",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#EAEAEA", margin: 0 }}>OpenBrain</h1>
          <p style={{ color: "#666", fontSize: 14, marginTop: 8 }}>Your personal memory OS</p>
        </div>

        {sent ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📬</div>
            <p style={{ color: "#4ECDC4", fontWeight: 600, marginBottom: 8 }}>Check your email</p>
            <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6 }}>
              Magic link sent to <strong style={{ color: "#EAEAEA" }}>{email}</strong>.
              Click it to sign in — no password needed.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend}>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 8, fontWeight: 600, letterSpacing: "0.05em" }}>
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                width: "100%", padding: "12px 16px", background: "#0f0f23",
                border: "1px solid #2a2a4a", borderRadius: 10, color: "#EAEAEA",
                fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 16,
              }}
            />
            {error && (
              <p style={{ color: "#FF6B35", fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !email}
              style={{
                width: "100%", padding: "13px", background: loading || !email ? "#1a1a3a" : "#4ECDC4",
                border: "none", borderRadius: 10, color: loading || !email ? "#555" : "#0f0f23",
                fontSize: 15, fontWeight: 700, cursor: loading || !email ? "default" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
