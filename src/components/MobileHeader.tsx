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
  brainName,
  onToggleTheme,
  isDark,
  isOnline,
  pendingCount,
  children,
}: MobileHeaderProps) {
  return (
    <header
      className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b glass-panel-dark"
      style={{
        borderColor: "rgba(72,72,71,0.10)",
        paddingTop: "max(12px, env(safe-area-inset-top))",
      }}
    >
      {/* Left — Logo + brain name */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(114,239,245,0.15), rgba(213,117,255,0.15))",
            border: "1px solid rgba(114,239,245,0.2)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#72eff5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a5 5 0 0 1 5 5c0 1.5-.67 2.84-1.72 3.75A5 5 0 0 1 17 15a5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 1.72-3.75A5 5 0 0 1 7 7a5 5 0 0 1 5-5z"/>
            <circle cx="12" cy="12" r="1.5" fill="#72eff5" stroke="none"/>
          </svg>
        </div>
        <h1
          className="font-bold text-on-surface text-base"
          style={{ fontFamily: "'Manrope', sans-serif" }}
        >
          OB
        </h1>
      </div>

      {/* Status + actions */}
      <div className="flex items-center gap-1">
        {!isOnline && (
          <span
            className="text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full mr-1"
            style={{ color: "#ff6e84", background: "rgba(255,110,132,0.1)" }}
          >
            Offline
          </span>
        )}
        {isOnline && pendingCount > 0 && (
          <span
            className="text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full mr-1"
            style={{ color: "#72eff5", background: "rgba(114,239,245,0.1)" }}
          >
            Syncing
          </span>
        )}

        {/* Brain switcher slot */}
        {children}

        {/* Theme toggle removed — app is dark-mode only */}
      </div>
    </header>
  );
}
