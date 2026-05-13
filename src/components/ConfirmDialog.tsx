import { useEffect, useState } from "react";

interface Props {
  title: string;
  body: string | string[];
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({ title, body, confirmLabel, danger, onCancel, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const paragraphs = Array.isArray(body) ? body : [body];

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
      onCancel();
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  const accent = danger ? "var(--blood)" : "var(--ember)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadein 200ms ease both",
      }}
    >
      <div
        onClick={() => !submitting && onCancel()}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "color-mix(in oklch, oklch(8% 0.01 250) 68%, transparent)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 360,
          padding: "20px 20px 16px",
          background: `linear-gradient(180deg, color-mix(in oklch, ${accent} 8%, var(--surface-high)), var(--surface-high))`,
          border: `1px solid color-mix(in oklch, ${accent} 28%, var(--line-soft))`,
          borderRadius: 18,
          boxShadow: "var(--lift-3)",
          animation: "slide-up 280ms cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: `color-mix(in oklch, ${accent} 18%, var(--surface-low))`,
              border: `1px solid color-mix(in oklch, ${accent} 46%, transparent)`,
              color: accent,
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {danger ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 17h0" />
              </svg>
            )}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id="confirm-dialog-title"
              className="f-serif"
              style={{
                fontSize: 19,
                color: "var(--ink)",
                letterSpacing: "-0.015em",
                lineHeight: 1.2,
              }}
            >
              {title}
            </div>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  className="f-serif"
                  style={{
                    fontSize: 13.5,
                    color: "var(--ink-soft)",
                    lineHeight: 1.45,
                    margin: 0,
                    fontStyle: "italic",
                  }}
                >
                  {p}
                </p>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="press"
            style={{
              flex: 1,
              padding: "10px 0",
              background: "var(--surface-low)",
              border: "1px solid var(--line-soft)",
              borderRadius: 999,
              color: "var(--ink)",
              cursor: submitting ? "default" : "pointer",
              fontFamily: "var(--f-sans)",
              fontSize: 13,
              fontWeight: 500,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={handleConfirm}
            disabled={submitting}
            className="press"
            style={{
              flex: 1,
              padding: "10px 0",
              background: accent,
              color: danger ? "white" : "var(--ember-ink)",
              border: "none",
              borderRadius: 999,
              cursor: submitting ? "default" : "pointer",
              fontFamily: "var(--f-sans)",
              fontSize: 13,
              fontWeight: 700,
              boxShadow: `0 0 14px color-mix(in oklch, ${accent} 38%, transparent)`,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "working…" : confirmLabel.toLowerCase()}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(20px) scale(0.96) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}
