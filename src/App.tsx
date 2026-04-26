import { useState, useEffect, type JSX } from "react";
import { supabase } from "./lib/supabase";
import { loadUserAISettings } from "./lib/aiSettings";
import { authFetch } from "./lib/authFetch";
import Everion from "./Everion";
import LoginScreen from "./LoginScreen";
import Landing from "./views/Landing";
import AdminView from "./views/AdminView";
import ResetPasswordView from "./views/ResetPasswordView";
import ErrorBoundary from "./ErrorBoundary";
import { MemoryProvider } from "./MemoryContext";
import { ThemeProvider } from "./ThemeContext";
import LoadingScreen from "./components/LoadingScreen";
import UpdateToast from "./components/UpdateToast";
import type { Session } from "@supabase/auth-js";

const PENDING_INVITE_KEY = "ob_pending_invite";
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

function getHashTokens(): {
  access_token: string;
  refresh_token: string;
  type: string | null;
} | null {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token && refresh_token)
    return { access_token, refresh_token, type: params.get("type") };
  return null;
}

export default function App(): JSX.Element {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [earlyCapture, setEarlyCapture] = useState(false);
  const [earlyCaptureText, setEarlyCaptureText] = useState("");
  const [showLogin, setShowLogin] = useState(() => {
    // Skip landing and go straight to the login form when the URL already
    // signals authentication intent (invite token, magic-link hash, /login path)
    if (typeof window === "undefined") return false;
    if (window.location.pathname === "/login") return true;
    if (window.location.hash.includes("access_token")) return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite")) return true;
    return false;
  });

  // Stash any ?invite=<token> from the URL before auth so it survives the
  // magic-link / email-confirm round-trip. LoginScreen reads the same key to
  // become invite-aware (banner + default to signup).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("invite");
    if (tok && /^[0-9a-f]{64}$/i.test(tok)) {
      sessionStorage.setItem(PENDING_INVITE_KEY, tok);
    }
  }, []);

  // Once signed in, accept any pending invite (from URL or sessionStorage).
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite") || sessionStorage.getItem(PENDING_INVITE_KEY);
    if (!inviteToken) return;
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    window.history.replaceState(null, "", window.location.pathname);
    authFetch("/api/brains?action=accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setInviteMsg("You've joined the brain! Refreshing…");
        else setInviteMsg(data.error || "Invite link invalid or already used.");
        setTimeout(() => {
          setInviteMsg(null);
          window.location.reload();
        }, 2500);
      })
      .catch(() => setInviteMsg("Failed to accept invite. Please try again."));
  }, [session]);

  useEffect(() => {
    const loadSettings = (userId: string) =>
      Promise.race([
        loadUserAISettings(userId),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]).catch((err) => console.error("[App] loadUserAISettings failed", err));

    const tokens = getHashTokens();
    if (tokens) {
      supabase.auth
        .setSession(tokens)
        .then(async ({ data: { session } }) => {
          if (session?.user?.id) await loadSettings(session.user.id);
          setSession(session);
          if (tokens.type === "recovery") setShowResetPassword(true);
          window.history.replaceState(null, "", window.location.pathname);
        })
        .catch(async () => {
          await supabase.auth
            .signOut()
            .catch((err) => console.error("[App] signOut after setSession failure", err));
          setSession(null);
          window.history.replaceState(null, "", window.location.pathname);
        });
      return;
    }

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user?.id) await loadSettings(session.user.id);
        setSession(session);
      })
      .catch(async () => {
        // Corrupted/malformed token in localStorage — clear it and send to login
        await supabase.auth
          .signOut()
          .catch((err) => console.error("[App] signOut after getSession failure", err));
        setSession(null);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user?.id) await loadSettings(session.user.id);
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined)
    return (
      <ThemeProvider>
        <LoadingScreen />
        {earlyCapture ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 70,
              background: "var(--color-background, #0e0e0e)",
              display: "flex",
              flexDirection: "column",
              padding: "24px 20px 40px",
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-faint, #888)",
                margin: "0 0 12px",
                fontFamily: "var(--f-sans)",
              }}
            >
              Capture — will open when app loads
            </p>
            <textarea
              autoFocus
              placeholder="What's on your mind?"
              value={earlyCaptureText}
              onChange={(e) => setEarlyCaptureText(e.target.value)}
              style={{
                flex: 1,
                background: "var(--surface-low, #161616)",
                border: "1px solid var(--line-soft, #333)",
                borderRadius: 12,
                color: "var(--ink, #f0ede6)",
                fontSize: 16,
                fontFamily: "var(--f-sans)",
                padding: "14px",
                resize: "none",
                outline: "none",
              }}
            />
            <button
              onClick={() => {
                if (earlyCaptureText.trim()) {
                  localStorage.setItem("ob_pending_capture", earlyCaptureText.trim());
                }
                setEarlyCapture(false);
                setEarlyCaptureText("");
              }}
              style={{
                marginTop: 12,
                height: 48,
                borderRadius: 12,
                border: "none",
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--f-sans)",
              }}
            >
              {earlyCaptureText.trim() ? "Save & continue" : "Cancel"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEarlyCapture(true)}
            aria-label="New entry"
            className="press-scale fixed bottom-5 left-1/2 z-[60] flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full lg:hidden"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-on-primary)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </ThemeProvider>
    );
  if (!session)
    return (
      <ThemeProvider>
        {showLogin ? <LoginScreen /> : <Landing onAuth={() => setShowLogin(true)} />}
      </ThemeProvider>
    );
  if (showResetPassword)
    return (
      <ThemeProvider>
        <ResetPasswordView onDone={() => setShowResetPassword(false)} />
      </ThemeProvider>
    );

  const isAdminRoute = window.location.pathname === "/admin";
  const isAdmin = ADMIN_EMAIL ? session.user?.email === ADMIN_EMAIL : false;

  if (isAdminRoute) {
    if (!isAdmin) {
      window.location.replace("/");
      return <></>;
    }
    return (
      <ThemeProvider>
        <AdminView />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <MemoryProvider>
          {inviteMsg && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                background: "var(--color-surface)",
                borderBottom: "1px solid var(--color-primary-container)",
                color: "var(--color-primary)",
                textAlign: "center",
                padding: "14px 16px",
                fontSize: "16px",
                fontFamily: "var(--f-sans)",
              }}
            >
              {inviteMsg}
            </div>
          )}
          <Everion initialShowCapture={earlyCapture} />
          <UpdateToast />
        </MemoryProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
