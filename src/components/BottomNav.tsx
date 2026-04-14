import { memo } from "react";
import { cn } from "../lib/cn";
import { NavIcon } from "./icons/NavIcons";

const NAV_ITEMS = [
  { id: "feed", label: "Feed", icon: NavIcon.feed },
  { id: "_capture_fab", label: "Capture", isFAB: true, icon: NavIcon.add },
  { id: "chat", label: "Ask", icon: NavIcon.chat },
  { id: "grid", label: "Memory", icon: NavIcon.grid },
  { id: "settings", label: "Settings", icon: NavIcon.settings },
];

interface BottomNavProps {
  activeView: string;
  onNavigate: (id: string) => void;
  onCapture: () => void;
}

function BottomNavInner({ activeView, onNavigate, onCapture }: BottomNavProps) {
  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-5 left-1/2 z-50 flex w-[92vw] max-w-sm -translate-x-1/2 items-center justify-around rounded-full border px-3 py-2 lg:hidden"
      style={{
        background: "var(--color-surface-container-low)",
        borderColor: "var(--color-outline-variant)",
        boxShadow: "var(--shadow-lg)",
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
              className="press-scale flex h-14 w-14 flex-col items-center justify-center rounded-full transition-colors duration-150"
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
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
            className={cn(
              "press-scale relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full transition-all duration-200",
              isActive ? "text-primary" : "text-on-surface-variant",
            )}
            style={isActive ? { background: "var(--color-primary-container)" } : undefined}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default memo(BottomNavInner);
