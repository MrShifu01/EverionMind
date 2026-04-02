import { useState, useEffect } from "react"
import { supabase } from "./lib/supabase"
import OpenBrain from "./OpenBrain.jsx"
import LoginScreen from "./LoginScreen.jsx"

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <LoginScreen />
  return <OpenBrain />
}
