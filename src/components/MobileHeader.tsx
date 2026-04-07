import type { ReactNode } from "react";

interface MobileHeaderProps {
  brainName: string;
  brainEmoji: string;
  onToggleTheme: () => void;
  isDark: boolean;
  isOnline: boolean;
  pendingCount: number;
  children?: ReactNode;
}

export default function MobileHeader({
  brainName: _brainName,
  onToggleTheme,
  isDark,
  isOnline,
  pendingCount,
  children,
}: MobileHeaderProps) {
  return (
    <header
      className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-outline-variant)",
        paddingTop: "max(12px, env(safe-area-inset-top))",
      }}
    >
      {/* Left — Logo + brain name */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: "var(--color-primary-container)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a5 5 0 0 1 5 5c0 1.5-.67 2.84-1.72 3.75A5 5 0 0 1 17 15a5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 1.72-3.75A5 5 0 0 1 7 7a5 5 0 0 1 5-5z"/>
            <circle cx="12" cy="12" r="1.5" fill="var(--color-primary)" stroke="none"/>
          </svg>
        </div>
        <h1
          className="font-bold text-primary text-base"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          Everion
        </h1>
      </div>

      {/* Status + actions */}
      <div className="flex items-center gap-1">
        {!isOnline && (
          <span
            className="text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full mr-1"
            style={{ color: "var(--color-error)", background: "color-mix(in oklch, var(--color-error) 12%, transparent)" }}
          >
            Offline
          </span>
        )}
        {isOnline && pendingCount > 0 && (
          <span
            className="text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full mr-1"
            style={{ color: "var(--color-secondary)", background: "var(--color-secondary-container)" }}
          >
            Syncing
          </span>
        )}

        {/* Brain switcher slot */}
        {children}

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-surface-container ml-1"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          {isDark ? (
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          ) : (
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
