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
      className="sticky top-0 z-30 flex items-center gap-2 border-b px-3 py-3 lg:hidden"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-outline-variant)",
        paddingTop: "max(12px, env(safe-area-inset-top))",
      }}
    >
      {/* Search tap target */}
      {onSearch && (
        <button
          onClick={onSearch}
          aria-label="Search"
          className="hover:bg-surface-container flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </button>
      )}

      {/* Brain switcher — fills remaining space, truncates */}
      <div className="min-w-0 flex-1">
        {children}
        {!isOnline && (
          <span
            className="ml-1 rounded-full px-2 py-1 text-[10px] font-semibold tracking-widest uppercase"
            style={{
              color: "var(--color-error)",
              background: "color-mix(in oklch, var(--color-error) 12%, transparent)",
            }}
          >
            Offline
          </span>
        )}
        {isOnline && pendingCount > 0 && (
          <span
            className="ml-1 rounded-full px-2 py-1 text-[10px] font-semibold tracking-widest uppercase"
            style={{
              color: "var(--color-secondary)",
              background: "var(--color-secondary-container)",
            }}
          >
            Syncing
          </span>
        )}
      </div>

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="hover:bg-surface-container flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors"
        style={{ color: "var(--color-on-surface-variant)" }}
      >
        {isDark ? (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
          </svg>
        )}
      </button>
    </header>
  );
}
