import { useState, type JSX } from "react";
import { supabase } from "./lib/supabase";
import { Brain, Cpu, Network, Shield, ArrowRight, RefreshCw, Mail } from "lucide-react";

interface Feature {
  Icon: React.ElementType;
  color: string;
  label: string;
  desc: string;
}

const FEATURES: Feature[] = [
  {
    Icon: Brain,
    color: "#72eff5",
    label: "Personal brain",
    desc: "Identity, health, finances, documents — always findable",
  },
  {
    Icon: Network,
    color: "#8b5cf6",
    label: "Family brain",
    desc: "Household info, kids' schools, emergency contacts — shared with the people that matter",
  },
  {
    Icon: Cpu,
    color: "#ff9ac3",
    label: "Business brain",
    desc: "Suppliers, staff, SOPs, licences — your whole operation in one place",
  },
  {
    Icon: Shield,
    color: "#72eff5",
    label: "AI that thinks for you",
    desc: "Classify, connect, remind, surface — not just store",
  },
];

function toFriendlyError(msg: string): string {
  if (msg.toLowerCase().includes("database error saving new user")) {
    return "Account setup failed. Please try again in a moment.";
  }
  return msg;
}

export default function LoginScreen(): JSX.Element {
  const [email, setEmail] = useState<string>("");
  const [sent, setSent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
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
    if (error) setError(toFriendlyError(error.message));
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
    setLoading(false);
  };

  const isDisabled = loading || !email;
  const isOtpDisabled = verifying || otpCode.length < 6 || otpCode.length > 8;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#0e0e0e",
        color: "#ffffff",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* Atmospheric background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage:
            "radial-gradient(circle at 20% 25%, rgba(114,239,245,0.09) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(139,92,246,0.09) 0%, transparent 50%)",
        }}
      />

      {/* ── DESKTOP: two-column layout ── */}
      <div
        className="login-two-col"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
        }}
      >
        {/* LEFT PANEL — branding + features */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "clamp(40px, 6vw, 80px) clamp(32px, 5vw, 72px)",
            borderRight: "1px solid rgba(72,72,71,0.15)",
          }}
        >
          {/* Logo + Brand */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ position: "relative", display: "inline-flex", marginBottom: 28 }}>
              <div
                style={{
                  position: "absolute",
                  inset: -24,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(114,239,245,0.12) 0%, rgba(139,92,246,0.06) 50%, transparent 70%)",
                  filter: "blur(16px)",
                }}
              />
              <div
                style={{
                  position: "relative",
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(38,38,38,0.7)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(114,239,245,0.25)",
                  boxShadow: "0 0 32px rgba(114,239,245,0.08)",
                }}
              >
                <Brain size={44} style={{ color: "#72eff5", filter: "drop-shadow(0 0 10px rgba(114,239,245,0.5))" }} />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    border: "1px solid rgba(114,239,245,0.12)",
                    transform: "scale(1.18)",
                    animation: "pulse 2.5s ease-in-out infinite",
                  }}
                />
              </div>
            </div>

            <h1
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "clamp(2.5rem, 4vw, 3.5rem)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                margin: "0 0 12px",
                lineHeight: 1.1,
              }}
            >
              Open
              <span
                style={{
                  background: "linear-gradient(135deg, #72eff5 0%, #8b5cf6 50%, #ff9ac3 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Brain
              </span>
            </h1>

            <p style={{ fontSize: 17, fontWeight: 600, color: "#72eff5", margin: "0 0 8px" }}>
              Your second brain — for you, your family, your business.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.65, color: "#777575", margin: 0, maxWidth: 460 }}>
              Capture everything. Connect the dots. Ask anything.
              One AI-powered memory OS that grows with your life.
            </p>
          </div>

          {/* Feature grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
              maxWidth: 540,
            }}
          >
            {FEATURES.map((f) => (
              <div
                key={f.label}
                style={{
                  borderRadius: 16,
                  padding: "18px 16px",
                  background: "rgba(38,38,38,0.6)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(72,72,71,0.18)",
                  transition: "border-color 0.2s, transform 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = f.color + "40";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(72,72,71,0.18)";
                  (e.currentTarget as HTMLDivElement).style.transform = "none";
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: f.color + "18",
                    border: `1px solid ${f.color}30`,
                    marginBottom: 10,
                  }}
                >
                  <f.Icon size={18} style={{ color: f.color }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", fontFamily: "'Manrope', sans-serif", marginBottom: 4 }}>
                  {f.label}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: "#777575" }}>{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Privacy note */}
          <p style={{ marginTop: 20, fontSize: 12, color: "#484847", maxWidth: 460 }}>
            <span style={{ color: "#777575" }}>Your data is yours.</span> Export everything, delete everything. No lock-in. Built on Supabase + Claude AI.
          </p>
        </div>

        {/* RIGHT PANEL — login form */}
        <div
          style={{
            width: "clamp(340px, 40vw, 520px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(40px, 5vw, 64px) clamp(32px, 4vw, 56px)",
          }}
        >
          <div style={{ width: "100%", maxWidth: 380 }}>

            {/* Form header */}
            {!sent && (
              <div style={{ marginBottom: 32, textAlign: "center" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(139,92,246,0.12)",
                    border: "1px solid rgba(139,92,246,0.25)",
                    margin: "0 auto 16px",
                  }}
                >
                  <Mail size={24} style={{ color: "#8b5cf6" }} />
                </div>
                <h2
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    margin: "0 0 6px",
                    color: "#ffffff",
                  }}
                >
                  {showForm ? "Enter your email" : "Sign in to OpenBrain"}
                </h2>
                <p style={{ fontSize: 13, color: "#777575", margin: 0 }}>
                  {showForm ? "We'll send you a magic link to sign in" : "No password needed"}
                </p>
              </div>
            )}

            {/* ── CTA (pre-form) ── */}
            {!showForm && !sent && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  onClick={() => setShowForm(true)}
                  className="group"
                  style={{
                    position: "relative",
                    width: "100%",
                    height: 52,
                    borderRadius: 14,
                    border: "none",
                    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                    color: "#ffffff",
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: "'Manrope', sans-serif",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 0 32px rgba(139,92,246,0.25), 0 4px 16px rgba(0,0,0,0.3)",
                    transition: "transform 0.15s, box-shadow 0.15s",
                    overflow: "hidden",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 40px rgba(139,92,246,0.35), 0 8px 24px rgba(0,0,0,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "none";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 32px rgba(139,92,246,0.25), 0 4px 16px rgba(0,0,0,0.3)";
                  }}
                >
                  Start free
                  <ArrowRight size={18} />
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 1, background: "rgba(72,72,71,0.3)" }} />
                  <span style={{ fontSize: 12, color: "#484847" }}>or</span>
                  <div style={{ flex: 1, height: 1, background: "rgba(72,72,71,0.3)" }} />
                </div>

                <p style={{ textAlign: "center", fontSize: 12, color: "#484847", margin: 0 }}>
                  No password needed — sign in with email
                </p>
              </div>
            )}

            {/* ── Email form ── */}
            {showForm && !sent && (
              <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      color: "#adaaaa",
                      marginBottom: 6,
                    }}
                  >
                    Email Node
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="neural@email.com"
                    required
                    autoFocus
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid rgba(72,72,71,0.3)",
                      background: "#1a1919",
                      color: "#ffffff",
                      fontSize: 15,
                      padding: "13px 16px",
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "'Inter', sans-serif",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(114,239,245,0.6)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(114,239,245,0.08)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                {error && <p style={{ color: "#ff6e84", fontSize: 13, margin: 0 }}>{error}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      border: "1px solid rgba(72,72,71,0.3)",
                      background: "#1a1919",
                      color: "#adaaaa",
                      fontSize: 14,
                      padding: "12px",
                      cursor: "pointer",
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isDisabled}
                    style={{
                      flex: 2,
                      borderRadius: 12,
                      border: "none",
                      background: isDisabled ? "#262626" : "linear-gradient(135deg, #72eff5, #1fb1b7)",
                      color: isDisabled ? "#777575" : "#0a0a0a",
                      fontSize: 14,
                      fontWeight: 700,
                      padding: "12px",
                      cursor: isDisabled ? "default" : "pointer",
                      opacity: isDisabled ? 0.5 : 1,
                      fontFamily: "'Manrope', sans-serif",
                      transition: "opacity 0.2s",
                    }}
                  >
                    {loading ? "Sending…" : "Send access code"}
                  </button>
                </div>
              </form>
            )}

            {/* ── OTP verification ── */}
            {sent && (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(114,239,245,0.1)",
                    border: "1px solid rgba(114,239,245,0.2)",
                    margin: "0 auto 20px",
                  }}
                >
                  <RefreshCw size={28} style={{ color: "#72eff5" }} />
                </div>
                <h2
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#72eff5",
                    margin: "0 0 8px",
                  }}
                >
                  Check your email
                </h2>
                <p style={{ fontSize: 13, color: "#adaaaa", lineHeight: 1.6, margin: "0 0 24px" }}>
                  Sent to <strong style={{ color: "#ffffff" }}>{email}</strong>.<br />
                  Enter the code or tap the magic link.
                </p>

                <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        color: "#adaaaa",
                        marginBottom: 6,
                        textAlign: "left",
                      }}
                    >
                      Access Key
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="000000"
                      autoFocus
                      style={{
                        width: "100%",
                        borderRadius: 12,
                        border: "1px solid rgba(72,72,71,0.3)",
                        background: "#1a1919",
                        color: "#ffffff",
                        fontSize: 28,
                        fontWeight: 700,
                        padding: "14px 16px",
                        outline: "none",
                        textAlign: "center",
                        letterSpacing: 8,
                        fontFamily: "monospace",
                        boxSizing: "border-box",
                        transition: "border-color 0.2s",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(114,239,245,0.6)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)"; }}
                    />
                  </div>

                  {error && <p style={{ color: "#ff6e84", fontSize: 13, margin: 0 }}>{error}</p>}

                  <button
                    type="submit"
                    disabled={isOtpDisabled}
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "none",
                      background: isOtpDisabled ? "#262626" : "linear-gradient(135deg, #72eff5, #1fb1b7)",
                      color: isOtpDisabled ? "#777575" : "#0a0a0a",
                      fontSize: 14,
                      fontWeight: 700,
                      padding: "13px",
                      cursor: isOtpDisabled ? "default" : "pointer",
                      opacity: isOtpDisabled ? 0.5 : 1,
                      fontFamily: "'Manrope', sans-serif",
                    }}
                  >
                    {verifying ? "Verifying…" : "Sync to Neural Network"}
                  </button>
                </form>

                <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
                  <button
                    onClick={handleResend}
                    disabled={loading}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#72eff5",
                      fontSize: 13,
                      cursor: "pointer",
                      padding: "4px 8px",
                    }}
                  >
                    {loading ? "Sending…" : "Resend code"}
                  </button>
                  <button
                    onClick={() => { setSent(false); setOtpCode(""); setError(null); }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#777575",
                      fontSize: 13,
                      cursor: "pointer",
                      padding: "4px 8px",
                    }}
                  >
                    Use different email
                  </button>
                </div>
              </div>
            )}

            {/* Security badges */}
            {!sent && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 20,
                  marginTop: 28,
                  paddingTop: 20,
                  borderTop: "1px solid rgba(72,72,71,0.15)",
                }}
              >
                {["PROTOCOL", "ENCRYPTED", "NO LOCK-IN"].map((badge) => (
                  <span key={badge} style={{ fontSize: 10, fontWeight: 600, color: "#484847", letterSpacing: "0.1em" }}>
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @media (max-width: 768px) {
          .login-two-col {
            flex-direction: column !important;
            min-height: auto !important;
          }
          .login-two-col > div:first-child {
            border-right: none !important;
            border-bottom: 1px solid rgba(72,72,71,0.15) !important;
          }
          .login-two-col > div:last-child {
            width: 100% !important;
            padding: 40px 24px !important;
          }
        }
      `}</style>
    </div>
  );
}
