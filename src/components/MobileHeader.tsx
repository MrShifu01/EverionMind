import type { ReactNode } from "react";

interface MobileHeaderProps {
  brainName: string;
  brainEmoji: string;
  onToggleTheme: () => void;
  isDark: boolean;
  isOnline: boolean;
  pendingCount: number;
  onSearch?: () => void;
  children?: ReactNode;
}

export default function MobileHeader({
  brainName: _brainName,
  onToggleTheme,
  isDark,
  isOnline,
  pendingCount,
  onSearch,
  children,
}: MobileHeaderProps) {
  return (
    <header
      className="glass-panel-dark safe-top sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-3 lg:hidden"
      style={{
        borderBottom: "1px solid var(--color-outline-variant)",
        paddingTop: "max(12px, env(safe-area-inset-top))",
      }}
    >
      {/* Left: search / brain slot / status */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {onSearch && (
          <button
            onClick={onSearch}
            aria-label="Search"
            className="press"
            style={{
              width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 10, color: "var(--color-on-surface-variant)",
            }}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
          </button>
        )}
        {children}
        {!isOnline && (
          <span style={{
            borderRadius: 999, padding: "3px 8px",
            fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase",
            color: "var(--color-error)",
            background: "color-mix(in oklch, var(--color-error) 12%, transparent)",
          }}>Offline</span>
        )}
        {isOnline && pendingCount > 0 && (
          <span style={{
            borderRadius: 999, padding: "3px 8px",
            fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase",
            color: "var(--color-secondary)",
            background: "var(--color-secondary-container)",
          }}>Syncing</span>
        )}
      </div>

      {/* Centre: brand — absolutely centred */}
      <span style={{ position: "absolute", left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <span className="font-headline gradient-text" style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em" }}>
          Everion Mind
        </span>
      </span>

      {/* Right: theme toggle */}
      <button
        onClick={onToggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="press"
        style={{
          width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 10, color: "var(--color-on-surface-variant)",
        }}
      >
        {isDark ? (
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2 12h2M20 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/>
          </svg>
        ) : (
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/>
          </svg>
        )}
      </button>
    </header>
  );
}
