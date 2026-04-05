import { useState, type JSX } from "react";
import { supabase } from "./lib/supabase";
import { useTheme } from "./ThemeContext";

interface Feature {
  ic: string;
  label: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { ic: "🧠", label: "Personal brain", desc: "Identity, health, finances, documents — always findable" },
  { ic: "🏠", label: "Family brain", desc: "Household info, kids' schools, emergency contacts — shared with the people that matter" },
  { ic: "🏪", label: "Business brain", desc: "Suppliers, staff, SOPs, licences — your whole operation in one place" },
  { ic: "✨", label: "AI that thinks for you", desc: "Classify, connect, remind, surface — not just store" },
];

export default function LoginScreen(): JSX.Element {
  const { t } = useTheme();
  const [email, setEmail] = useState<string>("");
  const [sent, setSent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  // OTP code entry
  const [otpCode, setOtpCode] = useState<string>("");
  const [verifying, setVerifying] = useState<boolean>(false);

  const handleSend = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
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

  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setVerifying(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode.trim(),
      type: "magiclink",
    });
    if (error) setError(error.message);
    // If successful, onAuthStateChange in App.jsx will pick up the session
    setVerifying(false);
  };

  const handleResend = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setOtpCode("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setError(null);
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "13px 16px", background: t.surface,
    border: `1px solid ${t.border}`, borderRadius: 12, color: t.text,
    fontSize: 15, outline: "none", boxSizing: "border-box",
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
          <p style={{ fontSize: 12, color: t.textFaint, margin: 0 }}>No password needed — sign in with email</p>
        )}

        {/* Email form */}
        {showForm && !sent && (
          <form onSubmit={handleSend} style={{ maxWidth: 360, margin: "0 auto" }}>
            <input
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
              style={{ ...inputStyle, marginBottom: 10 }}
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
                {loading ? "Sending…" : "Send code"}
              </button>
            </div>
            <p style={{ fontSize: 12, color: t.textFaint, marginTop: 8 }}>We'll email you a code to sign in</p>
          </form>
        )}

        {/* OTP verification */}
        {sent && (
          <div style={{ maxWidth: 360, margin: "0 auto" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
            <p style={{ color: "#4ECDC4", fontWeight: 700, marginBottom: 4, fontSize: 16 }}>Check your email</p>
            <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>
              We sent a sign-in email to <strong style={{ color: t.text }}>{email}</strong>.<br />
              Enter the code from the email, or tap the magic link.
            </p>

            <form onSubmit={handleVerifyOtp}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Enter code"
                autoFocus
                style={{
                  ...inputStyle,
                  textAlign: "center", fontSize: 24, fontWeight: 700,
                  letterSpacing: 8, fontFamily: "monospace",
                  marginBottom: 10,
                }}
              />
              {error && <p style={{ color: "#FF6B35", fontSize: 13, marginBottom: 10 }}>{error}</p>}
              <button
                type="submit"
                disabled={verifying || otpCode.length < 6 || otpCode.length > 8}
                style={{
                  width: "100%", padding: "12px",
                  background: verifying || otpCode.length < 6 || otpCode.length > 8 ? t.surface : "linear-gradient(135deg, #4ECDC4, #45B7D1)",
                  border: "none", borderRadius: 10,
                  color: verifying || otpCode.length < 6 || otpCode.length > 8 ? t.textFaint : "#0f0f23",
                  fontSize: 14, fontWeight: 700,
                  cursor: verifying || otpCode.length < 6 || otpCode.length > 8 ? "default" : "pointer",
                  marginBottom: 12,
                }}
              >
                {verifying ? "Verifying…" : "Sign in with code"}
              </button>
            </form>

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={handleResend}
                disabled={loading}
                style={{ background: "none", border: "none", color: "#4ECDC4", fontSize: 13, cursor: "pointer", padding: "4px 8px" }}
              >
                {loading ? "Sending…" : "Resend code"}
              </button>
              <button
                onClick={() => { setSent(false); setOtpCode(""); setError(null); }}
                style={{ background: "none", border: "none", color: t.textFaint, fontSize: 13, cursor: "pointer", padding: "4px 8px" }}
              >
                Use different email
              </button>
            </div>
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
