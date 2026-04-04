import { useState, useEffect } from "react"
import { supabase } from "./lib/supabase"
import OpenBrain from "./OpenBrain.jsx"
import LoginScreen from "./LoginScreen.jsx"
import ErrorBoundary from "./ErrorBoundary.jsx"
import { MemoryProvider } from "./MemoryContext.jsx"

/**
 * Parse Supabase auth tokens from URL hash.
 * Magic links redirect to: origin/#access_token=...&refresh_token=...
 */
function getHashTokens() {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token && refresh_token) return { access_token, refresh_token };
  return null;
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh", background: "#0f0f23",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Söhne', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, animation: "pulse 1.5s ease-in-out infinite" }}>🧠</div>
      <div style={{
        width: 120, height: 3, borderRadius: 3, background: "#1a1a2e", overflow: "hidden",
      }}>
        <div style={{
          width: "40%", height: "100%", borderRadius: 3,
          background: "linear-gradient(90deg, #4ECDC4, #45B7D1)",
          animation: "slide 1.2s ease-in-out infinite",
        }} />
      </div>
      <style>{`
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: 0.7; } }
        @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
      `}</style>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    // If magic link tokens are in the URL hash, establish session from them
    const tokens = getHashTokens();
    if (tokens) {
      supabase.auth.setSession(tokens).then(({ data: { session } }) => {
        setSession(session);
        window.history.replaceState(null, "", window.location.pathname);
      });
      return;
    }

    // Normal startup — check existing session
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <LoadingScreen />
  if (!session) return <LoginScreen />
  return <ErrorBoundary><MemoryProvider><OpenBrain /></MemoryProvider></ErrorBoundary>
}
