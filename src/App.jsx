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

  if (session === undefined) return null
  if (!session) return <LoginScreen />
  return <ErrorBoundary><MemoryProvider><OpenBrain /></MemoryProvider></ErrorBoundary>
}
