import type { ReactNode } from "react";

interface MobileHeaderProps {
  onToggleTheme: () => void;
  isDark: boolean;
  isOnline: boolean;
  pendingCount: number;
  onSearch?: () => void;
  children?: ReactNode;
}

export default function MobileHeader({
  onToggleTheme,
  isDark,
  isOnline,
  pendingCount,
  onSearch,
  children,
}: MobileHeaderProps) {
  const statusColor = !isOnline ? "var(--ink-faint)" : pendingCount > 0 ? "var(--ember)" : "var(--moss)";
  return (
    <header
      className="safe-top sticky top-0 z-30 flex items-center justify-between gap-2 px-4 py-3 lg:hidden"
      style={{
        background: "var(--bg)",
        borderBottom: "1px solid var(--line-soft)",
        paddingTop: "max(14px, env(safe-area-inset-top))",
      }}
    >
      {/* Left: brand + brain */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        <span
          className="f-serif"
          style={{ fontSize: 17, fontWeight: 450, letterSpacing: "-0.01em", color: "var(--ink)" }}
        >
          Everion
        </span>
        <span
          aria-hidden="true"
          style={{ width: 4, height: 4, borderRadius: "50%", background: statusColor, flexShrink: 0 }}
          title={!isOnline ? "offline" : pendingCount > 0 ? `${pendingCount} pending` : "synced"}
        />
        {children}
      </div>

      {/* Right: search, theme */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
        {onSearch && (
          <button
            onClick={onSearch}
            aria-label="Search"
            className="press"
            style={{
              width: 36, height: 36, minHeight: 36,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6, color: "var(--ink-soft)", background: "transparent", border: 0,
            }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.5-3.5"/>
            </svg>
          </button>
        )}
        <button
          onClick={onToggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="press"
          style={{
            width: 36, height: 36, minHeight: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 6, color: "var(--ink-soft)", background: "transparent", border: 0,
          }}
        >
          {isDark ? (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>
            </svg>
          ) : (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
