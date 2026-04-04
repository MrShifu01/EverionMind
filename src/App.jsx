import { useState, useEffect } from "react"
import { supabase } from "./lib/supabase"
import OpenBrain from "./OpenBrain.jsx"
import LoginScreen from "./LoginScreen.jsx"
import ErrorBoundary from "./ErrorBoundary.jsx"
import { MemoryProvider } from "./MemoryContext.jsx"

/**
 * Detect if running as installed PWA (standalone mode).
 */
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

/**
 * Parse Supabase auth tokens from URL hash.
 * Magic links redirect to: origin/#access_token=...&refresh_token=...&...
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

export default function App() {
  const [session, setSession] = useState(undefined)
  const [pwaRedirect, setPwaRedirect] = useState(null) // URL to open in PWA

  useEffect(() => {
    const tokens = getHashTokens();

    // Case 1: Magic link opened in Safari (not the PWA)
    // → Show a button to redirect into the PWA with tokens
    if (tokens && !isStandalone()) {
      // Also set session in Safari so it works if not using PWA
      supabase.auth.setSession(tokens).then(({ data: { session } }) => {
        setSession(session);
      });
      // Build a URL that the PWA can open with tokens
      const pwaUrl = `${window.location.origin}/#access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`;
      setPwaRedirect(pwaUrl);
      // Clean URL hash
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    // Case 2: PWA opened with tokens in the hash (from Safari redirect)
    if (tokens && isStandalone()) {
      supabase.auth.setSession(tokens).then(({ data: { session } }) => {
        setSession(session);
        // Clean URL hash
        window.history.replaceState(null, "", window.location.pathname);
      });
      return;
    }

    // Normal startup — check existing session
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  // Show "Open in app" screen when magic link landed in Safari
  if (pwaRedirect && session) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0f0f23", color: "#e8e8e8",
        fontFamily: "'Söhne', system-ui, -apple-system, sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🧠</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>You're signed in!</h2>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: "#a0a0b8", lineHeight: 1.6 }}>
          If you have OpenBrain on your home screen, tap below to open the app.
          Otherwise you can continue here.
        </p>
        <a
          href={pwaRedirect}
          style={{
            display: "inline-block", padding: "14px 36px",
            background: "linear-gradient(135deg, #4ECDC4, #45B7D1)",
            borderRadius: 14, color: "#0f0f23", fontSize: 16, fontWeight: 800,
            textDecoration: "none", marginBottom: 12,
            boxShadow: "0 4px 24px #4ECDC440",
          }}
        >
          Open in OpenBrain app →
        </a>
        <button
          onClick={() => setPwaRedirect(null)}
          style={{
            background: "none", border: "none", color: "#4ECDC4",
            fontSize: 13, cursor: "pointer", padding: "8px 16px",
          }}
        >
          Continue in browser instead
        </button>
      </div>
    );
  }

  if (session === undefined) return null
  if (!session) return <LoginScreen />
  return <ErrorBoundary><MemoryProvider><OpenBrain /></MemoryProvider></ErrorBoundary>
}
