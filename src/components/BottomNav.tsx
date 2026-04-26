import { memo } from "react";
import { NavIcon } from "./icons/NavIcons";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";

// 5 items, center is the capture FAB — matches the redesign's mobile bottom nav.
const NAV_ITEMS = [
  { id: "memory", label: "Memory", icon: NavIcon.grid },
  { id: "chat", label: "Chat", icon: NavIcon.chat },
  { id: "_capture_fab", label: "Add", isFAB: true, icon: NavIcon.add },
  { id: "todos", label: "Schedule", icon: NavIcon.todos },
  { id: "settings", label: "Settings", icon: NavIcon.settings },
];

interface BottomNavProps {
  activeView: string;
  onNavigate: (id: string) => void;
  onCapture: () => void;
}

function BottomNavInner({ activeView, onNavigate, onCapture }: BottomNavProps) {
  const keyboardVisible = useKeyboardVisible();
  if (keyboardVisible) return null;
  return (
    <nav
      aria-label="Primary navigation"
      className="bottom-nav-mobile"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        alignItems: "center",
        justifyContent: "space-around",
        background: "var(--surface-low)",
        borderTop: "1px solid var(--line-soft)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        height: "calc(56px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = activeView === item.id;

        if (item.isFAB) {
          return (
            <button
              key={item.id}
              onClick={onCapture}
              aria-label="New entry"
              className="press"
              style={{
                width: 56,
                height: 56,
                minHeight: 56,
                marginTop: -28,
                flexShrink: 0,
                borderRadius: "50%",
                background: "var(--ember)",
                color: "var(--ember-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "var(--lift-2)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {item.icon}
            </button>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className="press"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              minHeight: 48,
              flex: 1,
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: isActive ? "var(--ember)" : "var(--ink-faint)",
              transition: "color 180ms",
            }}
          >
            <span style={{ display: "flex", alignItems: "center" }}>{item.icon}</span>
            <span
              className="f-sans"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: isActive ? "var(--ember)" : "var(--ink-faint)",
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default memo(BottomNavInner);
