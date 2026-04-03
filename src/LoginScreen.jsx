import { useState } from "react";
import { supabase } from "./lib/supabase";
import { useTheme } from "./ThemeContext";

const FEATURES = [
  { ic: "🧠", label: "Personal brain", desc: "Identity, health, finances, documents — always findable" },
  { ic: "🏠", label: "Family brain", desc: "Household info, kids' schools, emergency contacts — shared with the people that matter" },
  { ic: "🏪", label: "Business brain", desc: "Suppliers, staff, SOPs, licences — your whole operation in one place" },
  { ic: "✨", label: "AI that thinks for you", desc: "Classify, connect, remind, surface — not just store" },
];

export default function LoginScreen() {
  const { t } = useTheme();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

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
      minHeight: "100vh", background: t.bg, color: t.text,
      fontFamily: "'Söhne', system-ui, -apple-system, sans-serif",
    }}>
      {/* Hero */}
      <div style={{
        maxWidth: 540, margin: "0 auto", padding: "60px 24px 0",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🧠</div>
        <h1 style={{ margin: "0 0 12px", fontSize: 36, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, color: t.text }}>
          OpenBrain
        </h1>
        <p style={{ margin: "0 0 8px", fontSize: 18, color: "#4ECDC4", fontWeight: 600 }}>
          Your second brain — for you, your family, your business.
        </p>
        <p style={{ margin: "0 0 32px", fontSize: 14, color: t.textDim, lineHeight: 1.6 }}>
          Capture everything. Connect the dots. Ask anything.<br />
          One AI-powered memory OS that grows with your life.
        </p>

        {/* CTA */}
        {!showForm && !sent && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: "14px 36px",
              background: "linear-gradient(135deg, #4ECDC4, #45B7D1)",
              border: "none", borderRadius: 14,
              color: "#0f0f23", fontSize: 16, fontWeight: 800,
              cursor: "pointer", marginBottom: 10,
              boxShadow: "0 4px 24px #4ECDC440",
            }}
          >
            Start free →
          </button>
        )}
        {!showForm && !sent && (
          <p style={{ fontSize: 12, color: t.textFaint, margin: 0 }}>No password needed — magic link sign in</p>
        )}

        {/* Email form */}
        {showForm && !sent && (
          <form onSubmit={handleSend} style={{ maxWidth: 360, margin: "0 auto" }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
              style={{
                width: "100%", padding: "13px 16px", background: t.surface,
                border: `1px solid ${t.border}`, borderRadius: 12, color: t.text,
                fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 10,
              }}
            />
            {error && <p style={{ color: "#FF6B35", fontSize: 13, marginBottom: 10 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: "12px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textMuted, fontSize: 14, cursor: "pointer" }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !email}
                style={{
                  flex: 2, padding: "12px",
                  background: loading || !email ? t.surface : "linear-gradient(135deg, #4ECDC4, #45B7D1)",
                  border: "none", borderRadius: 10,
                  color: loading || !email ? t.textFaint : "#0f0f23",
                  fontSize: 14, fontWeight: 700,
                  cursor: loading || !email ? "default" : "pointer",
                }}
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </div>
            <p style={{ fontSize: 12, color: t.textFaint, marginTop: 8 }}>No password — just click the link in your email</p>
          </form>
        )}

        {sent && (
          <div style={{ maxWidth: 360, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📬</div>
            <p style={{ color: "#4ECDC4", fontWeight: 700, marginBottom: 8, fontSize: 16 }}>Check your email</p>
            <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              Magic link sent to <strong style={{ color: t.text }}>{email}</strong>.<br />
              Click it to sign in — no password needed.
            </p>
          </div>
        )}
      </div>

      {/* Feature grid */}
      <div style={{ maxWidth: 540, margin: "48px auto 0", padding: "0 24px 60px" }}>
        <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 400 ? "1fr" : "1fr 1fr", gap: 12 }}>
          {FEATURES.map(f => (
            <div key={f.label} style={{
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderRadius: 14, padding: "18px 16px",
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{f.ic}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 12, color: t.textDim, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 32, padding: "20px 24px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: t.textDim, lineHeight: 1.6 }}>
            <strong style={{ color: t.textMuted }}>Your data is yours.</strong> Export everything, delete everything. No lock-in.<br />
            Built on Supabase + Claude AI.
          </p>
        </div>
      </div>
    </div>
  );
}
