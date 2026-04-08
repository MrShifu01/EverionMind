import { useState, type JSX } from "react";
import { supabase } from "./lib/supabase";
import { Brain, Cpu, Network, Shield, ArrowRight, RefreshCw, Mail } from "lucide-react";

interface Feature {
  Icon: React.ElementType;
  label: string;
  desc: string;
}

const FEATURES: Feature[] = [
  {
    Icon: Brain,
    label: "Personal brain",
    desc: "Identity, health, finances, documents — always findable",
  },
  {
    Icon: Network,
    label: "Family brain",
    desc: "Household info, kids' schools, emergency contacts — shared with the people that matter",
  },
  {
    Icon: Cpu,
    label: "Business brain",
    desc: "Suppliers, staff, SOPs, licences — your whole operation in one place",
  },
  {
    Icon: Shield,
    label: "Private by design",
    desc: "Classify, connect, remind, surface — not just store",
  },
];

const C = {
  bg:          "oklch(10% 0.004 230)",
  surface:     "oklch(16% 0.005 230)",
  container:   "oklch(20% 0.006 230)",
  highest:     "oklch(24% 0.006 230)",
  border:      "oklch(22% 0.006 230)",
  borderFaint: "oklch(16% 0.005 230)",
  text:        "oklch(96% 0.003 230)",
  textMuted:   "oklch(66% 0.007 225)",
  textFaint:   "oklch(48% 0.007 225)",
  primary:     "oklch(68% 0.09 75)",
  primaryDim:  "oklch(60% 0.09 75)",
  primaryBg:   "oklch(24% 0.05 75)",
  primaryText: "oklch(12% 0.05 75)",
  error:       "oklch(62% 0.18 25)",
};

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
        background: C.bg,
        color: C.text,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* ── DESKTOP: two-column layout ── */}
      <div
        className="login-two-col"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
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
            borderRight: `1px solid ${C.border}`,
          }}
        >
          {/* Logo + Brand */}
          <div style={{ marginBottom: 48 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: C.primaryBg,
                border: `1px solid ${C.border}`,
                marginBottom: 24,
              }}
            >
              <Brain size={24} style={{ color: C.primary }} />
            </div>

            <h1
              style={{
                fontFamily: "'Lora', Georgia, serif",
                fontSize: "clamp(2rem, 3.5vw, 3rem)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: "0 0 12px",
                lineHeight: 1.1,
                color: C.text,
              }}
            >
              Everion
            </h1>

            <p style={{ fontSize: 16, fontWeight: 500, color: C.primary, margin: "0 0 8px" }}>
              Your second brain — for you, your family, your business.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.textMuted, margin: 0, maxWidth: 440 }}>
              Capture everything. Connect the dots. Ask anything.
              One AI-powered memory system that grows with your life.
            </p>
          </div>

          {/* Feature list */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              maxWidth: 480,
            }}
          >
            {FEATURES.map((f) => (
              <div
                key={f.label}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: C.primaryBg,
                    border: `1px solid ${C.border}`,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <f.Icon size={15} style={{ color: C.primary }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: C.textMuted }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Privacy note */}
          <p style={{ marginTop: 32, fontSize: 12, color: C.textFaint, maxWidth: 440 }}>
            Your data is yours. Export everything, delete everything. No lock-in.
          </p>
        </div>

        {/* RIGHT PANEL — login form */}
        <div
          style={{
            width: "clamp(340px, 40vw, 500px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(40px, 5vw, 64px) clamp(32px, 4vw, 56px)",
          }}
        >
          <div style={{ width: "100%", maxWidth: 360 }}>

            {/* Form header */}
            {!sent && (
              <div style={{ marginBottom: 28 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: C.container,
                    border: `1px solid ${C.border}`,
                    marginBottom: 20,
                  }}
                >
                  <Mail size={20} style={{ color: C.textMuted }} />
                </div>
                <h2
                  style={{
                    fontFamily: "'Lora', Georgia, serif",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    margin: "0 0 6px",
                    color: C.text,
                  }}
                >
                  {showForm ? "Sign in" : "Welcome to Everion"}
                </h2>
                <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
                  {showForm ? "Enter your email and we'll send a sign-in link" : "No password needed"}
                </p>
              </div>
            )}

            {/* ── CTA (pre-form) ── */}
            {!showForm && !sent && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  onClick={() => setShowForm(true)}
                  style={{
                    width: "100%",
                    height: 48,
                    borderRadius: 10,
                    border: "none",
                    background: C.primary,
                    color: C.primaryText,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.primaryDim; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.primary; }}
                >
                  Get started
                  <ArrowRight size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.primary,
                    fontSize: 13,
                    cursor: "pointer",
                    textAlign: "center",
                    padding: "4px 0",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  Already have an account? Sign in
                </button>
              </div>
            )}

            {/* ── Email form ── */}
            {showForm && !sent && (
              <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label
                    htmlFor="login-email"
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 500,
                      color: C.textMuted,
                      marginBottom: 6,
                    }}
                  >
                    Email address
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    style={{
                      width: "100%",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: C.container,
                      color: C.text,
                      fontSize: 15,
                      padding: "11px 14px",
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
                  />
                </div>

                {error && <p style={{ color: C.error, fontSize: 13, margin: 0 }}>{error}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: "transparent",
                      color: C.textMuted,
                      fontSize: 14,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      transition: "color 0.15s",
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isDisabled}
                    style={{
                      flex: 2,
                      height: 44,
                      borderRadius: 8,
                      border: "none",
                      background: isDisabled ? C.highest : C.primary,
                      color: isDisabled ? C.textFaint : C.primaryText,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: isDisabled ? "default" : "pointer",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      transition: "background 0.15s",
                    }}
                  >
                    {loading ? "Sending…" : "Send sign-in link"}
                  </button>
                </div>
              </form>
            )}

            {/* ── OTP verification ── */}
            {sent && (
              <div>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: C.primaryBg,
                    border: `1px solid ${C.border}`,
                    marginBottom: 20,
                  }}
                >
                  <RefreshCw size={22} style={{ color: C.primary }} />
                </div>
                <h2
                  style={{
                    fontFamily: "'Lora', Georgia, serif",
                    fontSize: 20,
                    fontWeight: 700,
                    color: C.text,
                    margin: "0 0 8px",
                  }}
                >
                  Check your email
                </h2>
                <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, margin: "0 0 24px" }}>
                  Sent to <strong style={{ color: C.text }}>{email}</strong>.<br />
                  Enter the code or tap the sign-in link.
                </p>

                <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label
                      htmlFor="otp-code"
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 500,
                        color: C.textMuted,
                        marginBottom: 6,
                      }}
                    >
                      6-digit code
                    </label>
                    <input
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="000000"
                      autoFocus
                      style={{
                        width: "100%",
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        background: C.container,
                        color: C.text,
                        fontSize: 28,
                        fontWeight: 700,
                        padding: "12px 14px",
                        outline: "none",
                        textAlign: "center",
                        letterSpacing: 8,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        fontVariantNumeric: "tabular-nums",
                        boxSizing: "border-box",
                        transition: "border-color 0.15s",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
                    />
                  </div>

                  {error && <p style={{ color: C.error, fontSize: 13, margin: 0 }}>{error}</p>}

                  <button
                    type="submit"
                    disabled={isOtpDisabled}
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 8,
                      border: "none",
                      background: isOtpDisabled ? C.highest : C.primary,
                      color: isOtpDisabled ? C.textFaint : C.primaryText,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: isOtpDisabled ? "default" : "pointer",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      transition: "background 0.15s",
                    }}
                  >
                    {verifying ? "Signing in…" : "Sign in"}
                  </button>
                </form>

                <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
                  <button
                    onClick={handleResend}
                    disabled={loading}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.primary,
                      fontSize: 13,
                      cursor: "pointer",
                      padding: "10px 12px",
                      minHeight: 44,
                    }}
                  >
                    {loading ? "Sending…" : "Resend code"}
                  </button>
                  <button
                    onClick={() => { setSent(false); setOtpCode(""); setError(null); }}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.textMuted,
                      fontSize: 13,
                      cursor: "pointer",
                      padding: "10px 12px",
                      minHeight: 44,
                    }}
                  >
                    Use different email
                  </button>
                </div>
              </div>
            )}

            {/* Trust line */}
            {!sent && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 20,
                  marginTop: 28,
                  paddingTop: 20,
                  borderTop: `1px solid ${C.borderFaint}`,
                }}
              >
                {["End-to-end encrypted", "No lock-in", "Export anytime"].map((badge) => (
                  <span key={badge} style={{ fontSize: 11, color: C.textFaint }}>
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-two-col {
            flex-direction: column !important;
            min-height: auto !important;
          }
          .login-two-col > div:first-child {
            border-right: none !important;
            border-bottom: 1px solid oklch(22% 0.006 230) !important;
            padding: 40px 24px !important;
          }
          .login-two-col > div:last-child {
            width: 100% !important;
            padding: 36px 24px !important;
          }
        }
      `}</style>
    </div>
  );
}
