import { Brain, Sun, Moon, WifiOff, RefreshCw, Plus } from "lucide-react";
import type { ReactNode } from "react";

interface NavView {
  id: string;
  l: string;
  ic: string;
}

interface DesktopSidebarProps {
  activeBrainName: string;
  view: string;
  onNavigate: (id: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isOnline: boolean;
  pendingCount: number;
  entryCount: number;
  onShowCreateBrain: () => void;
  navViews: NavView[];
  children?: ReactNode; // BrainSwitcher
}

const ALL_NAV: NavView[] = [
  { id: "capture", l: "Home", ic: "⌂" },
];

export default function DesktopSidebar({
  activeBrainName,
  view,
  onNavigate,
  isDark,
  onToggleTheme,
  isOnline,
  pendingCount,
  entryCount,
  onShowCreateBrain,
  navViews,
  children,
}: DesktopSidebarProps) {
  const allItems = [...ALL_NAV, ...navViews];

  const surfaceBg = isDark ? "rgba(26,25,25,0.95)" : "rgba(255,255,255,0.95)";
  const borderColor = isDark ? "rgba(72,72,71,0.18)" : "rgba(0,0,0,0.08)";
  const textMuted = isDark ? "#777575" : "#9ca3af";

  return (
    <aside
      className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-[800] w-[220px] select-none"
      style={{
        background: surfaceBg,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRight: `1px solid ${borderColor}`,
      }}
    >
      {/* Brain identity */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="flex h-9 w-9 min-w-9 items-center justify-center rounded-xl flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(114,239,245,0.15), rgba(139,92,246,0.15))",
              border: "1px solid rgba(114,239,245,0.2)",
            }}
          >
            <Brain size={16} style={{ color: "#72eff5" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-bold truncate leading-tight"
              style={{ fontFamily: "'Manrope', sans-serif", color: isDark ? "#fff" : "#1a1a1a" }}
            >
              {activeBrainName}
            </div>
            {(!isOnline || pendingCount > 0) && (
              <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium">
                {!isOnline ? (
                  <>
                    <WifiOff size={9} style={{ color: "#ff6e84" }} />
                    <span style={{ color: "#ff6e84" }}>Offline</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={9} style={{ color: "#72eff5" }} className="animate-spin" />
                    <span style={{ color: "#72eff5" }}>{pendingCount} syncing</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Brain switcher injected here */}
        {children}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-none">
        {allItems.map((item) => {
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left cursor-pointer border-none bg-transparent transition-all duration-150 rounded-none"
              style={{
                background: isActive
                  ? isDark
                    ? "rgba(114,239,245,0.08)"
                    : "rgba(8,145,178,0.07)"
                  : "transparent",
                color: isActive
                  ? isDark
                    ? "#72eff5"
                    : "#0891b2"
                  : isDark
                    ? "#adaaaa"
                    : "#6b7280",
                borderLeft: isActive
                  ? `2px solid ${isDark ? "#72eff5" : "#0891b2"}`
                  : "2px solid transparent",
              }}
            >
              <span className="text-base w-5 text-center leading-none flex-shrink-0">{item.ic}</span>
              <span
                className="text-[13px] leading-snug"
                style={{ fontWeight: isActive ? 600 : 400 }}
              >
                {item.l}
              </span>
              {item.id === "suggest" && (
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: "#ff6b35" }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 pb-5 pt-3" style={{ borderTop: `1px solid ${borderColor}` }}>
        <button
          onClick={onShowCreateBrain}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold cursor-pointer border mb-3 transition-opacity hover:opacity-80"
          style={{
            background: isDark ? "rgba(124,143,240,0.08)" : "rgba(124,143,240,0.06)",
            borderColor: "rgba(124,143,240,0.25)",
            color: "#a5b4fc",
          }}
        >
          <Plus size={13} />
          Add Brain
        </button>

        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: textMuted }}>
            {entryCount} memories
          </span>
          <button
            onClick={onToggleTheme}
            aria-label={isDark ? "Switch to light" : "Switch to dark"}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition-all hover:scale-105 active:scale-95"
            style={{
              background: isDark ? "#262626" : "#f0f0f0",
              borderColor: isDark ? "rgba(72,72,71,0.3)" : "rgba(0,0,0,0.1)",
              color: isDark ? "#adaaaa" : "#6b7280",
            }}
          >
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
