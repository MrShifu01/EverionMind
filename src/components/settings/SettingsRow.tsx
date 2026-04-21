import type { ReactNode } from "react";

interface SettingsRowProps {
  label: string;
  hint?: ReactNode;
  children?: ReactNode;
  /** Last row in a group — hides the bottom divider */
  last?: boolean;
}

/**
 * Canonical Settings row from the redesign:
 *   - Serif 16/450 label on the left
 *   - Italic serif hint below the label
 *   - Right-aligned control slot (button, toggle, text, etc.)
 *   - Hairline divider below the row
 */
export default function SettingsRow({ label, hint, children, last }: SettingsRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "18px 0",
        borderBottom: last ? "none" : "1px solid var(--line-soft)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="f-serif"
          style={{
            fontSize: 16,
            fontWeight: 450,
            color: "var(--ink)",
            letterSpacing: "-0.005em",
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            className="f-serif"
            style={{
              fontSize: 13,
              color: "var(--ink-faint)",
              fontStyle: "italic",
              marginTop: 3,
              lineHeight: 1.5,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

/** Italic serif value — used for right-side informational text like "Hanno's brain". */
export function SettingsValue({ children }: { children: ReactNode }) {
  return (
    <span
      className="f-serif"
      style={{
        fontSize: 15,
        fontStyle: "italic",
        color: "var(--ink-soft)",
      }}
    >
      {children}
    </span>
  );
}

/** Secondary sans value — used for right-side plain text like "hanno@everion.app". */
export function SettingsText({ children }: { children: ReactNode }) {
  return (
    <span
      className="f-sans"
      style={{ fontSize: 14, color: "var(--ink)" }}
    >
      {children}
    </span>
  );
}

/** Tight secondary button sized for Settings rows (32px, 13px font). */
export function SettingsButton({
  onClick,
  disabled,
  danger,
  children,
  type = "button",
}: {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="press f-sans"
      style={{
        height: 32,
        minHeight: 32,
        padding: "0 14px",
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 8,
        background: danger ? "var(--blood-wash)" : "var(--surface)",
        color: danger ? "var(--blood)" : "var(--ink)",
        border: `1px solid ${danger ? "var(--blood)" : "var(--line)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 180ms, border-color 180ms",
      }}
    >
      {children}
    </button>
  );
}

/** Lightweight toggle switch — rounded pill with ember fill + dark handle when on. */
export function SettingsToggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
}) {
  const width = 40;
  const height = 22;
  const knob = 18;
  return (
    <button
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      className="press"
      style={{
        width,
        height,
        minHeight: height,
        borderRadius: 999,
        background: value ? "var(--ember)" : "var(--surface-high)",
        border: `1px solid ${value ? "var(--ember)" : "var(--line)"}`,
        position: "relative",
        transition: "background 200ms, border-color 200ms",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          left: value ? width - knob - 3 : 1,
          width: knob,
          height: knob,
          borderRadius: "50%",
          background: value ? "var(--ember-ink)" : "var(--ink-faint)",
          transition: "left 200ms cubic-bezier(.16,1,.3,1)",
        }}
      />
    </button>
  );
}
