import { memo } from "react";
import { NavIcon } from "./icons/NavIcons";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";

const NAV_ITEMS = [
  { id: "memory", label: "Memory", icon: NavIcon.grid },
  { id: "chat", label: "Chat", icon: NavIcon.chat },
  { id: "_capture_fab", label: "Add", isFAB: true, icon: NavIcon.add },
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
      className="glass-panel-dark nav-glow safe-bottom"
      style={{
        position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex", alignItems: "center", gap: 4,
        padding: "8px 10px",
        width: "min(92vw, 420px)",
        borderRadius: 999,
        border: "1px solid var(--color-outline-variant)",
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
              className="press cta-glow"
              style={{
                flex: "0 0 auto", width: 52, height: 52, marginTop: -18,
                borderRadius: 18,
                background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-container))",
                color: "var(--color-on-primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", cursor: "pointer",
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
              flex: 1,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "6px 4px",
              borderRadius: 14,
              border: "none", cursor: "pointer",
              color: isActive ? "var(--color-secondary)" : "var(--color-on-surface-variant)",
              background: isActive ? "oklch(74% 0.2 305 / 0.12)" : "transparent",
              transition: "all 0.2s",
            }}
          >
            <span style={{ display: "flex", alignItems: "center" }}>{item.icon}</span>
            <span style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600, marginTop: 3 }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default memo(BottomNavInner);
