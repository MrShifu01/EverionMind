import { useState, useEffect } from "react"
import { supabase } from "./lib/supabase"
import OpenBrain from "./OpenBrain.jsx"
import LoginScreen from "./LoginScreen.jsx"
import ErrorBoundary from "./ErrorBoundary.jsx"
import { MemoryProvider } from "./MemoryContext.jsx"

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <LoginScreen />
  return <ErrorBoundary><MemoryProvider><OpenBrain /></MemoryProvider></ErrorBoundary>
}
