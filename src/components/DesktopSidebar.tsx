import type { ReactNode } from "react";
import { NavIcon } from "./icons/NavIcons";
import { Button } from "./ui/button";

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
  searchInput?: string;
  onSearchChange?: (v: string) => void;
  children?: ReactNode;
}

const NAV_ICONS: Record<string, ReactNode> = {
  home: NavIcon.home,
  capture: NavIcon.capture,
  memory: NavIcon.grid,
  chat: NavIcon.chat,
  timeline: NavIcon.timeline,
  vault: NavIcon.vault,
  settings: NavIcon.settings,
};

const SUN_ICON = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </svg>
);
const MOON_ICON = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
  >
    <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />
  </svg>
);
const PLUME_ICON = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
  >
    <path d="M5 19c3-9 8-14 14-14-1 6-4 12-12 14M8 12l4 4" />
  </svg>
);

export default function DesktopSidebar({
  activeBrainName: _activeBrainName,
  view,
  onNavigate,
  onCapture,
  isDark,
  onToggleTheme,
  isOnline: _isOnline,
  pendingCount: _pendingCount,
  onShowCreateBrain: _onShowCreateBrain,
  navViews,
  searchInput: _searchInput,
  onSearchChange: _onSearchChange,
  children,
}: DesktopSidebarProps) {
  return (
    <aside
      className="fixed top-0 left-0 z-40 hidden h-dvh flex-col lg:flex"
      style={{
        width: 240,
        background: "var(--surface-low)",
        borderRight: "1px solid var(--line-soft)",
        padding: "20px 12px",
      }}
    >
      {/* Brand — logo + serif wordmark, with editorial micro-tagline below.
          Click anywhere on the block returns to the memory tab. */}
      <button
        type="button"
        onClick={() => onNavigate("memory")}
        className="press"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "0 10px 18px",
          cursor: "pointer",
          background: "transparent",
          border: 0,
          textAlign: "left",
          width: "100%",
        }}
        aria-label="Everion — back to Memory"
      >
        <img
          src="/logoNew.webp"
          width={32}
          height={32}
          alt=""
          aria-hidden="true"
          decoding="async"
          style={{ flexShrink: 0, objectFit: "contain", display: "block", marginTop: 2 }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span
            className="f-serif"
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: "-0.015em",
              lineHeight: 1.05,
              color: "var(--ink)",
            }}
          >
            Everion
          </span>
          <span
            className="f-serif"
            style={{
              fontSize: 11,
              fontStyle: "italic",
              fontWeight: 400,
              letterSpacing: "0.01em",
              color: "var(--ink-faint)",
              lineHeight: 1.2,
            }}
          >
            second memory, quietly kept.
          </span>
        </span>
      </button>

      {/* Brain switcher slot */}
      {children && <div style={{ marginBottom: 12, padding: "0 2px" }}>{children}</div>}

      {/* Capture CTA — pill with plume, ember reserved for this primary */}
      <Button onClick={onCapture} className="mb-[18px] w-full">
        {PLUME_ICON}
        Capture
      </Button>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
          overflowX: "hidden",
        }}
        aria-label="Primary navigation"
      >
        {navViews.map((item) => {
          const isActive = view === item.id;
          const icon = NAV_ICONS[item.id] || NAV_ICONS.capture;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? "page" : undefined}
              className="press"
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "0 14px",
                minHeight: 40,
                height: 40,
                borderRadius: 6,
                fontFamily: "var(--f-sans)",
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? "var(--ink)" : "var(--ink-soft)",
                background: isActive ? "var(--surface)" : "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 180ms, color 180ms",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--surface)";
                  e.currentTarget.style.color = "var(--ink)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--ink-soft)";
                }
              }}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -4,
                    top: 8,
                    bottom: 8,
                    width: 2,
                    background: "var(--ember)",
                    borderRadius: 2,
                  }}
                />
              )}
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: isActive ? "var(--ink)" : "var(--ink-faint)",
                }}
              >
                {icon}
              </span>
              <span style={{ flex: 1 }}>{item.l}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        style={{
          paddingTop: 12,
          borderTop: "1px solid var(--line-soft)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <button
          onClick={() => onNavigate("settings")}
          aria-current={view === "settings" ? "page" : undefined}
          className="press"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            padding: "0 14px",
            minHeight: 40,
            height: 40,
            borderRadius: 6,
            fontFamily: "var(--f-sans)",
            fontSize: 14,
            fontWeight: 500,
            color: view === "settings" ? "var(--ink)" : "var(--ink-soft)",
            background: view === "settings" ? "var(--surface)" : "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", color: "var(--ink-faint)" }}>
            {NAV_ICONS.settings}
          </span>
          <span style={{ flex: 1 }}>Settings</span>
        </button>

        <button
          onClick={onToggleTheme}
          className="press"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            padding: "0 14px",
            minHeight: 40,
            height: 40,
            borderRadius: 6,
            fontFamily: "var(--f-sans)",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--ink-soft)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", color: "var(--ink-faint)" }}>
            {isDark ? SUN_ICON : MOON_ICON}
          </span>
          <span style={{ flex: 1 }}>{isDark ? "Light" : "Dark"} mode</span>
        </button>
      </div>
    </aside>
  );
}
