import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { NavIcon } from "./icons/NavIcons";
import { EverionLogo } from "./ui/EverionLogo";

interface NavView {
  id: string;
  l: string;
  ic: string;
}

const NAV_ICONS: Record<string, ReactNode> = {
  capture: NavIcon.capture,
  grid: NavIcon.grid,
  refine: NavIcon.refine,
  todos: NavIcon.todos,
  timeline: NavIcon.timeline,
  vault: NavIcon.vault,
  chat: NavIcon.chat,
  settings: NavIcon.settings,
};

const MOON_ICON = (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
    />
  </svg>
);

const SUN_ICON = (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
    />
  </svg>
);

const CAPTURE_NAV: NavView = { id: "capture", l: "Home", ic: "⌂" };

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

interface NavItemProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: string;
}

function NavItem({ id, label, isActive, onClick, badge }: NavItemProps) {
  const icon = NAV_ICONS[id] || NAV_ICONS.capture;
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group press-scale flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-all duration-200",
        isActive
          ? "font-semibold"
          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container",
      )}
      style={
        isActive
          ? {
              background: "color-mix(in oklch, var(--color-primary) 8%, transparent)",
              color: "var(--color-primary)",
            }
          : undefined
      }
    >
      <span
        className={cn(
          "transition-colors",
          isActive ? "text-inherit" : "group-hover:text-on-surface text-inherit",
        )}
      >
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="bg-secondary text-on-secondary rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function DesktopSidebar({
  activeBrainName: _activeBrainName,
  view,
  onNavigate,
  onCapture,
  isDark,
  onToggleTheme,
  isOnline,
  pendingCount,
  entryCount: _entryCount,
  onShowCreateBrain,
  navViews,
  children,
}: DesktopSidebarProps) {
  const allItems = [CAPTURE_NAV, ...navViews];

  const isOffline = !isOnline;
  const isSyncing = isOnline && pendingCount > 0;
  const statusText = isOffline ? "Offline" : isSyncing ? `Syncing ${pendingCount}…` : null;

  return (
    <aside
      className="fixed top-0 left-0 z-40 hidden h-dvh w-72 flex-col border-r px-4 py-6 lg:flex"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      {/* ── Brand row ── */}
      <div className="mb-6 px-2">
        <div className="mb-1 flex items-center gap-2">
          <EverionLogo size={22} />
          <h1
            className="text-primary text-2xl font-bold tracking-tight"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Everion
          </h1>
        </div>
        <p className="text-on-surface-variant/50 mt-0.5 text-xs">Your thinking, preserved.</p>
      </div>

      {/* ── Brain Switcher slot ── */}
      {children && <div className="mb-4 px-2">{children}</div>}

      {/* ── New Entry CTA ── */}
      <button
        onClick={onCapture}
        className="press-scale text-on-primary bg-primary hover:bg-primary-dim mx-2 mt-1 mb-8 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-150"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New Entry
      </button>

      {/* ── Navigation ── */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="Primary navigation">
        {allItems.map((item) => (
          <NavItem
            key={item.id}
            id={item.id}
            label={item.l}
            isActive={view === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>

      {/* ── Footer ── */}
      <div
        className="mt-4 space-y-1 pt-4"
        style={{ borderTop: "1px solid var(--color-outline-variant)" }}
      >
        <NavItem
          id="settings"
          label="Settings"
          isActive={view === "settings"}
          onClick={() => onNavigate("settings")}
        />

        {/* Status row: error/sync indicator + theme toggle + new brain */}
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-2">
            {statusText && (
              <>
                <div
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{
                    background: isOffline ? "var(--color-error)" : "var(--color-secondary)",
                  }}
                />
                <span className="text-on-surface-variant/50 text-xs">{statusText}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Theme toggle — utility, lives in footer */}
            <button
              onClick={onToggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container press-scale flex h-11 w-11 items-center justify-center rounded-lg transition-all"
            >
              {isDark ? SUN_ICON : MOON_ICON}
            </button>

            {/* New brain */}
            <button
              onClick={onShowCreateBrain}
              aria-label="Create new brain"
              className="text-on-surface-variant hover:text-primary hover:bg-surface-container press-scale flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New brain
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
