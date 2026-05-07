interface InboxTriageCardProps {
  stagedCount: number;
}

export default function InboxTriageCard({ stagedCount }: InboxTriageCardProps) {
  if (stagedCount === 0) return null;

  function openInbox() {
    // Open the staging inbox modal directly. Listener lives in Everion.tsx
    // and renders <GmailStagingInbox> at root — no Settings detour.
    window.dispatchEvent(new CustomEvent("everion:open-gmail-inbox"));
  }

  return (
    <button
      type="button"
      onClick={openInbox}
      className="press"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        background: "color-mix(in oklch, var(--ember) 8%, var(--surface-high))",
        border: "1px solid color-mix(in oklch, var(--ember) 30%, var(--line-soft))",
        borderRadius: 18,
        padding: "16px 20px",
        cursor: "pointer",
        textAlign: "left",
        boxShadow: "var(--lift-1)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "var(--ember)",
          color: "var(--ember-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="f-sans" style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
          {stagedCount} email{stagedCount === 1 ? "" : "s"} waiting for triage
        </div>
        <div
          className="f-serif"
          style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-soft)", marginTop: 2 }}
        >
          decide what stays in your brain · what doesn't.
        </div>
      </div>
      <span aria-hidden="true" style={{ color: "var(--ink-faint)", fontSize: 18, flexShrink: 0 }}>
        →
      </span>
    </button>
  );
}
