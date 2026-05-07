import { useState } from "react";
import { supabase } from "../lib/supabase";
import { friendlyError as toFriendlyError } from "../lib/friendlyError";

function redirectUrl(): string {
  const raw = import.meta.env.VITE_APP_URL;
  if (!raw) throw new Error("VITE_APP_URL is required for auth redirects");
  const base = raw.startsWith("http") ? raw : `https://${raw}`;
  // Preserve ?invite=<token> through the magic-link / email-confirm round-trip
  // so the App.tsx accept flow still fires after sign-up.
  try {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite && /^[0-9a-f]{64}$/i.test(invite)) {
      return `${base.replace(/\/$/, "")}/?invite=${invite}`;
    }
  } catch {
    /* ignore */
  }
  return base;
}

function hasPendingInvite(): boolean {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("invite");
    if (fromUrl) return true;
    return !!sessionStorage.getItem("ob_pending_invite");
  } catch {
    return false;
  }
}

export function useAuthFlow() {
  // If the user arrived via an invite link, default straight into the
  // "Create account" password flow — most invitees don't have an account yet.
  const invitePending = hasPendingInvite();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [usePassword, setUsePassword] = useState(invitePending);
  const [password, setPassword] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(true);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const getEmailRedirectUrl = (): string | null => {
    try {
      return redirectUrl();
    } catch (err) {
      setError(
        toFriendlyError(err instanceof Error ? err.message : "Auth redirect is not configured."),
      );
      return null;
    }
  };

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const emailRedirectTo = getEmailRedirectUrl();
    if (!emailRedirectTo) {
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });
    if (error) setError(toFriendlyError(error.message));
    else setSent(true);
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setVerifying(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode.trim(),
      type: "magiclink",
    });
    if (error) setError(toFriendlyError(error.message));
    setVerifying(false);
  };

  const handleResend = async () => {
    setLoading(true);
    setError(null);
    setOtpCode("");
    const emailRedirectTo = getEmailRedirectUrl();
    if (!emailRedirectTo) {
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });
    if (error) setError(toFriendlyError(error.message));
    setLoading(false);
  };

  const handlePasswordSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const emailRedirectTo = getEmailRedirectUrl();
      if (!emailRedirectTo) return;
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      if (error) setError(toFriendlyError(error.message));
      else if (data?.user) setSignupSuccess(true);
    } catch (err) {
      setError(
        toFriendlyError(
          err instanceof Error ? err.message : "Something went wrong. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(toFriendlyError(error.message));
    } catch (err) {
      setError(
        toFriendlyError(
          err instanceof Error ? err.message : "Something went wrong. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const redirectTo = getEmailRedirectUrl();
    if (!redirectTo) {
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError(toFriendlyError(error.message));
      setLoading(false);
    }
    // On success the browser redirects — no further state needed.
  };

  const switchToPassword = () => {
    setUsePassword(true);
  };

  const switchToMagicLink = () => {
    setShowForm(true);
  };

  const backFromPassword = () => {
    setUsePassword(false);
    setPassword("");
    setError(null);
  };

  const backFromMagicLink = () => {
    setShowForm(false);
    setPassword("");
    setError(null);
  };

  const switchSignInMode = (toSignUp: boolean) => {
    setIsSigningUp(toSignUp);
    setPassword("");
    setError(null);
  };

  const goBackFromSuccess = () => {
    setSignupSuccess(false);
    setIsSigningUp(false);
    setEmail("");
    setPassword("");
    setError(null);
  };

  const goBackFromOtp = () => {
    setSent(false);
    setOtpCode("");
    setError(null);
  };

  const MIN_PASSWORD_LENGTH = 10;
  const isDisabled = loading || !email;
  const isOtpDisabled = verifying || otpCode.length < 6 || otpCode.length > 8;
  const isPasswordDisabled = loading || !email || password.length < MIN_PASSWORD_LENGTH;

  return {
    // state
    email,
    setEmail,
    sent,
    loading,
    error,
    showForm,
    otpCode,
    setOtpCode: (value: string) => setOtpCode(value.trim()),
    verifying,
    usePassword,
    password,
    setPassword,
    isSigningUp,
    signupSuccess,
    // derived
    isDisabled,
    isOtpDisabled,
    isPasswordDisabled,
    MIN_PASSWORD_LENGTH,
    // handlers
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
  };
}
