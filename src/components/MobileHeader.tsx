import { useEffect, type ReactNode } from "react";
import type { AppNotification } from "../hooks/useNotifications";
import NotificationBell from "./NotificationBell";
import InkwellBrainPill from "./InkwellBrainPill";

interface MobileHeaderProps {
  onToggleTheme: () => void;
  isDark: boolean;
  isOnline: boolean;
  pendingCount: number;
  onSearch?: () => void;
  onOpenMenu?: () => void;
  onNavigate?: (id: string) => void;
  onCreateBrain?: () => void;
  children?: ReactNode;
  notifications?: AppNotification[];
  unreadCount?: number;
  onDismissNotification?: (id: string) => void;
  onMarkNotificationRead?: (id: string) => void;
  onDismissAllNotifications?: () => void;
  onAcceptMerge?: (n: AppNotification) => void;
}

/**
 * Global mobile header — matches the inkwell aesthetic so every view
 * reads the same as the home view. Layout: burger LEFT, logo + serif
 * "Everion Mind" wordmark, search + bell RIGHT. Compact brain pill in
 * a second row below. All buttons are transparent — no boxed bg.
 */
export default function MobileHeader({
  onToggleTheme: _onToggleTheme,
  isDark: _isDark,
  isOnline: _isOnline,
  pendingCount: _pendingCount,
  onSearch,
  onOpenMenu,
  onNavigate,
  onCreateBrain,
  children,
  notifications = [],
  unreadCount = 0,
  onDismissNotification,
  onMarkNotificationRead,
  onDismissAllNotifications,
  onAcceptMerge,
}: MobileHeaderProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-header-h", `calc(108px + env(safe-area-inset-top, 0px))`);
    return () => {
      root.style.removeProperty("--app-header-h");
    };
  }, []);

  return (
    <div
      className="safe-top sticky top-0 z-30 lg:hidden"
      style={{
        background: "var(--bg)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px 4px",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => onNavigate?.("home")}
            aria-label="Go to home"
            className="press"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 0,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              minWidth: 0,
              textAlign: "left",
            }}
          >
            <img
              src="/logoNew.webp"
              width={28}
              height={28}
              alt=""
              aria-hidden
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
                whiteSpace: "nowrap",
              }}
            >
              Everion Mind
            </span>
          </button>
          {children}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {onSearch && (
            <button
              type="button"
              onClick={onSearch}
              aria-label="Search"
              className="press"
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "transparent",
                border: "none",
                color: "var(--ink-soft)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          )}
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
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Menu"
              className="press"
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "transparent",
                border: "none",
                color: "var(--ink-soft)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div style={{ padding: "0 16px 10px" }}>
        <InkwellBrainPill onCreateBrain={onCreateBrain} />
      </div>
    </div>
  );
}
