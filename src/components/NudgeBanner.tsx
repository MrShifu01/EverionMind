interface NudgeBannerProps {
  nudge: string;
  onDismiss: () => void;
}

export function NudgeBanner({ nudge, onDismiss }: NudgeBannerProps) {
  if (!nudge) return null;
  return (
    <div
      className="mx-4 mt-4 mb-4 flex items-start gap-3 rounded-2xl border p-4"
      style={{
        background: "color-mix(in oklch, var(--color-primary) 8%, var(--color-surface))",
        borderColor: "color-mix(in oklch, var(--color-primary) 20%, transparent)",
      }}
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-base"
        style={{ background: "color-mix(in oklch, var(--color-primary) 12%, transparent)" }}
      >
        💡
      </div>
      <p className="text-on-surface-variant flex-1 text-sm leading-relaxed">{nudge}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-on-surface-variant/50 hover:text-on-surface press-scale mt-0.5 flex-shrink-0 transition-colors"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
