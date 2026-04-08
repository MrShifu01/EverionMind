interface NudgeBannerProps {
  nudge: string;
  onDismiss: () => void;
}

export function NudgeBanner({ nudge, onDismiss }: NudgeBannerProps) {
  if (!nudge) return null;
  return (
    <div
      className="flex items-start gap-3 p-4 rounded-2xl mb-4 border"
      style={{
        background: "color-mix(in oklch, var(--color-primary) 8%, var(--color-surface))",
        borderColor: "color-mix(in oklch, var(--color-primary) 20%, transparent)",
      }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
        style={{ background: "color-mix(in oklch, var(--color-primary) 12%, transparent)" }}
      >
        💡
      </div>
      <p className="flex-1 text-sm text-on-surface-variant leading-relaxed">{nudge}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-on-surface-variant/50 hover:text-on-surface transition-colors flex-shrink-0 mt-0.5 press-scale"
      >
        <svg
          aria-hidden="true"
          className="w-4 h-4"
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
