import { useState } from "react";

const DISMISS_KEY = "ob_early_access_dismissed";

export function EarlyAccessBanner() {
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));

  if (dismissed) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-4 py-3"
      style={{
        background: "color-mix(in oklch, var(--color-secondary) 6%, var(--color-surface))",
        borderColor: "color-mix(in oklch, var(--color-secondary) 15%, transparent)",
      }}
    >
      <span className="text-base">🎉</span>
      <p className="text-on-surface-variant flex-1 text-xs">
        <span className="text-on-surface font-semibold">Free during early access.</span>{" "}
        Starter plan coming soon. Early users get 50% off.
      </p>
      <button
        onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); }}
        aria-label="Dismiss"
        className="text-on-surface-variant/50 hover:text-on-surface flex-shrink-0"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
