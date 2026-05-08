import { type JSX, useMemo, useState } from "react";

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
import { useDocumentMeta } from "./hooks/useDocumentMeta";
import { EverionLogo } from "./components/ui/EverionLogo";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";

function EyeIcon({ open, size = 18 }: { open: boolean; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 4.06-5.06" />
          <path d="M9.9 4.24A11 11 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </>
      )}
    </svg>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const score = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 10) s++;
    if (password.length >= 14) s++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^a-zA-Z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  if (!password) return null;
  const label = score < 2 ? "weak" : score < 4 ? "ok" : "strong";
  const color =
    score < 2 ? "var(--blood, #c44)" : score < 4 ? "var(--ember, #c97a3c)" : "var(--moss, #6b8e3c)";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}
    >
      <div
        style={{
          flex: 1,
          height: 3,
          background: "var(--line-soft)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${(score / 5) * 100}%`,
            height: "100%",
            background: color,
            transition: "width 200ms, background 200ms",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color, minWidth: 38, textAlign: "right" }}>{label}</span>
    </div>
  );
}

function hasInvite(): boolean {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("invite");
    if (fromUrl && /^[0-9a-f]{64}$/i.test(fromUrl)) return true;
    return !!sessionStorage.getItem("ob_pending_invite");
  } catch {
    return false;
  }
}

interface LoginScreenProps {
  initialIntent?: "login" | "signup";
}

