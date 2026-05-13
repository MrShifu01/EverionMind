interface Props {
  unlocked: boolean;
  onTap: () => void;
  size?: number;
  label?: string;
}

export function VaultBrassDial({ unlocked, onTap, size = 140, label }: Props) {
  const tickOffset = size / 2 - 10;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label || (unlocked ? "Lock vault" : "Unlock vault")}
      className="press"
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        background: unlocked
          ? "radial-gradient(circle at 50% 30%, color-mix(in oklch, var(--ember) 30%, var(--surface)) 0%, var(--surface) 50%, var(--surface-low) 100%)"
          : "radial-gradient(circle at 50% 30%, color-mix(in oklch, var(--ember) 18%, var(--surface)) 0%, var(--surface) 50%, var(--surface-low) 100%)",
        border: `1px solid color-mix(in oklch, var(--ember) ${unlocked ? 60 : 30}%, transparent)`,
        boxShadow: unlocked
          ? "var(--lift-2), inset 0 -6px 16px var(--scrim), 0 0 28px color-mix(in oklch, var(--ember) 30%, transparent)"
          : "var(--lift-2), inset 0 -6px 16px var(--scrim)",
        cursor: "pointer",
        padding: 0,
        transition: "all 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 10,
          borderRadius: "50%",
          border: `1px solid color-mix(in oklch, var(--ember) ${unlocked ? 50 : 22}%, transparent)`,
        }}
      />
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 22,
          borderRadius: "50%",
          background: unlocked
            ? "radial-gradient(circle at 35% 30%, color-mix(in oklch, var(--ember) 55%, var(--ember-deep)), var(--ember-deep))"
            : "var(--surface-dim)",
          border: `1px solid color-mix(in oklch, var(--ember) ${unlocked ? 75 : 38}%, transparent)`,
          boxShadow: unlocked
            ? "inset 0 1px 0 color-mix(in oklch, var(--ember) 80%, white), 0 0 16px color-mix(in oklch, var(--ember) 40%, transparent)"
            : "inset 0 4px 12px oklch(4% 0.01 250 / 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: unlocked ? "var(--ember-ink)" : "var(--ember)",
          transition: "all 320ms ease",
        }}
      >
        {unlocked ? (
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0" />
          </svg>
        ) : (
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
      </span>
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 1.5,
            height: 6,
            background:
              i % 3 === 0 ? "color-mix(in oklch, var(--ember) 70%, transparent)" : "var(--line)",
            transformOrigin: `50% ${tickOffset}px`,
            transform: `translate(-50%, -${tickOffset}px) rotate(${i * 30}deg)`,
          }}
        />
      ))}
    </button>
  );
}
