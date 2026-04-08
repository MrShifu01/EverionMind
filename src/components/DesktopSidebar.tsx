import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface NavView {
  id: string;
  l: string;
  ic: string;
}

const NAV_ICONS: Record<string, ReactNode> = {
  capture: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  grid: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  suggest: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  ),
  refine: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  todos: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  timeline: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  vault: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  chat: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const MOON_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
  </svg>
);

const SUN_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
  </svg>
);

const CAPTURE_NAV: NavView = { id: "capture", l: "Home", ic: "⌂" };

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
        "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 group press-scale",
        isActive
          ? "font-semibold"
          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
      )}
      style={
        isActive
          ? {
              background: "oklch(from var(--color-primary) l c h / 0.08)",
              color: "var(--color-primary)",
            }
          : undefined
      }
    >
      <span className={cn("transition-colors", isActive ? "text-inherit" : "text-inherit group-hover:text-on-surface")}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-[10px] bg-secondary text-on-secondary px-1.5 py-0.5 rounded-full font-semibold">
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
  isDark,
  onToggleTheme,
  isOnline,
  pendingCount,
  entryCount,
  onShowCreateBrain,
  navViews,
  children,
}: DesktopSidebarProps) {
  const allItems = [CAPTURE_NAV, ...navViews];

  const statusText = isOnline
    ? pendingCount > 0
      ? `Syncing ${pendingCount}…`
      : `${entryCount} synced`
    : "Offline";

  return (
    <aside
      className="hidden lg:flex fixed left-0 top-0 h-dvh z-40 flex-col w-72 px-4 py-6 border-r"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      {/* ── Brand row ── */}
      <div className="mb-6 px-2">
        <h1
          className="font-bold tracking-tight text-2xl text-primary"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          Everion
        </h1>
        <p className="text-xs text-on-surface-variant/50 mt-0.5">
          Own Your Intelligence
        </p>
      </div>

      {/* ── Brain Switcher slot ── */}
      {children && (
        <div className="mb-4 px-2">
          {children}
        </div>
      )}

      {/* ── New Entry CTA ── */}
      <button
        onClick={() => onNavigate("capture")}
        className="mx-2 mt-1 mb-8 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm press-scale text-on-primary bg-primary hover:bg-primary-dim transition-colors duration-150"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
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
        className="pt-4 mt-4 space-y-1"
        style={{ borderTop: "1px solid var(--color-outline-variant)" }}
      >
        <NavItem
          id="settings"
          label="Settings"
          isActive={view === "settings"}
          onClick={() => onNavigate("settings")}
        />

        {/* Status row: online dot + count + theme toggle + new brain */}
        <div className="px-4 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: isOnline ? "var(--color-secondary)" : "var(--color-error)" }}
            />
            <span className="text-xs text-on-surface-variant/50">
              {statusText}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Theme toggle — utility, lives in footer */}
            <button
              onClick={onToggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all press-scale"
            >
              {isDark ? SUN_ICON : MOON_ICON}
            </button>

            {/* New brain */}
            <button
              onClick={onShowCreateBrain}
              aria-label="Create new brain"
              className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-primary hover:bg-surface-container transition-all press-scale min-h-[36px] px-2.5 rounded-lg"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
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
