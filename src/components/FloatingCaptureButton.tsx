interface FloatingCaptureButtonProps {
  onClick: () => void;
}

// Desktop-only floating capture pill — serif italic "remember…" in a soft pill.
// Mobile uses the center FAB in BottomNav instead.
export default function FloatingCaptureButton({ onClick }: FloatingCaptureButtonProps) {
  const mod = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl";
  return (
    <button
      onClick={onClick}
      aria-label="Capture something"
      title="Capture (Ctrl+K)"
      className="press fixed right-6 bottom-8 z-40 hidden items-center gap-2 lg:flex"
      style={{
        height: 44,
        minHeight: 44,
        padding: "0 10px 0 18px",
        borderRadius: 28,
        background: "var(--surface-high)",
        border: "1px solid var(--line)",
        color: "var(--ink-soft)",
        boxShadow: "var(--lift-2)",
        fontFamily: "var(--f-sans)",
        fontSize: 14,
      }}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
        style={{ color: "var(--ember)" }}
      >
        <path d="M5 19c3-9 8-14 14-14-1 6-4 12-12 14M8 12l4 4" />
      </svg>
      <span className="f-serif" style={{ fontSize: 14, fontStyle: "italic" }}>
        capture…
      </span>
      <span
        className="f-sans"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          padding: "3px 6px",
          marginLeft: 4,
          background: "var(--surface-low)",
          border: "1px solid var(--line)",
          borderRadius: 4,
          fontSize: 11,
          color: "var(--ink-faint)",
          fontWeight: 500,
        }}
      >
        {mod}K
      </span>
    </button>
  );
}
