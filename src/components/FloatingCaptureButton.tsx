interface FloatingCaptureButtonProps {
  onClick: () => void;
}

export default function FloatingCaptureButton({ onClick }: FloatingCaptureButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Capture a thought"
      title="Capture (Ctrl+K)"
      className="press-scale fixed right-5 bottom-24 z-40 flex h-14 w-14 items-center justify-center rounded-full lg:bottom-8"
      style={{
        background: "var(--color-primary)",
        color: "var(--color-on-primary)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <svg
        aria-hidden="true"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  );
}
