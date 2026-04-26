/**
 * Pure presentational primitives extracted from ProfileTab so that file can
 * focus on persona orchestration. Each component below renders only from its
 * own props — no shared state with the parent.
 */

export function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        border: "1px solid var(--line-soft)",
        borderRadius: 6,
        background: "transparent",
        color: danger ? "var(--blood)" : "var(--ink-faint)",
        cursor: "pointer",
        fontSize: 14,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

export function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className="f-sans"
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "2px 6px",
        borderRadius: 999,
        background: muted ? "var(--surface-low)" : "var(--ember-wash)",
        color: muted ? "var(--ink-faint)" : "var(--ember)",
        border: muted
          ? "1px solid var(--line-soft)"
          : "1px solid color-mix(in oklch, var(--ember) 24%, transparent)",
      }}
    >
      {children}
    </span>
  );
}

export function BucketHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <h3
        className="f-serif"
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 500,
          color: "var(--ink)",
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </h3>
      <span className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
        {count}
      </span>
    </div>
  );
}

export function SectionTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <h2
      className="f-serif"
      style={{
        margin: 0,
        marginBottom: 6,
        fontSize: 18,
        fontWeight: 500,
        color: "var(--ink)",
        letterSpacing: "-0.005em",
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="f-sans"
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--ink-faint)",
      }}
    >
      {children}
    </label>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="f-serif"
      style={{
        margin: "4px 0 0",
        fontSize: 13,
        fontStyle: "italic",
        color: "var(--ink-faint)",
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

export function SubHint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="f-sans"
      style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-ghost)", textAlign: "right" }}
    >
      {children}
    </p>
  );
}

export function Loading() {
  return (
    <p
      className="f-serif"
      style={{ fontStyle: "italic", color: "var(--ink-faint)", padding: "16px 0", margin: 0 }}
    >
      Loading…
    </p>
  );
}
