import { supabase } from "../../lib/supabase";

interface Props {
  email: string;
}

export default function AccountTab({ email }: Props) {
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
          onClick={() => supabase.auth.signOut()}
          className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
          style={{ color: "var(--color-error)", borderColor: "color-mix(in oklch, var(--color-error) 30%, transparent)" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
