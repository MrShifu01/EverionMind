import type { ReactNode } from "react";
import { NavIcon } from "./icons/NavIcons";

interface NavView {
  id: string;
  l: string;
  ic: string;
}

const SEARCH_ICON = (
  <svg
    aria-hidden="true"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

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
  searchInput: string;
  onSearchChange: (v: string) => void;
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
  searchInput,
  onSearchChange,
  children,
}: DesktopSidebarProps) {
  const isOffline = !isOnline;
  const isSyncing = isOnline && pendingCount > 0;
  const statusDotColor = isOffline
    ? "var(--ink-faint)"
    : isSyncing
      ? "var(--ember)"
      : "var(--moss)";
  const statusText = isOffline ? "offline" : isSyncing ? `${pendingCount} pending` : null;

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
      {/* Brand */}
      <div
        onClick={() => onNavigate("memory")}
        className="press"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px 16px",
          cursor: "pointer",
        }}
      >
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <path d="M8.5 3a3.5 3.5 0 0 0-3.5 3.5c-1.5.5-2.5 2-2.5 3.5 0 1 .5 2 1.5 2.5-.5.8-.5 2 0 3 .3.6.8 1 1.5 1.3-.2.9.1 2 .8 2.7.8.7 2 1 3 .5.3 1 1.3 2 2.7 2A2.5 2.5 0 0 0 14.5 20V4.5A1.5 1.5 0 0 0 13 3M15.5 3A3.5 3.5 0 0 1 19 6.5c1.5.5 2.5 2 2.5 3.5 0 1-.5 2-1.5 2.5.5.8.5 2 0 3-.3.6-.8 1-1.5 1.3.2.9-.1 2-.8 2.7-.8.7-2 1-3 .5-.3 1-1.3 2-2.7 2A2.5 2.5 0 0 1 9.5 20V4.5A1.5 1.5 0 0 1 11 3" />
        </svg>
        <span
          className="f-serif"
          style={{ fontSize: 20, fontWeight: 450, letterSpacing: "-0.01em", color: "var(--ink)" }}
        >
          Everion
        </span>
      </div>

      {/* Brain plate */}
      <div
        style={{
          marginBottom: 12,
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            flexShrink: 0,
            background: statusDotColor,
          }}
        />
        <span
          className="f-serif"
          style={{
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={activeBrainName}
        >
          {activeBrainName || "Your brain"}
        </span>
      </div>
      {statusText && (
        <div
          className="micro"
          style={{ padding: "0 10px 10px", color: isOffline ? "var(--ink-faint)" : "var(--ember)" }}
        >
          {statusText}
        </div>
      )}

      {/* Brain switcher slot */}
      {children && <div style={{ marginBottom: 12, padding: "0 2px" }}>{children}</div>}

      {/* Capture CTA — pill with plume, ember reserved for this primary */}
      <button
        onClick={onCapture}
        className="press"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "0 14px",
          height: 40,
          minHeight: 40,
          marginBottom: 18,
          borderRadius: 8,
          background: "var(--ember)",
          color: "var(--ember-ink)",
          fontFamily: "var(--f-sans)",
          fontWeight: 500,
          fontSize: 14,
          border: "none",
          cursor: "pointer",
          letterSpacing: "-0.005em",
        }}
      >
        {PLUME_ICON}
        Capture
      </button>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 8px 0 12px",
          height: 36,
          marginBottom: 14,
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
          color: "var(--ink-faint)",
        }}
      >
        {SEARCH_ICON}
        <input
          // type=search + name="memory-search" + autoComplete="off"
          // disable Safari/Chrome's credential autofill, which was
          // sometimes prefilling the user's email here and silently
          // distorting the memory grid. data-* attrs cover password
          // managers (1Password, Bitwarden, LastPass) too.
          type="search"
          name="memory-search"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search everything…"
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: "var(--f-sans)",
            fontSize: 13,
            color: "var(--ink)",
          }}
        />
        {searchInput && (
          <button
            onClick={() => onSearchChange("")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ink-faint)",
              padding: 0,
              lineHeight: 1,
              fontSize: 16,
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

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
