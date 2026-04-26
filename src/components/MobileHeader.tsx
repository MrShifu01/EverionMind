import type { ReactNode } from "react";
import type { AppNotification } from "../hooks/useNotifications";
import NotificationBell from "./NotificationBell";

interface MobileHeaderProps {
  onToggleTheme: () => void;
  isDark: boolean;
  isOnline: boolean;
  pendingCount: number;
  onSearch?: () => void;
  children?: ReactNode;
  notifications?: AppNotification[];
  unreadCount?: number;
  onDismissNotification?: (id: string) => void;
  onMarkNotificationRead?: (id: string) => void;
  onDismissAllNotifications?: () => void;
  onAcceptMerge?: (n: AppNotification) => void;
}

export default function MobileHeader({
  onToggleTheme,
  isDark,
  isOnline: _isOnline,
  pendingCount: _pendingCount,
  onSearch,
  children,
  notifications = [],
  unreadCount = 0,
  onDismissNotification,
  onMarkNotificationRead,
  onDismissAllNotifications,
  onAcceptMerge,
}: MobileHeaderProps) {
  return (
    <header
      className="safe-top sticky top-0 z-30 flex items-center justify-between gap-2 px-4 py-3 lg:hidden"
      style={{
        background: "var(--bg)",
        borderBottom: "1px solid var(--line-soft)",
        paddingTop: "max(14px, env(safe-area-inset-top))",
      }}
    >
      {/* Left: brand + brain */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        <svg
          width={16}
          height={16}
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
          style={{ fontSize: 17, fontWeight: 450, letterSpacing: "-0.01em", color: "var(--ink)" }}
        >
          Everion
        </span>
        {children}
      </div>

      {/* Right: notifications, search, theme */}
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
          <button
            onClick={onSearch}
            aria-label="Search"
            className="press"
            style={{
              width: 36,
              height: 36,
              minHeight: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              color: "var(--ink-soft)",
              background: "transparent",
              border: 0,
            }}
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
          </button>
        )}
        <button
          onClick={onToggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="press"
          style={{
            width: 36,
            height: 36,
            minHeight: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            color: "var(--ink-soft)",
            background: "transparent",
            border: 0,
          }}
        >
          {isDark ? (
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
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
            </svg>
          ) : (
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
              <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
