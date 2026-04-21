import type { ReactNode } from "react";
import { NavIcon } from "./icons/NavIcons";
import { EverionLogo } from "./ui/EverionLogo";

interface NavView {
  id: string;
  l: string;
  ic: string;
}

interface DesktopSidebarProps {
  activeBrainName: string;
  view: string;
  onNavigate: (id: string) => void;
  onCapture: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isOnline: boolean;
  pendingCount: number;
  entryCount: number;
  onShowCreateBrain: () => void;
  navViews: NavView[];
  children?: ReactNode;
}

const NAV_ICONS: Record<string, ReactNode> = {
  capture: NavIcon.capture,
  memory: NavIcon.grid,
  chat: NavIcon.chat,
  todos: NavIcon.todos,
  timeline: NavIcon.timeline,
  vault: NavIcon.vault,
  settings: NavIcon.settings,
};

const SUN_ICON = (
  <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2 12h2M20 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/>
  </svg>
);
const MOON_ICON = (
  <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/>
  </svg>
);

export default function DesktopSidebar({
  activeBrainName,
  view,
  onNavigate,
  onCapture,
  isDark,
  onToggleTheme,
  isOnline,
  pendingCount,
  onShowCreateBrain: _onShowCreateBrain,
  navViews,
  children,
}: DesktopSidebarProps) {
  const isOffline = !isOnline;
  const isSyncing = isOnline && pendingCount > 0;
  const statusText = isOffline ? "Offline" : isSyncing ? `Syncing ${pendingCount}…` : null;

  return (
    <aside
      className="fixed top-0 left-0 z-40 hidden h-dvh w-72 flex-col px-[18px] py-6 lg:flex"
      style={{
        background: "var(--color-background)",
        borderRight: "1px solid var(--color-surface-container)",
      }}
    >
      {/* Brand */}
      <div style={{ marginBottom: 20, padding: "0 6px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <EverionLogo size={20} />
            <h1 className="font-headline gradient-text" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.04em" }}>
              Everion Mind
            </h1>
          </div>
          <div className="caps-label" style={{ marginTop: 3, opacity: 0.5 }}>Neural Interface</div>
        </div>
      </div>

      {/* Brain switcher slot */}
      {children && (
        <div style={{ marginBottom: 16, padding: "0 2px" }}>{children}</div>
      )}

      {/* New Entry CTA */}
      <button
        onClick={onCapture}
        className="press cta-glow"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "12px 14px", marginBottom: 22, marginLeft: 2, marginRight: 2,
          borderRadius: "var(--radius-xl)",
          background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-container))",
          color: "var(--color-on-primary)",
          fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 14,
          border: "none", cursor: "pointer", width: "calc(100% - 4px)",
        }}
      >
        <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        New Entry
      </button>

      {/* Navigation */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", overflowX: "hidden" }} aria-label="Primary navigation">
        <div className="caps-label" style={{ padding: "8px 14px 6px", opacity: 0.5 }}>Brain</div>
        {navViews.map((item) => {
          const isActive = view === item.id;
          const icon = NAV_ICONS[item.id] || NAV_ICONS.capture;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={`nav-item press ${isActive ? "active" : ""}`}
            >
              <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
              <span style={{ flex: 1 }}>{item.l}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ paddingTop: 16, borderTop: "1px solid var(--color-surface-container)", display: "flex", flexDirection: "column", gap: 4 }}>
        <button
          onClick={() => onNavigate("settings")}
          className={`nav-item press ${view === "settings" ? "active" : ""}`}
        >
          <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.settings}</span>
          <span style={{ flex: 1 }}>Settings</span>
        </button>

        <button
          onClick={onToggleTheme}
          className="nav-item press"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span style={{ display: "flex", alignItems: "center", color: "var(--color-on-surface-variant)" }}>
            {isDark ? SUN_ICON : MOON_ICON}
          </span>
          <span style={{ flex: 1 }}>{isDark ? "Light" : "Dark"} mode</span>
          <span style={{
            width: 32, height: 18, borderRadius: 999,
            background: "var(--color-surface-container-highest)",
            position: "relative", display: "inline-block", flexShrink: 0,
          }}>
            <span style={{
              position: "absolute", top: 2,
              left: isDark ? 2 : 16,
              width: 14, height: 14, borderRadius: "50%",
              background: "var(--color-primary)",
              transition: "left 0.25s",
            }} />
          </span>
        </button>

        {statusText && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px" }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: isOffline ? "var(--color-error)" : "var(--color-secondary)",
              boxShadow: isOffline ? "none" : "0 0 8px var(--color-secondary)",
            }} />
            <span className="caps-label" style={{ opacity: 0.6 }}>{statusText}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
