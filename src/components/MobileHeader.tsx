import { useEffect, type ReactNode } from "react";
import type { AppNotification } from "../hooks/useNotifications";
import NotificationBell from "./NotificationBell";
import BrainSwitcher from "./BrainSwitcher";
import { isFeatureEnabled } from "../lib/featureFlags";
import { useAdminDevMode } from "../hooks/useAdminDevMode";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface MobileHeaderProps {
  onToggleTheme: () => void;
  isDark: boolean;
  isOnline: boolean;
  pendingCount: number;
  onSearch?: () => void;
  onOpenMenu?: () => void;
  onNavigate?: (id: string) => void;
  children?: ReactNode;
  notifications?: AppNotification[];
  unreadCount?: number;
  onDismissNotification?: (id: string) => void;
  onMarkNotificationRead?: (id: string) => void;
  onDismissAllNotifications?: () => void;
  onAcceptMerge?: (n: AppNotification) => void;
}

export default function MobileHeader({
  onToggleTheme: _onToggleTheme,
  isDark: _isDark,
  isOnline: _isOnline,
  pendingCount: _pendingCount,
  onSearch,
  onOpenMenu,
  onNavigate: _onNavigate,
  children,
  notifications = [],
  unreadCount = 0,
  onDismissNotification,
  onMarkNotificationRead,
  onDismissAllNotifications,
  onAcceptMerge,
}: MobileHeaderProps) {
  const { adminFlags } = useAdminDevMode();
  const showBrainSwitcher = isFeatureEnabled("multiBrain", adminFlags);

  // Publish the header's effective height as a CSS var so other sticky
  // bars (MemoryHeader's filter row, SettingsView's tabs nav) can use
  // it as their `top:` offset and sit flush below the header with no
  // overlap. Includes safe-area inset for notched phones; multibrain
  // widens the bar with the active-brain card beneath.
  useEffect(() => {
    const root = document.documentElement;
    const baseHeight = showBrainSwitcher ? 116 : 56;
    root.style.setProperty(
      "--app-header-h",
      `calc(${baseHeight}px + env(safe-area-inset-top, 0px))`,
    );
    return () => {
      root.style.removeProperty("--app-header-h");
    };
  }, [showBrainSwitcher]);

  return (
    <div
      className="safe-top sticky top-0 z-30 lg:hidden"
      style={{
        background: "var(--bg)",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      {/* Outer wrapper carries `.safe-top` (env(safe-area-inset-top)). Don't
          re-add it here — that double-counts the notch and pushes the brand
          ~60px below the safe area on devices with a sensor housing. */}
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        {/* Left: brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <img
            src="/logoNew.webp"
            width={28}
            height={28}
            alt=""
            aria-hidden="true"
            decoding="async"
            style={{ flexShrink: 0, objectFit: "contain", display: "block" }}
          />
          <span
            className="f-serif"
            style={{
              fontSize: 18,
              fontWeight: 450,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            Everion
          </span>
          {children}
        </div>

        {/* Right: notifications, search, menu */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          {onDismissNotification && (
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onDismiss={onDismissNotification}
              onMarkRead={onMarkNotificationRead ?? (() => {})}
              onDismissAll={onDismissAllNotifications ?? (() => {})}
              onAcceptMerge={onAcceptMerge ?? (() => {})}
            />
          )}
          {onSearch && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onSearch}
                  aria-label="Search"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <svg
                    width="18"
                    height="18"
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
                </Button>
              </TooltipTrigger>
              <TooltipContent>Search</TooltipContent>
            </Tooltip>
          )}
          {onOpenMenu && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onOpenMenu}
              aria-label="Menu"
              style={{ color: "var(--ink-soft)" }}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </Button>
          )}
        </div>
      </header>

      {showBrainSwitcher && (
        <div
          style={{
            padding: "0 14px 12px",
          }}
        >
          <BrainSwitcher cardMode />
        </div>
      )}
    </div>
  );
}
