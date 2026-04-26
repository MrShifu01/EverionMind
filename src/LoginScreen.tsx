import { type JSX, useMemo } from "react";

function RefreshCwIcon({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}
import { useAuthFlow } from "./hooks/useAuthFlow";
import { EverionLogo } from "./components/ui/EverionLogo";

function hasInvite(): boolean {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("invite");
    if (fromUrl && /^[0-9a-f]{64}$/i.test(fromUrl)) return true;
    return !!sessionStorage.getItem("ob_pending_invite");
  } catch {
    return false;
  }
}

export default function LoginScreen(): JSX.Element {
  const isInvited = useMemo(hasInvite, []);
  const {
    email,
    setEmail,
    sent,
    loading,
    error,
    showForm,
    otpCode,
    setOtpCode,
    verifying,
    usePassword,
    password,
    setPassword,
    isSigningUp,
    signupSuccess,
    isDisabled,
    isOtpDisabled,
    isPasswordDisabled,
    MIN_PASSWORD_LENGTH,
    handleGoogleSignIn,
    handleSend,
    handleVerifyOtp,
    handleResend,
    handlePasswordSignUp,
    handlePasswordSignIn,
    switchToPassword,
    switchToMagicLink,
    backFromPassword,
    backFromMagicLink,
    switchSignInMode,
    goBackFromSuccess,
    goBackFromOtp,
  } = useAuthFlow();

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "var(--bg)",
        color: "var(--ink)",
        fontFamily: "var(--f-sans)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* ── DESKTOP: two-column layout ── */}
      <div style={{ position: "relative", zIndex: 1, width: "100%" }}>
        <div
          data-testid="login-center-wrapper"
          className="login-two-col"
          style={{
            width: "100%",
            maxWidth: 960,
            display: "flex",
            alignItems: "stretch",
            minHeight: 560,
            border: "1px solid var(--line-soft)",
            borderRadius: 18,
            overflow: "hidden",
            background: "var(--bg)",
          }}
        >
          {/* LEFT PANEL — quote / testimonial */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "56px clamp(40px, 5vw, 72px)",
              borderRight: "1px solid var(--line-soft)",
              background: "var(--surface-low)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <EverionLogo size={22} />
              <span
                className="f-serif"
                style={{
                  fontSize: 22,
                  fontWeight: 450,
                  letterSpacing: "-0.01em",
                  color: "var(--ink)",
                }}
              >
                Everion
              </span>
              <span
                aria-hidden="true"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--ember)",
                  animation: "design-breathe 3.5s ease-in-out infinite",
                }}
              />
            </div>

            <div>
              <div className="micro" style={{ marginBottom: 14 }}>
                from someone who lives here
              </div>
              <p
                className="f-serif"
                style={{
                  fontSize: 24,
                  lineHeight: 1.35,
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "var(--ink)",
                  letterSpacing: "-0.005em",
                  margin: 0,
                }}
              >
                "It's the only app I keep open all day. The ritual of putting a thing down and
                knowing where it went — I didn't know I needed that."
              </p>
              <div
                className="f-sans"
                style={{
                  marginTop: 20,
                  fontSize: 13,
                  color: "var(--ink-faint)",
                }}
              >
                — M., writer, lives in her Everion since last summer
              </div>
            </div>

            <div
              className="f-serif"
              style={{
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--ink-ghost)",
              }}
            >
              private · offline-first · end-to-end encrypted vault
            </div>
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
              {/* ── Invite banner ── */}
              {isInvited && (
                <div
                  style={{
                    borderRadius: 10,
                    border: "1px solid var(--color-primary-container)",
                    background: "color-mix(in oklch, var(--color-primary) 10%, transparent)",
                    padding: "12px 14px",
                    marginBottom: 16,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--color-on-surface)",
                  }}
                >
                  <strong style={{ color: "var(--color-primary)" }}>
                    You're invited to a brain.
                  </strong>
                  <br />
                  Create your Everion account below — you'll be added automatically.
                </div>
              )}

              {/* ── Mobile-only brand strip ── */}
              <div className="login-mobile-brand">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <EverionLogo size={22} />
                  <span
                    style={{
                      fontFamily: "var(--f-sans)",
                      fontWeight: 700,
                      fontSize: 20,
                      color: "var(--color-on-surface)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Everion
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--color-primary)",
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  Your second brain — capture everything, find anything.
                </p>
              </div>

              {/* ── CTA (pre-form) ── */}
              {!showForm && !sent && !usePassword && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h2
                    className="f-serif"
                    style={{
                      fontSize: 40,
                      fontWeight: 400,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.05,
                      margin: "0 0 4px",
                      color: "var(--ink)",
                    }}
                  >
                    welcome back.
                  </h2>
                  <p
                    className="f-serif"
                    style={{
                      fontSize: 16,
                      fontStyle: "italic",
                      color: "var(--ink-soft)",
                      margin: "0 0 4px",
                      lineHeight: 1.5,
                    }}
                  >
                    sign in to continue.
                  </p>
                  {/* ── Google (primary) ── */}
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="login-primary-btn"
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: loading ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      transition: "background 150ms",
                      fontFamily: "'Inter', system-ui, sans-serif",
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.3 30.2 0 24 0 14.8 0 6.9 5.4 3 13.3l7.9 6.1C12.8 13.2 17.9 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.9 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L2.4 13.3A23.9 23.9 0 0 0 0 24c0 3.8.9 7.4 2.4 10.7l8.5-6.1z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.1 0-11.2-3.7-13.1-9l-7.9 6.1C6.9 42.6 14.8 48 24 48z"
                      />
                    </svg>
                    {loading ? "Redirecting…" : "Continue with Google"}
                  </button>
                  {/* ── divider ── */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 1, background: "var(--line-soft)" }} />
                    <span style={{ fontSize: 12, color: "var(--ink-ghost)" }}>or</span>
                    <div style={{ flex: 1, height: 1, background: "var(--line-soft)" }} />
                  </div>
                  <button
                    onClick={switchToMagicLink}
                    className="login-primary-btn"
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 10,
                      border: "none",
                      background: "var(--ember)",
                      color: "var(--ember-ink)",
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      transition: "background 150ms",
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    Magic link
                  </button>
                  <button
                    onClick={switchToPassword}
                    className="login-primary-btn"
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 10,
                      border: "1px solid var(--color-outline-variant)",
                      background: "transparent",
                      color: "var(--color-on-surface)",
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      transition: "background 150ms",
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    Use password
                  </button>
                </div>
              )}

              {/* ── Password form (signup/signin) ── */}
              {usePassword && !signupSuccess && (
                <>
                  <h2
                    style={{
                      fontFamily: "var(--f-sans)",
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      margin: "0 0 6px",
                      color: "var(--color-on-surface)",
                    }}
                  >
                    {isSigningUp ? "Create account" : "Sign in"}
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-on-surface-variant)",
                      margin: "0 0 20px",
                    }}
                  >
                    {isSigningUp
                      ? "Create your account with a password."
                      : "Enter your email and password."}
                  </p>
                  <form
                    onSubmit={isSigningUp ? handlePasswordSignUp : handlePasswordSignIn}
                    style={{ display: "flex", flexDirection: "column", gap: 12 }}
                  >
                    <div>
                      <label
                        htmlFor="password-email"
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--color-on-surface-variant)",
                          marginBottom: 6,
                        }}
                      >
                        Email address
                      </label>
                      <input
                        id="password-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="neural@email.com"
                        required
                        autoFocus
                        style={{
                          width: "100%",
                          borderRadius: 8,
                          border: "1px solid var(--color-outline-variant)",
                          background: "var(--color-surface-container)",
                          color: "var(--color-on-surface)",
                          fontSize: 15,
                          padding: "11px 14px",
                          outline: "none",
                          boxSizing: "border-box",
                          fontFamily: "'Inter', system-ui, sans-serif",
                          transition: "border-color 150ms",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "var(--color-primary)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "var(--color-outline-variant)";
                        }}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="password-input"
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--color-on-surface-variant)",
                          marginBottom: 6,
                        }}
                      >
                        Password {!isSigningUp && "(min. 6 characters)"}
                      </label>
                      <input
                        id="password-input"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        style={{
                          width: "100%",
                          borderRadius: 8,
                          border: "1px solid var(--color-outline-variant)",
                          background: "var(--color-surface-container)",
                          color: "var(--color-on-surface)",
                          fontSize: 15,
                          padding: "11px 14px",
                          outline: "none",
                          boxSizing: "border-box",
                          fontFamily: "'Inter', system-ui, sans-serif",
                          transition: "border-color 150ms",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "var(--color-primary)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "var(--color-outline-variant)";
                        }}
                      />
                    </div>
                    {error && (
                      <p
                        role="alert"
                        style={{ color: "var(--color-error)", fontSize: 13, margin: 0 }}
                      >
                        {error}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={backFromPassword}
                        style={{
                          flex: 1,
                          height: 44,
                          borderRadius: 8,
                          border: "1px solid var(--color-outline-variant)",
                          background: "transparent",
                          color: "var(--color-on-surface-variant)",
                          fontSize: 14,
                          cursor: "pointer",
                          fontFamily: "'Inter', system-ui, sans-serif",
                          transition: "color 150ms",
                        }}
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={isPasswordDisabled}
                        style={{
                          flex: 2,
                          height: 44,
                          borderRadius: 8,
                          border: "none",
                          background: isPasswordDisabled
                            ? "var(--color-surface-container-highest)"
                            : "var(--color-primary)",
                          color: isPasswordDisabled
                            ? "var(--color-on-surface-variant)"
                            : "var(--color-on-primary)",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: isPasswordDisabled ? "default" : "pointer",
                          fontFamily: "'Inter', system-ui, sans-serif",
                          transition: "background 150ms",
                          opacity: isPasswordDisabled ? 0.6 : 1,
                        }}
                      >
                        {loading
                          ? isSigningUp
                            ? "Creating…"
                            : "Signing in…"
                          : isSigningUp
                            ? "Create account"
                            : "Sign in"}
                      </button>
                    </div>
                    {isSigningUp && (
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--color-on-surface-variant)",
                          margin: "8px 0 0",
                        }}
                      >
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => switchSignInMode(false)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-primary)",
                            cursor: "pointer",
                            fontSize: "inherit",
                            fontWeight: 600,
                            padding: 0,
                          }}
                        >
                          Sign in
                        </button>
                      </p>
                    )}
                    {!isSigningUp && (
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--color-on-surface-variant)",
                          margin: "8px 0 0",
                        }}
                      >
                        Don't have an account?{" "}
                        <button
                          type="button"
                          onClick={() => switchSignInMode(true)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-primary)",
                            cursor: "pointer",
                            fontSize: "inherit",
                            fontWeight: 600,
                            padding: 0,
                          }}
                        >
                          Create account
                        </button>
                      </p>
                    )}
                  </form>
                </>
              )}

              {/* ── Password signup success ── */}
              {usePassword && signupSuccess && (
                <div>
                  <h2
                    style={{
                      fontFamily: "var(--f-sans)",
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      margin: "0 0 8px",
                      color: "var(--color-on-surface)",
                    }}
                  >
                    Check your email ✉️
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-on-surface-variant)",
                      lineHeight: 1.6,
                      margin: "0 0 12px",
                    }}
                  >
                    We've sent a confirmation link to{" "}
                    <strong style={{ color: "var(--color-on-surface)" }}>{email}</strong>.
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-on-surface-variant)",
                      lineHeight: 1.6,
                      margin: "0 0 24px",
                    }}
                  >
                    <strong style={{ color: "var(--color-on-surface)" }}>
                      You must click that link before you can sign in.
                    </strong>{" "}
                    If you don't see it, check your spam folder.
                  </p>
                  <button
                    onClick={goBackFromSuccess}
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 8,
                      border: "none",
                      background: "var(--color-primary)",
                      color: "var(--color-on-primary)",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'Inter', system-ui, sans-serif",
                      transition: "background 150ms",
                    }}
                  >
                    Back to sign in
                  </button>
                </div>
              )}

              {/* ── Email form (magic link) ── */}
              {showForm && !sent && !usePassword && (
                <>
                  <h2
                    style={{
                      fontFamily: "var(--f-sans)",
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      margin: "0 0 6px",
                      color: "var(--color-on-surface)",
                    }}
                  >
                    Sign in
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-on-surface-variant)",
                      margin: "0 0 20px",
                    }}
                  >
                    Enter your email and we'll send an access code.
                  </p>
                  <form
                    onSubmit={handleSend}
                    style={{ display: "flex", flexDirection: "column", gap: 12 }}
                  >
                    <div>
                      <label
                        htmlFor="login-email"
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--color-on-surface-variant)",
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
                        placeholder="neural@email.com"
                        required
                        autoFocus
                        style={{
                          width: "100%",
                          borderRadius: 8,
                          border: "1px solid var(--color-outline-variant)",
                          background: "var(--color-surface-container)",
                          color: "var(--color-on-surface)",
                          fontSize: 15,
                          padding: "11px 14px",
                          outline: "none",
                          boxSizing: "border-box",
                          fontFamily: "'Inter', system-ui, sans-serif",
                          transition: "border-color 150ms",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "var(--color-primary)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "var(--color-outline-variant)";
                        }}
                      />
                    </div>
                    {error && (
                      <p
                        role="alert"
                        style={{ color: "var(--color-error)", fontSize: 13, margin: 0 }}
                      >
                        {error}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={backFromMagicLink}
                        style={{
                          flex: 1,
                          height: 44,
                          borderRadius: 8,
                          border: "1px solid var(--color-outline-variant)",
                          background: "transparent",
                          color: "var(--color-on-surface-variant)",
                          fontSize: 14,
                          cursor: "pointer",
                          fontFamily: "'Inter', system-ui, sans-serif",
                          transition: "color 150ms",
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
                          background: isDisabled
                            ? "var(--color-surface-container-highest)"
                            : "var(--color-primary)",
                          color: isDisabled
                            ? "var(--color-on-surface-variant)"
                            : "var(--color-on-primary)",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: isDisabled ? "default" : "pointer",
                          fontFamily: "'Inter', system-ui, sans-serif",
                          transition: "background 150ms",
                          opacity: isDisabled ? 0.6 : 1,
                        }}
                      >
                        {loading ? "Sending…" : "Send access code"}
                      </button>
                    </div>
                  </form>
                </>
              )}

              {/* ── OTP verification ── */}
              {sent && (
                <div>
                  <h2
                    style={{
                      fontFamily: "var(--f-sans)",
                      fontSize: 22,
                      fontWeight: 700,
                      color: "var(--color-on-surface)",
                      margin: "0 0 8px",
                    }}
                  >
                    Check your email
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-on-surface-variant)",
                      lineHeight: 1.6,
                      margin: "0 0 8px",
                    }}
                  >
                    Sent to <strong style={{ color: "var(--color-on-surface)" }}>{email}</strong>.
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-on-surface-variant)",
                      lineHeight: 1.6,
                      margin: "0 0 24px",
                    }}
                  >
                    Enter the code or tap the sign-in link.
                  </p>
                  <form
                    onSubmit={handleVerifyOtp}
                    style={{ display: "flex", flexDirection: "column", gap: 12 }}
                  >
                    <div>
                      <label
                        htmlFor="otp-code"
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--color-on-surface-variant)",
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
                          border: "1px solid var(--color-outline-variant)",
                          background: "var(--color-surface-container)",
                          color: "var(--color-on-surface)",
                          fontSize: 28,
                          fontWeight: 700,
                          padding: "12px 14px",
                          outline: "none",
                          textAlign: "center",
                          letterSpacing: 8,
                          fontFamily: "'Inter', system-ui, sans-serif",
                          fontVariantNumeric: "tabular-nums",
                          boxSizing: "border-box",
                          transition: "border-color 150ms",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "var(--color-primary)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "var(--color-outline-variant)";
                        }}
                      />
                    </div>
                    {error && (
                      <p
                        role="alert"
                        style={{ color: "var(--color-error)", fontSize: 13, margin: 0 }}
                      >
                        {error}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={isOtpDisabled}
                      style={{
                        width: "100%",
                        height: 48,
                        borderRadius: 8,
                        border: "none",
                        background: isOtpDisabled
                          ? "var(--color-surface-container-highest)"
                          : "var(--color-primary)",
                        color: isOtpDisabled
                          ? "var(--color-on-surface-variant)"
                          : "var(--color-on-primary)",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: isOtpDisabled ? "default" : "pointer",
                        fontFamily: "'Inter', system-ui, sans-serif",
                        transition: "background 150ms",
                        opacity: isOtpDisabled ? 0.6 : 1,
                      }}
                    >
                      {verifying ? "Signing in…" : "Sign in"}
                    </button>
                  </form>
                  <div
                    style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}
                  >
                    <button
                      onClick={handleResend}
                      disabled={loading}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-primary)",
                        fontSize: 13,
                        cursor: "pointer",
                        padding: "10px 12px",
                      }}
                    >
                      {loading ? "Sending…" : "Resend code"}
                    </button>
                    <button
                      onClick={goBackFromOtp}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-on-surface-variant)",
                        fontSize: 13,
                        cursor: "pointer",
                        padding: "10px 12px",
                      }}
                    >
                      Use different email
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
                    <RefreshCwIcon
                      size={14}
                      style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }}
                      aria-hidden="true"
                    />
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--color-on-surface-variant)",
                        margin: 0,
                        opacity: 0.7,
                      }}
                    >
                      Link expires in 60 minutes.
                    </p>
                  </div>
                </div>
              )}
              <p
                style={{
                  marginTop: 24,
                  fontSize: 11,
                  color: "var(--color-on-surface-variant)",
                  opacity: 0.6,
                  textAlign: "center",
                }}
              >
                <a href="/privacy" style={{ color: "inherit", textDecoration: "underline" }}>
                  Privacy Policy
                </a>
                {" · "}
                <a href="/terms" style={{ color: "inherit", textDecoration: "underline" }}>
                  Terms of Service
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .login-primary-btn:hover { background: var(--color-primary-dim) !important; }
        .login-mobile-brand { display: none; }
        @media (max-width: 768px) {
          .login-two-col { flex-direction: column !important; min-height: auto !important; border: none !important; border-radius: 0 !important; }
          .login-two-col > div:last-child { order: -1; width: 100% !important; padding: 36px 24px !important; }
          .login-two-col > div:first-child { display: none !important; }
          .login-mobile-brand { display: block !important; margin-bottom: 28px; }
        }
      `}</style>
    </div>
  );
}
