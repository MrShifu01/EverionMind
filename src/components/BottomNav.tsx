import { memo } from "react";
import { cn } from "../lib/cn";
import { NavIcon } from "./icons/NavIcons";

const NAV_ITEMS = [
  { id: "capture", label: "Home", icon: NavIcon.capture },
  { id: "refine", label: "Improve", icon: NavIcon.refine },
  { id: "_capture_fab", label: "Capture", isFAB: true, icon: NavIcon.add },
  { id: "chat", label: "Ask", icon: NavIcon.chat },
  { id: "more", label: "More", icon: NavIcon.more },
];

const MORE_IDS = new Set(["vault", "settings", "grid", "todos", "timeline"]);

interface BottomNavProps {
  activeView: string;
  onNavigate: (id: string) => void;
  onCapture: () => void;
  refineBadge?: number;
}

function BottomNavInner({ activeView, onNavigate, onCapture, refineBadge }: BottomNavProps) {
  const isMoreActive = MORE_IDS.has(activeView);

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
        const isActive = item.id === "more" ? isMoreActive : activeView === item.id;

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
            {item.id === "refine" && refineBadge && refineBadge > 0 ? (
              <span
                className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                style={{ background: "var(--color-error)", color: "var(--color-on-error)" }}
              >
                {refineBadge > 9 ? "9+" : refineBadge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default memo(BottomNavInner);
