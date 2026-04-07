import { useState, useEffect, type JSX } from "react";
import { supabase } from "./lib/supabase";
import OpenBrain from "./OpenBrain";
import LoginScreen from "./LoginScreen";
import ErrorBoundary from "./ErrorBoundary";
import { MemoryProvider } from "./MemoryContext";
import { ThemeProvider } from "./ThemeContext";
import LoadingScreen from "./components/LoadingScreen";
import type { Session } from "@supabase/supabase-js";

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

  // Accept a brain invite token from the URL (?invite=<hex64>)
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite");
    if (!inviteToken) return;
    // Clear the token from the URL immediately
    window.history.replaceState(null, "", window.location.pathname);
    fetch("/api/brains?action=accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setInviteMsg("You've joined the brain! Refreshing…");
        else setInviteMsg(data.error || "Invite link invalid or already used.");
        setTimeout(() => { setInviteMsg(null); window.location.reload(); }, 2500);
      })
      .catch(() => setInviteMsg("Failed to accept invite. Please try again."));
  }, [session]);

  useEffect(() => {
    const tokens = getHashTokens();
    if (tokens) {
      supabase.auth.setSession(tokens).then(({ data: { session } }) => {
        setSession(session);
        window.history.replaceState(null, "", window.location.pathname);
      });
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return (
    <ThemeProvider>
      <LoadingScreen />
    </ThemeProvider>
  );
  if (!session) return (
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
                position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
                background: "var(--color-surface)", borderBottom: "1px solid var(--color-primary-container)",
                color: "var(--color-primary)", textAlign: "center", padding: "14px 16px",
                fontSize: "14px", fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              {inviteMsg}
            </div>
          )}
          <OpenBrain />
        </MemoryProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
