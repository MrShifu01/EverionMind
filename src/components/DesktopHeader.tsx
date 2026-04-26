import { useState, useEffect } from "react";
import type { AppNotification } from "../hooks/useNotifications";
import NotificationBell from "./NotificationBell";

interface DesktopHeaderProps {
  searchInput: string;
  onSearchChange: (v: string) => void;
  onNavigate: (id: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  notifications?: AppNotification[];
  unreadCount?: number;
  onDismissNotification?: (id: string) => void;
  onMarkNotificationRead?: (id: string) => void;
  onDismissAllNotifications?: () => void;
  onAcceptMerge?: (n: AppNotification) => void;
}

const SUN_ICON = (
  <svg
    aria-hidden="true"
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
);
const MOON_ICON = (
  <svg
    aria-hidden="true"
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
);
const SEARCH_ICON = (
  <svg
    aria-hidden="true"
    width="14"
    height="14"
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

import { getCachedEmail } from "../lib/userEmailCache";

function readCachedEmail(): string {
  if (typeof window === "undefined") return "";
  return getCachedEmail();
}

export default function DesktopHeader({
  searchInput,
  onSearchChange,
  onNavigate,
  isDark,
  onToggleTheme,
  notifications = [],
  unreadCount = 0,
  onDismissNotification,
  onMarkNotificationRead,
  onDismissAllNotifications,
  onAcceptMerge,
}: DesktopHeaderProps) {
  const [email, setEmail] = useState(readCachedEmail);

  // Email is cached lazily by SettingsView/AccountTab. Re-read on mount in
  // case the user signed in mid-session and the initial render captured "".
  useEffect(() => {
    const e = readCachedEmail();
    if (e && e !== email) setEmail(e);
  }, [email]);

  const initial = email ? email[0]!.toUpperCase() : "·";
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header
      className="hidden lg:flex sticky top-0 z-30"
      style={{
        height: 60,
        alignItems: "center",
        gap: 16,
        padding: "0 28px",
        background: "color-mix(in oklch, var(--bg) 92%, transparent)",
        backdropFilter: "saturate(140%) blur(12px)",
        WebkitBackdropFilter: "saturate(140%) blur(12px)",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      {/* Search — opens OmniSearch on Cmd/Ctrl+K, also feeds the memory grid
          filter (same wiring as the old sidebar search). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 36,
          flex: "1 1 auto",
          maxWidth: 520,
          padding: "0 10px 0 12px",
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
          color: "var(--ink-faint)",
          transition: "border-color 180ms",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "color-mix(in oklch, var(--ember) 35%, var(--line-soft))")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line-soft)")}
      >
        {SEARCH_ICON}
        {/* Honeypot inputs absorb Chrome's eager username/password autofill
            before it reaches the real search field. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: "absolute", left: -10000, width: 1, height: 1, opacity: 0 }}
        />
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: "absolute", left: -10000, width: 1, height: 1, opacity: 0 }}
        />
        <input
          type="search"
          name="everion-header-q"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+K opens the global OmniSearch overlay even when this
            // input has focus, matching the global shortcut.
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
              e.preventDefault();
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
              );
            }
          }}
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
        {searchInput ? (
          <button
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ink-faint)",
              padding: 0,
              lineHeight: 1,
              fontSize: 16,
            }}
          >
            ×
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            style={{
              fontFamily: "var(--f-sans)",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--ink-ghost)",
              background: "var(--surface-low)",
              border: "1px solid var(--line-soft)",
              borderRadius: 4,
              padding: "2px 6px",
              lineHeight: 1,
            }}
          >
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right cluster — notifications, theme, profile */}
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

        <button
          onClick={onToggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="press"
          style={{
            width: 36,
            height: 36,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            color: "var(--ink-soft)",
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
        >
          {isDark ? SUN_ICON : MOON_ICON}
        </button>

        <button
          onClick={() => onNavigate("settings")}
          aria-label={email ? `Account — ${email}` : "Account"}
          title={email || "Account"}
          className="press"
          style={{
            marginLeft: 6,
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--ember-wash)",
            color: "var(--ember)",
            border: "1px solid color-mix(in oklch, var(--ember) 28%, transparent)",
            cursor: "pointer",
            fontFamily: "var(--f-sans)",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.02em",
            lineHeight: 1,
          }}
        >
          {initial}
        </button>
      </div>
    </header>
  );
}
