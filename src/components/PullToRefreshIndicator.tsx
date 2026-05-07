interface Props {
  pullDistance: number;
  refreshing: boolean;
  threshold?: number;
}

// Thin overlay rendered as the first child inside the scroll container.
// position:absolute so it doesn't take layout space; appears as the user
// drags and rotates / spins as they pass the threshold. We render
// nothing when idle so it can't interfere with hit testing on the
// content underneath.
export default function PullToRefreshIndicator({
  pullDistance,
  refreshing,
  threshold = 72,
}: Props) {
  if (pullDistance <= 0 && !refreshing) return null;

  const progress = Math.min(1, pullDistance / threshold);
  const ready = pullDistance >= threshold;
  const translate = Math.min(pullDistance, threshold);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        transform: `translateY(${translate - 32}px)`,
        transition: refreshing ? "transform 200ms ease" : "none",
        zIndex: 5,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: "var(--surface-high)",
          border: "1px solid var(--line-soft)",
          boxShadow: "var(--lift-1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ember)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            // While dragging: arrow rotates with progress (0 → 180deg = flip).
            // When refreshing: continuous spin.
            animation: refreshing ? "spin 0.8s linear infinite" : undefined,
            transform: refreshing ? undefined : `rotate(${progress * 180}deg)`,
            transition: refreshing ? undefined : "transform 80ms linear",
            opacity: refreshing ? 1 : 0.4 + progress * 0.6,
          }}
        >
          {refreshing ? (
            <>
              {/* Spinner — partial circle */}
              <path d="M21 12a9 9 0 1 1-6.2-8.55" />
            </>
          ) : (
            <>
              {/* Down arrow that rotates to up at threshold */}
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
              {/* Hint that we're armed */}
              {ready ? <circle cx="12" cy="12" r="10" opacity={0.15} /> : null}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
