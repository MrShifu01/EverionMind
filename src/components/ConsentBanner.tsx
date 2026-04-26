const CONSENT_KEY = "everion_analytics_consent";

export function getConsentDecision(): "accepted" | "declined" | null {
  const val = localStorage.getItem(CONSENT_KEY);
  if (val === "accepted" || val === "declined") return val;
  return null;
}

interface ConsentBannerProps {
  onDecision: (decision: "accepted" | "declined") => void;
}

export function ConsentBanner({ onDecision }: ConsentBannerProps) {
  function decide(decision: "accepted" | "declined") {
    localStorage.setItem(CONSENT_KEY, decision);
    onDecision(decision);
  }

  return (
    <div
      className="fixed right-0 bottom-0 left-0 z-50 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
      style={{
        background: "var(--color-surface-container-high)",
        borderTop: "1px solid var(--color-outline-variant)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
        This app uses{" "}
        <a href="https://sentry.io" target="_blank" rel="noopener noreferrer" className="underline">
          Sentry
        </a>{" "}
        for error tracking and{" "}
        <a
          href="https://vercel.com/docs/speed-insights"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Vercel Speed Insights
        </a>{" "}
        for performance monitoring. No personal data is collected.{" "}
        <a href="/privacy" className="underline">
          Privacy policy
        </a>
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => decide("declined")}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{
            background: "var(--color-surface-container)",
            color: "var(--color-on-surface-variant)",
          }}
        >
          Decline
        </button>
        <button
          onClick={() => decide("accepted")}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
