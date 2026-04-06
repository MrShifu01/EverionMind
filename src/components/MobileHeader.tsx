import type { ReactNode } from "react";
import { Brain, Sun, Moon, WifiOff, RefreshCw } from "lucide-react";

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
      className="md:hidden flex items-center gap-3 px-5 py-3"
      style={{
        background: isDark ? "rgba(14,14,14,0.8)" : "rgba(250,250,250,0.8)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: isDark ? "1px solid rgba(72,72,71,0.12)" : "1px solid rgba(0,0,0,0.06)",
      }}
    >
      {/* Brain identity */}
      <div
        className="flex h-10 w-10 min-w-10 items-center justify-center rounded-xl"
        style={{
          background: "linear-gradient(135deg, rgba(114,239,245,0.15), rgba(139,92,246,0.15))",
          border: "1px solid rgba(114,239,245,0.2)",
        }}
      >
        <Brain size={18} style={{ color: "#72eff5" }} />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="overflow-hidden text-sm font-bold text-ellipsis whitespace-nowrap"
          style={{ fontFamily: "'Manrope', sans-serif", color: isDark ? "#ffffff" : "#1a1a1a" }}
        >
          {brainName}
        </div>
        {(!isOnline || pendingCount > 0) && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium">
            {!isOnline ? (
              <>
                <WifiOff size={10} style={{ color: "#ff6e84" }} />
                <span style={{ color: "#ff6e84" }}>Offline</span>
              </>
            ) : (
              <>
                <RefreshCw size={10} style={{ color: "#72eff5" }} className="animate-spin" />
                <span style={{ color: "#72eff5" }}>{pendingCount} pending sync</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Injected content (BrainSwitcher) */}
      {children}

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        className="touch-target flex cursor-pointer items-center justify-center rounded-xl border transition-all duration-200 [-webkit-tap-highlight-color:transparent] hover:scale-105 active:scale-95"
        style={{
          background: isDark ? "#262626" : "#f0f0f0",
          borderColor: isDark ? "rgba(72,72,71,0.3)" : "rgba(0,0,0,0.1)",
          color: isDark ? "#adaaaa" : "#6b7280",
        }}
      >
        {isDark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </header>
  );
}
