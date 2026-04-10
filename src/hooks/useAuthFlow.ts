import { useState } from "react";
import { supabase } from "../lib/supabase";

function toFriendlyError(msg: string): string {
  if (msg.toLowerCase().includes("database error saving new user")) {
    return "Account setup failed. Please try again in a moment.";
  }
  return msg;
}

function redirectUrl(): string {
  const raw = import.meta.env.VITE_APP_URL || window.location.origin;
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export function useAuthFlow() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(true);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl() },
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
    if (error) setError(error.message);
    setVerifying(false);
  };

  const handleResend = async () => {
    setLoading(true);
    setError(null);
    setOtpCode("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl() },
    });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handlePasswordSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error, data } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (data?.user) setSignupSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
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
      if (error) setError(error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
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

  const MIN_PASSWORD_LENGTH = 6;
  const isDisabled = loading || !email;
  const isOtpDisabled = verifying || otpCode.length < 6 || otpCode.length > 8;
  const isPasswordDisabled = loading || !email || password.length < MIN_PASSWORD_LENGTH;

  return {
    // state
    email, setEmail,
    sent,
    loading,
    error,
    showForm,
    otpCode, setOtpCode,
    verifying,
    usePassword,
    password, setPassword,
    isSigningUp,
    signupSuccess,
    // derived
    isDisabled,
    isOtpDisabled,
    isPasswordDisabled,
    MIN_PASSWORD_LENGTH,
    // handlers
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