export default function LoginScreen({
  initialIntent = "login",
}: LoginScreenProps = {}): JSX.Element {
  const isInvited = useMemo(() => hasInvite(), []);
  const startSignup = initialIntent === "signup" || isInvited;
  const [showPwd, setShowPwd] = useState(false);

  useDocumentMeta({
    title: startSignup ? "Create your account — Everion" : "Sign in — Everion",
    noindex: true,
  });
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
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          data-testid="login-center-wrapper"
          className="login-two-col"
          style={{
            width: "100%",
            maxWidth: 960,
            margin: "0 auto",
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
                what this is for
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
                One private place for everything worth remembering — meeting notes, decisions,
                customer insights, half-formed ideas. With a small encrypted vault for the few real
                secrets.
              </p>
              <figure
                style={{
                  margin: "28px 0 0",
                  paddingTop: 20,
                  borderTop: "1px solid var(--line-soft)",
                }}
              >
                <blockquote
                  className="f-serif"
                  style={{
                    margin: 0,
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "var(--ink-soft)",
                    fontStyle: "italic",
                  }}
                >
                  “It's where my life lives now.”
                </blockquote>
                <figcaption
                  className="f-sans"
                  style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 6 }}
                >
                  — Sarah, founder
                </figcaption>
              </figure>
            </div>

            <div
              className="f-serif"
              style={{
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--ink-ghost)",
              }}
            >
              private · offline-first · end-to-end encrypted vault · your data is yours
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
              <a
                href="/"
                className="press"
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  color: "var(--ink-faint)",
                  marginBottom: 18,
                  textDecoration: "none",
                }}
              >
                ← back to everion
              </a>
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
                    Someone shared a brain with you.
                  </strong>
                  <br />
                  Create your Everion account below — you'll be added the moment you sign in.
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
                  For the thoughts you'd lose · and the facts you can't afford to.
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
                    {startSignup ? "make a space." : "welcome back."}
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
                    {startSignup
                      ? "create your account to start remembering."
                      : "sign in to continue."}
                  </p>
                  {/* ── Google — primary, fastest path ── */}
                  <Button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    size="lg"
                    className="w-full"
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
                  </Button>
                  {/* ── divider with "or" label ── */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Separator className="flex-1" />
                    <span style={{ fontSize: 12, color: "var(--ink-ghost)" }}>or</span>
                    <Separator className="flex-1" />
                  </div>
                  <Button
                    onClick={switchToMagicLink}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    Email me a code
                  </Button>
                  <Button onClick={switchToPassword} variant="outline" size="lg" className="w-full">
                    Use password
                  </Button>
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
                        placeholder="you@email.com"
                        required
                        autoFocus
                        autoComplete="email"
                        inputMode="email"
                        style={{
                          width: "100%",
                          borderRadius: 8,
                          border: "1px solid var(--color-outline-variant)",
                          background: "var(--color-surface-container)",
                          color: "var(--color-on-surface)",
                          fontSize: 16,
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
                        Password{" "}
                        <span style={{ opacity: 0.7, fontWeight: 400 }}>
                          ({isSigningUp ? "min." : "min."} {MIN_PASSWORD_LENGTH} characters
                          {isSigningUp ? " · use a passphrase" : ""})
                        </span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <input
                          id="password-input"
                          type={showPwd ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••"
                          required
                          minLength={MIN_PASSWORD_LENGTH}
                          autoComplete={isSigningUp ? "new-password" : "current-password"}
                          style={{
                            width: "100%",
                            borderRadius: 8,
                            border: "1px solid var(--color-outline-variant)",
                            background: "var(--color-surface-container)",
                            color: "var(--color-on-surface)",
                            fontSize: 16,
                            padding: "11px 44px 11px 14px",
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
                        <button
                          type="button"
                          onClick={() => setShowPwd((v) => !v)}
                          aria-label={showPwd ? "Hide password" : "Show password"}
                          aria-pressed={showPwd}
                          className="press"
                          style={{
                            position: "absolute",
                            top: "50%",
                            right: 8,
                            transform: "translateY(-50%)",
                            background: "transparent",
                            border: "none",
                            padding: 8,
                            cursor: "pointer",
                            color: "var(--color-on-surface-variant)",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <EyeIcon open={showPwd} />
                        </button>
                      </div>
                      {isSigningUp && <PasswordStrength password={password} />}
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
                      <Button
                        type="button"
                        onClick={backFromPassword}
                        variant="outline"
                        size="lg"
                        className="flex-1"
                      >
                        Back
                      </Button>
                      <Button
                        type="submit"
                        disabled={isPasswordDisabled}
                        size="lg"
                        className="flex-[2]"
                      >
                        {loading
                          ? isSigningUp
                            ? "Creating…"
                            : "Signing in…"
                          : isSigningUp
                            ? "Create account"
                            : "Sign in"}
                      </Button>
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
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          onClick={() => switchSignInMode(false)}
                          className="h-auto p-0 text-inherit"
                          style={{ color: "var(--color-primary)" }}
                        >
                          Sign in
                        </Button>
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
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          onClick={() => switchSignInMode(true)}
                          className="h-auto p-0 text-inherit"
                          style={{ color: "var(--color-primary)" }}
                        >
                          Create account
                        </Button>
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
                    Confirmation link sent to{" "}
                    <strong style={{ color: "var(--color-on-surface)" }}>{email}</strong> — should
                    arrive in under a minute. Click it and you're in.
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--color-on-surface-variant)",
                      lineHeight: 1.6,
                      margin: "0 0 20px",
                      opacity: 0.85,
                    }}
                  >
                    Nothing in the inbox? Check spam, or{" "}
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      onClick={handleResend}
                      disabled={loading}
                      className="h-auto p-0 text-inherit"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {loading ? "sending…" : "resend the link"}
                    </Button>
                    .
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      onClick={goBackFromSuccess}
                      variant="outline"
                      size="lg"
                      className="flex-1"
                    >
                      Use a different email
                    </Button>
                    <Button onClick={() => switchSignInMode(false)} size="lg" className="flex-1">
                      I clicked it, sign in
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Email form (magic link / OTP) ── */}
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
                    {startSignup ? "Create your account" : "Sign in"}
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-on-surface-variant)",
                      margin: "0 0 20px",
                    }}
                  >
                    {startSignup
                      ? "Enter your email and we'll send a 6-digit code to get you in."
                      : "Enter your email and we'll send an access code."}
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
                        placeholder="you@email.com"
                        required
                        autoFocus
                        autoComplete="email"
                        inputMode="email"
                        style={{
                          width: "100%",
                          borderRadius: 8,
                          border: "1px solid var(--color-outline-variant)",
                          background: "var(--color-surface-container)",
                          color: "var(--color-on-surface)",
                          fontSize: 16,
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
                      <Button
                        type="button"
                        onClick={backFromMagicLink}
                        variant="outline"
                        size="lg"
                        className="flex-1"
                      >
                        Back
                      </Button>
                      <Button type="submit" disabled={isDisabled} size="lg" className="flex-[2]">
                        {loading ? "Sending…" : "Send my code"}
                      </Button>
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
                    <Button type="submit" disabled={isOtpDisabled} size="lg" className="w-full">
                      {verifying ? "Signing in…" : "Sign in"}
                    </Button>
                  </form>
                  <div
                    style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}
                  >
                    <Button variant="link" size="sm" onClick={handleResend} disabled={loading}>
                      {loading ? "Sending…" : "Resend code"}
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={goBackFromOtp}
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      Use different email
                    </Button>
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
                {" · "}
                <a href="/status" style={{ color: "inherit", textDecoration: "underline" }}>
                  Having trouble?
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
