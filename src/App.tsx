import { useState, useEffect, type JSX } from "react";
import { supabase } from "./lib/supabase";
import { loadUserAISettings } from "./lib/aiSettings";
import { authFetch } from "./lib/authFetch";
import Everion from "./Everion";
import LoginScreen from "./LoginScreen";
import ErrorBoundary from "./ErrorBoundary";
import { MemoryProvider } from "./MemoryContext";
import { ThemeProvider } from "./ThemeContext";
import LoadingScreen from "./components/LoadingScreen";
import UpdateToast from "./components/UpdateToast";
import type { Session } from "@supabase/supabase-js";

const PENDING_INVITE_KEY = "ob_pending_invite";

function getHashTokens(): { access_token: string; refresh_token: string } | null {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token && refresh_token) return { access_token, refresh_token };
  return null;
}

export default function App(): JSX.Element {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [earlyCapture, setEarlyCapture] = useState(false);

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
          {earlyCapture ? (
            <svg
              className="h-5 w-5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
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
          )}
        </button>
      </ThemeProvider>
    );
  if (!session)
    return (
      <ThemeProvider>
        <LoginScreen />
      </ThemeProvider>
    );
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
                fontFamily: "'DM Sans', system-ui, sans-serif",
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
