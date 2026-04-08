import { useState } from "react";
import { supabase } from "../../lib/supabase";

interface Props {
  email: string;
}

export default function AccountTab({ email }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
      setSigningOut(false);
    }
  };

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-on-surface">Account</p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>{email}</p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5 disabled:opacity-40"
          style={{ color: "var(--color-error)", borderColor: "color-mix(in oklch, var(--color-error) 30%, transparent)" }}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
      {error && <p className="text-xs mt-2" style={{ color: "var(--color-error)" }}>{error}</p>}
    </div>
  );
}
